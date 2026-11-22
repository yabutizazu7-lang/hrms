// Employee-register reconciliation (the supplied "205 employees" workbook).
//   node src/import-register.js --file "<xlsx>"                preview only: writes NOTHING to the database, prints a summary and a masked report
//   node src/import-register.js --file "<xlsx>" --apply        transactional reconcile (insert new, fill EMPTY fields of matched employees, never overwrite)
//   node src/import-register.js --rollback <batchId>          undo a batch where it is safe (inserted employees without other records; filled fields still unchanged)
// Options: --report <csv>  --with-salary (also import the salary column; off by default)
//          --create-org (also create the register's departments and job titles when they do not exist yet; without it only EXISTING ones are linked)
// Rules: no identifier is invented (the register has NO permanent position number column -> every employee is flagged "position number missing");
//        Fayda numbers are stored as text only; repeated / short numbers are stored as "pending verification" and flagged, never merged or dropped.
require('./env');
const ExcelJS = require('exceljs'), fs = require('fs'), { pool } = require('./db'), IDS = require('./ids'), U = require('./util');
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

// Ethiopian calendar -> Gregorian (JDN based; 13 months, Pagume 1-5/6)
const ethToGreg = (y, m, d) => {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 13 && d >= 1 && d <= (m === 13 ? 6 : 30))) return null;
  if (m === 13 && d === 6 && (y + 1) % 4 !== 0) return null;
  const jdn = 1723856 + 365 * y + Math.floor(y / 4) + 30 * m + d - 31; // verified: Meskerem 1, 2018 EC = 2025-09-11
  const a = jdn + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), dd = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * dd / 4), mm = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * mm + 2) / 5) + 1, month = mm + 3 - 12 * Math.floor(mm / 10), year = 100 * b + dd - 4800 + Math.floor(mm / 10);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
// Dates in the register are ETHIOPIAN. Text "d/m/yyyy" is converted directly.
// Spreadsheet serials: the register was typed as d/m/yyyy, and Excel (US locale) turned every entry whose day was <= 12 into a serial by reading it as m/d/yyyy,
// i.e. serial month = Ethiopian DAY, serial day = Ethiopian MONTH, serial year = Ethiopian YEAR (evidence: all 96 serial hire dates have a "day" <= 12 and a "year" equal to
// the Ethiopian year implied by the service length; every text date has a first number >= 13). So a serial is decoded with day and month swapped, NOT read as Gregorian.
// A date with a lost "/" ("1/42005") is repaired only when the last four digits are the year. Everything converted or repaired is flagged for HR; nothing else is guessed.
function parseDate(v, issues, field) {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') {
    const dt = v instanceof Date ? v : new Date(Math.round((v - 25569) * 86400000)); if (isNaN(dt)) return null;
    const g = ethToGreg(dt.getUTCFullYear(), dt.getUTCDate(), dt.getUTCMonth() + 1);   // Ethiopian month = serial day, Ethiopian day = serial month
    if (!g) { issues.push(`${field}: spreadsheet date cannot be read as an Ethiopian date (${dt.toISOString().slice(0, 10)}) - verify`); return null; }
    issues.push(`${field}: spreadsheet date decoded as Ethiopian (Excel had swapped day and month) - verify`); return g;
  }
  let t = String(v).trim(), repaired = false, m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) { const r = /^(\d{1,2})\/(\d{1,2})(\d{4})$/.exec(t); if (r) { m = r; repaired = true; } }
  if (!m) { issues.push(`${field}: unreadable date "${t.slice(0, 20)}"`); return null; }
  const g = ethToGreg(+m[3], +m[2], +m[1]); if (!g) { issues.push(`${field}: invalid Ethiopian date`); return null; }
  issues.push(`${field}: ${repaired ? 'missing "/" repaired and ' : ''}converted from the Ethiopian calendar - verify`); return g;
}
const split = (full) => { const p = String(full || '').trim().split(/\s+/); return { first: p[0], father: p[1] || '', grand: p.length > 2 ? p.slice(2).join(' ') : null }; };
const SEX = { 'ወ': 'male', 'ሴ': 'female' }, MAR = { 'ያገባ': 'married', 'ያገባች': 'married', 'ያላገባ': 'single', 'ያላገባች': 'single', 'አግብቶ የፈታ': 'divorced', 'አግብታ የፈታች': 'divorced' }, sp1 = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();

const keep = (x) => { const t = String(x ?? '').trim(); return t === '' ? null : t; };   // trimmed only: spelling, inner spaces and Ethiopic characters stay exactly as written
const tick = (x) => /^[√✓✔xX]$/.test(String(x ?? '').trim()) || x === true;
const CONTRACT = /ኮንትራት|ኮንትራክት|ውል/;
const penOf = (r) => { const t = sp1(r.pension); return t && !/^(የለም|የለውም)$/.test(t) ? t : null; };   // "የለም" = "none": it is NOT a pension number
const notesFor = (r) => { const l = [`Register import (Nehase 2018 register, row ${r.no})`]; if (sp1(r.name_en)) l.push(`English name: ${sp1(r.name_en)}`); const ed = [sp1(r.edu), sp1(r.edu_level)].filter(Boolean).join(' - '); if (ed) l.push(`Education (register): ${ed}`); if (sp1(r.training)) l.push(`Long-term training (register): ${sp1(r.training)}`); return l.join('\n'); };
async function readRegister(file) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); const ws = wb.worksheets[0], rows = [];
  ws.eachRow((row, n) => { const v = (i) => { const c = row.getCell(i + 1).value; return c && typeof c === 'object' && !(c instanceof Date) ? (c.result ?? c.text ?? null) : c; }; const no = v(0); if (n >= 16 && /^\d+$/.test(String(no ?? '').trim()) && v(2)) rows.push({ n, no: Number(no), fan: v(1), name_am: String(v(2)).trim(), name_en: v(3), sex: v(4), unit: v(5), dir: v(6), pension: v(7), dob: v(8), ethnic: v(9), edu: v(10), edu_level: v(11), hire: v(12), prev_svc: v(13), inst_svc: v(14), total_svc: v(15), marital: v(16), child1: v(17), child2: v(18), title: v(19), grade: v(20), salary: v(21), newhire: v(22), promoted: v(23), disability: v(24), training: v(25), type: v(26) }); });
  return rows;
}
async function plan(c, rows, withSalary, opts = {}) {
  const out = [], seenFan = new Map(), seenPen = new Map(), kk = new Set(), uniq = rows.filter((r) => { const k = (String(r.fan ?? '').trim() || '-') + '|' + r.name_am; if (kk.has(k)) return false; kk.add(k); return true; });   // identical repeat rows count once
  for (const r of uniq) { const f = String(r.fan ?? '').replace(/\s/g, ''); if (f) seenFan.set(f, (seenFan.get(f) || 0) + 1); const p = penOf(r); if (p) seenPen.set(p, (seenPen.get(p) || 0) + 1); }
  const seenName = new Map(); for (const r of uniq) seenName.set(r.name_am, (seenName.get(r.name_am) || 0) + 1);
  const seenKey = new Set();
  for (const r of rows) {
    const issues = [], fan = String(r.fan ?? '').replace(/[\s-]/g, '') || null, pen = penOf(r), nm = split(r.name_am), sex = SEX[String(r.sex || '').trim()] || null;
    const key = (String(r.fan ?? '').trim() || '-') + '|' + r.name_am; if (seenKey.has(key)) { out.push({ r, action: 'skip', issues: ['identical row repeated in the register - skipped'] }); continue; } seenKey.add(key);
    if (!nm.first || !nm.father) issues.push('name needs at least first and father name'); if (!sex) issues.push('sex missing or unreadable');
    const hire = parseDate(r.hire, issues, 'hire date'), dob = parseDate(r.dob, issues, 'date of birth');
    if (hire && dob && Number(hire.slice(0, 4)) - Number(dob.slice(0, 4)) < 14) issues.push('hire date is less than 14 years after the date of birth - check both dates');
    if (/ጊዜዊ/.test(String(r.type ?? ''))) issues.push('employment type reads "permanent / temporary assignment" - verify');
    const org = { dept: sp1(r.dir) || null, title: sp1(r.title) || null, grade: sp1(r.grade) || null, deptId: null, posId: null };
    if (org.dept) org.deptId = (await c.query('SELECT id FROM departments WHERE lower(name)=lower($1) ORDER BY id LIMIT 1', [org.dept])).rows[0]?.id ?? null;
    if (org.title) org.posId = (await c.query("SELECT id FROM positions WHERE lower(title)=lower($1) AND coalesce(grade,'')=coalesce($2,'') ORDER BY id LIMIT 1", [org.title, org.grade])).rows[0]?.id ?? null;
    if (fan && !IDS.fanWellFormed(fan)) issues.push('Fayda number is not 16 digits'); if (!fan) issues.push('Fayda number missing'); if (fan && seenFan.get(fan) > 1) issues.push('Fayda number repeated in the register');
    if (pen && seenPen.get(pen) > 1) issues.push('pension number repeated in the register'); issues.push('permanent staff position number missing in the register');
    let m = null;   // matching order: Fayda -> pension number -> exact name (only when unique)
    if (fan && seenFan.get(fan) === 1) m = (await c.query('SELECT * FROM employees WHERE fayda_fan=$1', [fan])).rows;
    if ((!m || !m.length) && pen && seenPen.get(pen) === 1) m = (await c.query('SELECT * FROM employees WHERE pension_no=$1', [pen])).rows;
    if ((!m || !m.length) && seenName.get(r.name_am) === 1) m = (await c.query("SELECT * FROM employees WHERE lower(full_name)=lower($1)", [`${nm.first} ${nm.father}${nm.grand ? ' ' + nm.grand : ''}`])).rows;
    const fatal = issues.some((i) => /^name needs|^sex missing/.test(i)) || (!hire && !(m && m.length));
    if (fatal) { if (!hire) issues.push('hire date missing - a new employee cannot be created without it'); out.push({ r, action: 'fail', issues }); continue; }
    if (m && m.length > 1) { issues.push('more than one existing employee matches'); out.push({ r, action: 'skip', issues }); continue; }
    const c1 = parseDate(r.child1, issues, 'first child date of birth'), c2 = parseDate(r.child2, issues, 'second child date of birth'), isContract = CONTRACT.test(String(r.type ?? ''));
    if (isContract) issues.push('contract employee - the contract end date is not in the register, add it');
    const want = { register_no: r.no, full_name_am: keep(r.name_am), full_name_en: keep(r.name_en), first_name: nm.first, father_name: nm.father, grandfather_name: nm.grand, sex, date_of_birth: dob, hire_date: hire, pension_no: pen, marital_status: MAR[sp1(r.marital)] || null, employment_type: isContract ? 'contract' : 'permanent', department_id: org.deptId, position_id: org.posId,
      workplace: keep(r.unit), ethnicity: keep(r.ethnic), education_field: keep(r.edu), education_level: keep(r.edu_level), prior_service_text: keep(r.prev_svc), institution_service_text: keep(r.inst_svc), total_service_text: keep(r.total_svc), child1_dob: c1, child2_dob: c2,
      jeg_title: keep(r.title), job_grade: keep(r.grade), newly_hired_fy: tick(r.newhire) ? true : null, promoted_fy: tick(r.promoted) ? true : null, disability: keep(r.disability), long_term_training: keep(r.training), notes: notesFor(r) };
    if (m && m.length === 1 && want.register_no != null && m[0].register_no !== want.register_no) { const used = (await c.query('SELECT 1 FROM employees WHERE register_no=$1 AND id<>$2', [want.register_no, m[0].id])).rows[0]; if (used) { issues.push('register number is already used by another employee - not set'); delete want.register_no; } }
    if ((!m || !m.length) && (await c.query('SELECT 1 FROM employees WHERE register_no=$1', [want.register_no])).rows[0]) { issues.push('register number is already used by another employee - not set'); delete want.register_no; }
    if (sp1(r.marital) && !MAR[sp1(r.marital)]) issues.push('marital status not recognised - left empty');
    if (withSalary && Number(r.salary) > 0) want.basic_salary = Number(r.salary);
    if (m && m.length === 1) { const cur = m[0], fill = {};
      // a value that is already in the system and differs from the register is NEVER overwritten; it is reported (without the values) for HR to decide
      const same = (a, b) => (a instanceof Date ? a.toISOString().slice(0, 10) : String(a).trim()) === (b instanceof Date ? b.toISOString().slice(0, 10) : String(b).trim());
      for (const k of ['sex', 'date_of_birth', 'hire_date', 'pension_no', 'marital_status', 'full_name_am', 'full_name_en', 'workplace', 'ethnicity', 'education_field', 'education_level', 'prior_service_text', 'institution_service_text', 'total_service_text', 'child1_dob', 'child2_dob', 'jeg_title', 'job_grade', 'disability', 'long_term_training']) if (want[k] != null && cur[k] != null && cur[k] !== '' && !same(cur[k], want[k])) issues.push(`conflict: ${k} differs from the register - the existing value was kept`);
      if (withSalary && want.basic_salary != null && cur.basic_salary != null && Number(cur.basic_salary) > 0 && Number(cur.basic_salary) !== Number(want.basic_salary)) issues.push('conflict: basic_salary differs from the register - the existing value was kept'); for (const [k, v] of Object.entries(want)) if (v != null && (typeof v === 'boolean' ? cur[k] === false : (cur[k] == null || cur[k] === '' || (k === 'basic_salary' && Number(cur[k]) === 0))) && k !== 'employment_type') fill[k] = v; if (fan && !cur.fayda_fan) fill.fayda_fan = fan; out.push({ r, action: Object.keys(fill).length ? 'update' : 'skip', employee: cur, fill, fan, org, want, issues: Object.keys(fill).length ? issues : [...issues, 'already up to date'] }); }
    else out.push({ r, action: 'insert', want, fan, org, issues });
  }
  return out;
}
const count = (p, a) => p.filter((x) => x.action === a).length;
// Departments / job titles: link to EXISTING rows by name; create the missing ones only with --create-org (no salary range is invented: min/max stay empty).
async function resolveOrg(c, x, create, cache) {
  const o = x.org; if (!o) return; let did = o.deptId, pid = o.posId;
  if (!did && o.dept && create) {
    did = cache.d.get(o.dept.toLowerCase());
    if (!did) { let n = 1, code; for (;; n++) { code = 'D' + U.pad(n, 3); if (!(await c.query('SELECT 1 FROM departments WHERE code=$1', [code])).rows.length) break; } did = (await c.query('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [code, o.dept])).rows[0].id; cache.d.set(o.dept.toLowerCase(), did); cache.newDepts++; }
  }
  if (!pid && o.title && create) {
    const k = (o.title + '|' + (o.grade || '')).toLowerCase(); pid = cache.p.get(k);
    if (!pid) { let n = 1, code; for (;; n++) { code = 'P' + U.pad(n, 4); if (!(await c.query('SELECT 1 FROM positions WHERE code=$1', [code])).rows.length) break; } pid = (await c.query('INSERT INTO positions(code,title,grade) VALUES($1,$2,$3) RETURNING id', [code, o.title, o.grade])).rows[0].id; cache.p.set(k, pid); cache.newPos++; }
  }
  if (x.action === 'insert') { if (did) x.want.department_id = did; if (pid) x.want.position_id = pid; }
  else if (x.action === 'update') { if (did && !x.employee.department_id) x.fill.department_id = did; if (pid && !x.employee.position_id) x.fill.position_id = pid; }
}
// Undo a batch where it is safe: inserted employees without other records are removed, filled fields that are still unchanged are emptied again. Nothing else is touched.
async function rollbackBatch(id) {
  id = Number(id);
  const c = await pool.connect(); try {
    await c.query('BEGIN'); const b = (await c.query('SELECT * FROM import_batches WHERE id=$1 AND mode=$2 FOR UPDATE', [id, 'apply'])).rows[0]; if (!b) throw new Error('No such applied batch'); if (b.rolled_back_at) throw new Error('Already rolled back');
    let del = 0, restored = 0, kept = 0;
    for (const row of (await c.query('SELECT * FROM import_rows WHERE batch_id=$1 ORDER BY id DESC', [id])).rows) {
      if (row.action === 'insert' && row.employee_id) {
        const dep = (await c.query(`SELECT (SELECT count(*) FROM leave_requests WHERE employee_id=$1)+(SELECT count(*) FROM attendance WHERE employee_id=$1)+(SELECT count(*) FROM hr_cases WHERE employee_id=$1)+(SELECT count(*) FROM users WHERE employee_id=$1)+(SELECT count(*) FROM trainings WHERE employee_id=$1)+(SELECT count(*) FROM employee_documents WHERE employee_id=$1)+(SELECT count(*) FROM employee_history WHERE employee_id=$1)+(SELECT count(*) FROM ppe_issues WHERE employee_id=$1) AS n`, [row.employee_id])).rows[0].n;
        if (Number(dep) > 0) { kept++; continue; } await c.query('DELETE FROM employees WHERE id=$1', [row.employee_id]); del++;
      } else if (row.action === 'update' && row.before) {
        const cur = (await c.query('SELECT * FROM employees WHERE id=$1', [row.employee_id])).rows[0]; if (!cur) continue; const sets = [], p = [row.employee_id];
        for (const [k, v] of Object.entries(row.before.filled || {})) if (String(cur[k] instanceof Date ? cur[k].toISOString().slice(0, 10) : cur[k]) === String(v)) sets.push(`${k}=$${p.push(typeof v === 'boolean' ? false : k === 'basic_salary' ? 0 : null)}`);
        if (sets.length) { await c.query(`UPDATE employees SET ${sets.join(',')} WHERE id=$1`, p); restored++; }
      }
    }
    await c.query('UPDATE import_batches SET rolled_back_at=now() WHERE id=$1', [id]); await c.query('COMMIT'); return { del, restored, kept, text: `Rolled back batch ${id}: ${del} inserted employees removed, ${restored} updated employees restored, ${kept} kept because they already have other records.` };
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function main() {
  const rb = arg('--rollback');
  if (rb) { const r = await rollbackBatch(rb); console.log(r.text); return; }
  const file = arg('--file'); if (!file || file === true || !fs.existsSync(file)) throw new Error('Give the register with --file "<path to .xlsx>"');
  const apply = !!arg('--apply'), withSalary = !!arg('--with-salary'), createOrg = !!arg('--create-org');
  const { sum, p, missingDept, missingPos } = await runRegister({ file, apply, withSalary, createOrg });
    const rep = arg('--report'); if (rep && rep !== true) fs.writeFileSync(rep, '\uFEFFsource_row,action,issues\n' + p.map((x) => `${x.r.no},${x.action},"${x.issues.join('; ').replace(/"/g, "'")}"`).join('\n'));   // no names, no ID numbers in the report
    const tally = {}; for (const x of p) for (const i of x.issues) { const k = i.replace(/ - verify$/, ''); tally[k] = (tally[k] || 0) + 1; }
    console.log(apply ? 'APPLIED' : 'PREVIEW (nothing was written)', JSON.stringify(sum)); console.log(`Departments in the register not yet in the system: ${missingDept.size}; job titles (title+grade) not yet in the system: ${missingPos.size}${createOrg ? ' (will be / were created)' : ' (re-run with --create-org to create and link them; otherwise those employees are imported without department / position)'}`); console.log('Issues for HR verification:', JSON.stringify(tally, null, 1));
}
// One register run, used by the command line and by the import screen. Preview (apply=false) writes NOTHING; apply is ONE transaction (all rows or none).
async function runRegister({ file, apply = false, withSalary = false, createOrg = false, userId = null, sourceName = null }) {
  const rows = await readRegister(file), c = await pool.connect(), orgCache = { d: new Map(), p: new Map(), newDepts: 0, newPos: 0 };
  try {
    await c.query(apply ? 'BEGIN' : 'BEGIN READ ONLY'); const p = await plan(c, rows, withSalary);
    const missingDept = new Set(p.filter((x) => x.org?.dept && !x.org.deptId).map((x) => x.org.dept.toLowerCase())), missingPos = new Set(p.filter((x) => x.org?.title && !x.org.posId).map((x) => (x.org.title + '|' + (x.org.grade || '')).toLowerCase()));
    const sum = { source_rows: rows.length, insert: count(p, 'insert'), update: count(p, 'update'), skip: count(p, 'skip'), fail: count(p, 'fail') };
    if (apply) {
      const b = (await c.query('INSERT INTO import_batches(source_file,mode,inserted,updated,skipped,failed,by_user) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [sourceName || require('path').basename(file), 'apply', sum.insert, sum.update, sum.skip, sum.fail, userId])).rows[0].id;
      for (const x of p) {
        if (x.action === 'insert' || x.action === 'update') await resolveOrg(c, x, createOrg, orgCache);
        let empId = x.employee?.id ?? null, before = null;
        if (x.action === 'insert') {
          const w = x.want, no = 'EMP-' + U.pad(await U.nextNo(c, 'employee'), 5), cols = Object.keys(w).filter((k) => w[k] != null);
          empId = (await c.query(`INSERT INTO employees(employee_no,${cols}) VALUES($1,${cols.map((_, i) => '$' + (i + 2))}) RETURNING id`, [no, ...cols.map((k) => w[k])])).rows[0].id;
          // provenance lives in import_rows (not in employee_history, which is append-only) so that a batch stays reversible
          if (x.fan) await c.query('UPDATE employees SET fayda_fan=$2 WHERE id=$1', [empId, x.fan]);
        } else if (x.action === 'update') { const k = Object.keys(x.fill); await c.query(`UPDATE employees SET ${k.map((f, i) => `${f}=$${i + 2}`)},updated_at=now() WHERE id=$1`, [empId, ...k.map((f) => x.fill[f])]); before = { filled: Object.fromEntries(k.map((f) => [f, x.fill[f]])) }; }
        if (empId && x.fan) { const st = IDS.fanWellFormed(x.fan) && !x.issues.includes('Fayda number repeated in the register') ? 'pending_verification' : 'pending_verification'; await c.query("UPDATE employees SET fayda_status=$2 WHERE id=$1 AND fayda_fan=$3", [empId, st, x.fan]); }
        if (empId) for (const i of x.issues.filter((s) => !/^already up to date/.test(s))) await c.query('INSERT INTO verification_flags(employee_id,field,issue) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [empId, i.split(':')[0].slice(0, 40), i]);
        await c.query('INSERT INTO import_rows(batch_id,source_row,action,employee_id,issues,before) VALUES($1,$2,$3,$4,$5,$6)', [b, x.r.no, x.action, empId, x.issues, before]);
      }
      await c.query('COMMIT'); sum.batch_id = b; sum.departments_created = orgCache.newDepts; sum.positions_created = orgCache.newPos;
    } else await c.query('ROLLBACK');
    sum.duplicates = p.filter((x) => x.issues.some((i) => /repeated in the register|identical row repeated|more than one existing/.test(i))).length; sum.valid = p.filter((x) => x.action !== 'fail').length; sum.invalid = sum.fail;
    return { sum, p, rows, missingDept, missingPos, orgCache };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
if (require.main === module) main().then(() => pool.end()).catch((e) => { console.error('Import stopped:', e.message); process.exit(1); });
module.exports = { rollbackBatch, ethToGreg, parseDate, split, plan, readRegister, penOf, notesFor, runRegister, keep, tick };
