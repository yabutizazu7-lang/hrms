// Read-only check of an applied register import (changes NOTHING).
//   node src/verify-register.js --file "<register.xlsx>" [--batch <id>] [--with-salary]
// Compares every register row with the employee it created / matched: name parts, sex, hire date, date of birth, pension number, Fayda number,
// salary (with --with-salary), department, job title, and that the employee can be found by the same search the Employee list uses.
require('./env');
const fs = require('fs'), { pool } = require('./db'), R = require('./import-register');
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const sp = (x) => String(x ?? '').replace(/\s+/g, ' ').trim(), SEX = { 'ወ': 'male', 'ሴ': 'female' };
(async () => {
  const file = arg('--file'); if (!file || file === true || !fs.existsSync(file)) throw new Error('Give the register with --file "<path to .xlsx>"');
  const withSalary = !!arg('--with-salary'), rows = await R.readRegister(file);
  const b = arg('--batch') && arg('--batch') !== true ? Number(arg('--batch')) : (await pool.query("SELECT id FROM import_batches WHERE mode='apply' AND rolled_back_at IS NULL ORDER BY id DESC LIMIT 1")).rows[0]?.id;
  if (!b) throw new Error('No applied import batch found');
  const batch = (await pool.query('SELECT * FROM import_batches WHERE id=$1', [b])).rows[0];
  const ir = (await pool.query('SELECT source_row, action, employee_id FROM import_rows WHERE batch_id=$1', [b])).rows, byRow = new Map(ir.map((x) => [x.source_row, x]));
  const out = { batch: b, register_rows: rows.length, batch_counts: { inserted: batch.inserted, updated: batch.updated, skipped: batch.skipped, failed: batch.failed }, rows_without_import_record: [], rows_without_employee: [], mismatches: [], not_found_by_search: [] };
  for (const r of rows) {
    const x = byRow.get(r.no); if (!x) { out.rows_without_import_record.push(r.no); continue; } if (!x.employee_id) { if (x.action !== 'skip' && x.action !== 'fail') out.rows_without_employee.push(r.no); else out.rows_without_employee.push(r.no + ':' + x.action); continue; }
    const e = (await pool.query('SELECT e.*, d.name AS dept, p.title AS pos, p.grade AS pos_grade FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions p ON p.id=e.position_id WHERE e.id=$1', [x.employee_id])).rows[0];
    if (!e) { out.rows_without_employee.push(r.no + ':deleted'); continue; }
    const bad = [], iss = [], nm = R.split(r.name_am), eq = (f, a, v) => { if ((a ?? null) !== (v ?? null)) bad.push(f); };
    eq('first_name', e.first_name, nm.first); eq('father_name', e.father_name, nm.father); eq('grandfather_name', e.grandfather_name, nm.grand); eq('sex', e.sex, SEX[sp(r.sex)] || null);
    const hire = R.parseDate(r.hire, iss, 'h'), dob = R.parseDate(r.dob, iss, 'd'); eq('hire_date', String(e.hire_date).slice(0, 10), hire); if (dob) eq('date_of_birth', e.date_of_birth ? String(e.date_of_birth).slice(0, 10) : null, dob);
    const pen = R.penOf(r); if (pen) eq('pension_no', e.pension_no, pen); const fan = String(r.fan ?? '').replace(/[\s-]/g, ''); if (fan) eq('fayda_fan', e.fayda_fan, fan);
    if (withSalary && Number(r.salary) > 0) eq('basic_salary', Number(e.basic_salary), Number(r.salary));
    // the 27 register columns (every one of them): serial, names, workplace, ethnicity, education, service texts, children, JEG title, grade, flags, disability, training
    const d10 = (x) => (x ? String(x).slice(0, 10) : null);
    eq('register_no', e.register_no, r.no); eq('full_name_am', e.full_name_am, R.keep(r.name_am)); eq('full_name_en', e.full_name_en, R.keep(r.name_en)); eq('workplace', e.workplace, R.keep(r.unit)); eq('ethnicity', e.ethnicity, R.keep(r.ethnic));
    eq('education_field', e.education_field, R.keep(r.edu)); eq('education_level', e.education_level, R.keep(r.edu_level)); eq('prior_service_text', e.prior_service_text, R.keep(r.prev_svc)); eq('institution_service_text', e.institution_service_text, R.keep(r.inst_svc)); eq('total_service_text', e.total_service_text, R.keep(r.total_svc));
    eq('child1_dob', d10(e.child1_dob), R.parseDate(r.child1, iss, 'c1')); eq('child2_dob', d10(e.child2_dob), R.parseDate(r.child2, iss, 'c2')); eq('jeg_title', e.jeg_title, R.keep(r.title)); eq('job_grade', e.job_grade, R.keep(r.grade));
    eq('newly_hired_fy', e.newly_hired_fy, R.tick(r.newhire)); eq('promoted_fy', e.promoted_fy, R.tick(r.promoted)); eq('disability', e.disability, R.keep(r.disability)); eq('long_term_training', e.long_term_training, R.keep(r.training));
    eq('employment_type', e.employment_type, /ኮንትራት|ኮንትራክት|ውል/.test(String(r.type ?? '')) ? 'contract' : 'permanent');
    if (e.dept && sp(r.dir) && e.dept.toLowerCase() !== sp(r.dir).toLowerCase()) bad.push('department'); if (e.pos && sp(r.title) && e.pos.toLowerCase() !== sp(r.title).toLowerCase()) bad.push('position');
    if (bad.length) out.mismatches.push({ source_row: r.no, employee_no: e.employee_no, fields: bad });
    const found = (await pool.query("SELECT 1 FROM employees WHERE id=$1 AND full_name ILIKE $2", [e.id, `%${nm.first}%`])).rows.length; if (!found) out.not_found_by_search.push(r.no);
  }
  const tot = (await pool.query("SELECT count(*)::int AS all, count(*) FILTER (WHERE status<>'terminated')::int AS listed, count(*) FILTER (WHERE department_id IS NULL)::int AS no_dept, count(*) FILTER (WHERE position_id IS NULL)::int AS no_pos FROM employees")).rows[0];
  const dupFan = (await pool.query('SELECT count(*)::int AS n FROM (SELECT fayda_fan FROM employees WHERE fayda_fan IS NOT NULL GROUP BY fayda_fan HAVING count(*)>1) t')).rows[0].n, dupName = (await pool.query('SELECT count(*)::int AS n FROM (SELECT lower(full_name) FROM employees GROUP BY lower(full_name) HAVING count(*)>1) t')).rows[0].n;
  out.database = { employees_total: tot.all, shown_in_employee_list: tot.listed, without_department: tot.no_dept, without_position: tot.no_pos, repeated_fayda_numbers_groups: dupFan, repeated_full_names_groups: dupName };
  console.log(JSON.stringify(out, null, 1));
  const clean = !out.rows_without_import_record.length && !out.rows_without_employee.length && !out.mismatches.length && !out.not_found_by_search.length;
  console.log(clean ? 'VERIFIED: every register row has a matching employee record with identical values.' : 'NOT VERIFIED: see the lists above.'); process.exitCode = clean ? 0 : 2;
})().then(() => pool.end()).catch((e) => { console.error('Verification stopped:', e.message); pool.end(); process.exit(1); });
