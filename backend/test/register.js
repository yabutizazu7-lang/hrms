// Tests: the 27 register fields, the register import (preview / apply / repeat / rollback), masking and permissions.
// Uses a SYNTHETIC workbook (fictional people) - never the real register. DEVELOPMENT database only (creates records).
// Run: npm run db:init && npm run seed:all && npm run test:register
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const ExcelJS = require('exceljs'), fs = require('fs'), os = require('os'), path = require('path');
const app = require('../src/index'), { pool } = require('../src/db'), R = require('../src/import-register');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678';
let base, pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }, sec = (t) => console.log('\n' + t);
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const login = async (u) => (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d.token;
const tag = Date.now().toString(36).toUpperCase().replace(/[^A-Z]/g, 'X'), n0 = 9000 + (Date.now() % 500) * 2;   // high register numbers: never collide with the real register 1-205
const stamp = String(Date.now()), fan = (i) => '0' + stamp.slice(-9) + String(100000 + i).slice(-6), pen = (i) => '00' + stamp.slice(-6) + i;   // 16 digits, leading zero kept as text
const HEAD = ['ተ.ቁ', 'FAN', 'ስም በአማርኛ', 'Name in English', 'ፆታ', 'ተቋም', 'ዳይሬክቶሬት', 'የጡረታ', 'የትውልድ', 'ብሔር', 'የትምህርት ዓይነት', 'የትምህርት ደረጃ', 'የቅጥር ቀን', 'ሌላ መ/ቤት', 'በመ/ቤቱ', 'ጠቅላላ', 'የጋብቻ', 'ልጅ 1', 'ልጅ 2', 'JEG', 'ደረጃ', 'ደመወዝ', 'አዲስ', 'እድገት', 'አካል ጉዳት', 'ሥልጠና', 'የቅጥር ሁኔታ'];
async function book(rows, file) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('KPC Total'); ws.addRow(['204']); for (let i = 2; i < 15; i++) ws.addRow([]); ws.addRow(HEAD);   // header on row 15, data from row 16 like the real register
  for (const r of rows) ws.addRow(r); wb.addWorksheet('Other'); await wb.xlsx.writeFile(file); return file;
}
// one data row (27 columns)
const row = (i, o = {}) => [o.no ?? n0 + i, o.fan ?? fan(i), o.am ?? `አበበ ሙከራ${tag}${i} ደሳለኝ`, o.en ?? `Test Person ${tag}${i} Desta`, o.sex ?? 'ወ', 'ኮምቦልቻ ፖሊ ቴክኒክ ኮሌጅ', o.dir ?? 'ትምህርትና ስልጠና ቡድን', o.pen ?? pen(i), o.dob ?? '20/2/1977', 'አማራ', 'Automotive Technology', '2ኛ ድግሪ', o.hire ?? '26/12/2000', '2 አመት ከ11 ወር', '16 አመት ከ7 ወር', '19 አመት ከ6 ወር', 'ያገባ', o.c1 ?? '23/9/1995', o.c2 ?? '', `ዲን/የA-ኢንስትራክተር ${tag}`, 'XVII', o.sal ?? 25285, o.nh ?? '', o.pr ?? '√', o.dis ?? '', 'ሀገር ውስጥ አዳማ ዩኒቨርሲቲ 2', o.type ?? 'ቋሚ'];
const b64 = (f) => fs.readFileSync(f).toString('base64');
const countEmp = async () => Number((await pool.query('SELECT count(*) FROM employees')).rows[0].count);
(async () => {
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const T = {}; for (const u of ['hrm', 'hro', 'admin', 'emp', 'mgr', 'sup', 'exec']) T[u] = await login(u);
  const tmp = (n) => path.join(os.tmpdir(), `reg-test-${tag}-${n}.xlsx`);

  sec('1. All 27 fields exist in the database');
  const cols = (await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='employees'")).rows, has = (c) => cols.some((x) => x.column_name === c), ty = (c) => cols.find((x) => x.column_name === c)?.data_type;
  const F27 = { 1: 'register_no', 2: 'fayda_fan', 3: 'full_name_am', 4: 'full_name_en', 5: 'sex', 6: 'workplace', 7: 'department_id', 8: 'pension_no', 9: 'date_of_birth', 10: 'ethnicity', 11: 'education_field', 12: 'education_level', 13: 'hire_date', 14: 'prior_service_text', 15: 'institution_service_text', 16: 'total_service_text', 17: 'marital_status', 18: 'child1_dob', 19: 'child2_dob', 20: 'jeg_title', 21: 'job_grade', 22: 'basic_salary', 23: 'newly_hired_fy', 24: 'promoted_fy', 25: 'disability', 26: 'long_term_training', 27: 'employment_type' };
  for (const [k, c] of Object.entries(F27)) ok(has(c), `field ${k} (${c}) exists`);
  ok(ty('register_no') === 'integer' && ty('basic_salary') === 'numeric' && ty('child1_dob') === 'date' && ty('hire_date') === 'date' && ty('newly_hired_fy') === 'boolean' && ty('fayda_fan') === 'text' && ty('pension_no') === 'text', 'suitable types: integer, numeric, date, boolean, FAN and pension as text');
  ok((await pool.query("SELECT 1 FROM pg_indexes WHERE indexname='employees_register_no'")).rows[0] !== undefined, 'one register number per employee (unique index), not the primary key');

  sec('2. Date, salary, check-mark and name parsing');
  const iss = []; ok(R.ethToGreg(2018, 1, 1) === '2025-09-11' && R.ethToGreg(2017, 13, 5) === '2025-09-10' && R.ethToGreg(2015, 13, 6) === '2023-09-11' && R.ethToGreg(2016, 13, 6) === null, 'Ethiopian -> Gregorian: new year, Pagume 5, leap Pagume 6, invalid Pagume 6');
  ok(R.parseDate('20/2/1977', iss, 'd') === '1984-10-30', 'text date 20/2/1977 (Ethiopian: Tikimt 20, 1977) = 1984-10-30'); ok(iss.some((x) => /Ethiopian/.test(x)), 'conversions are flagged for HR to verify');
  ok(R.parseDate(new Date(Date.UTC(2010, 6, 3)), [], 'd') === R.ethToGreg(2010, 3, 7), 'a spreadsheet date whose day and month Excel swapped is decoded back (7/3/2010 typed -> 3 July 2010 stored)');
  ok(R.parseDate('abc', iss, 'd') === null && R.parseDate('', [], 'd') === null && R.parseDate('31/2/2010', [], 'd') === null, 'unreadable / empty / impossible dates give NULL, not a guess');
  ok(R.tick('√') && R.tick('✓') && !R.tick('') && !R.tick(null) && !R.tick('x1'), 'check marks are booleans, blank is not marked');
  ok(R.keep('  ሰለሞን  ነጋሽ የማነ ') === 'ሰለሞን  ነጋሽ የማነ' && R.keep('   ') === null, 'names keep their exact spelling and inner spaces (only the ends are trimmed); blank = NULL');
  ok(R.penOf({ pension: 'የለም' }) === null && R.penOf({ pension: ' 00123 ' }) === '00123', 'pension: "no pension" is not a number; leading zeros survive');

  sec('3. Authorization of the import');
  const f1 = await book([row(1), row(2, { nh: '√', pr: '', dis: 'የመንቀሳቀስ', c2: '1/2/2000', type: 'ኮንትራት' }), row(3, { sal: 'abc', dob: '', pen: 'የለም' })], tmp(1));
  const body = (f, x = {}) => ({ file_base64: b64(f), file_name: 'x.xlsx', ...x });
  for (const [u, who] of [['emp', 'an employee'], ['mgr', 'a line manager'], ['hro', 'an HR officer'], ['exec', 'an executive']]) ok((await call('POST', '/register-import/preview', body(f1), T[u])).s === 403, `${who} cannot import`);
  ok((await call('POST', '/register-import/preview', body(f1))).s === 401, 'signed-out: refused');
  ok((await call('GET', '/register-import/batches', null, T.emp)).s === 403 && (await call('GET', '/register-import/batches/1', null, T.hro)).s === 403, 'batch history and error reports are for import.manage only');
  ok((await call('POST', '/register-import/preview', { file_base64: Buffer.from('not a workbook').toString('base64') }, T.hrm)).s === 400, 'a file that is not .xlsx is refused');

  sec('4. Preview writes nothing; apply inserts; repeat changes nothing');
  const before = await countEmp(), pv = await call('POST', '/register-import/preview', body(f1), T.hrm);
  ok(pv.s === 200 && pv.d.summary.source_rows === 3 && pv.d.summary.insert === 3 && pv.d.summary.invalid === 0 && pv.d.summary.valid === 3 && pv.d.summary.duplicates === 0, 'preview: 3 rows found, 3 valid, 0 invalid, 0 duplicates');
  ok((await countEmp()) === before, 'preview wrote nothing'); ok(pv.d.rows.every((r) => !/Test Person|አበበ/.test(JSON.stringify(r))), 'the report shows row numbers and issues, never names');
  ok((await call('POST', '/register-import/apply', body(f1), T.hrm)).s === 400, 'apply needs an explicit confirmation');
  const ap = await call('POST', '/register-import/apply', body(f1, { confirm: true, with_salary: true }), T.hrm); ok(ap.s === 201 && ap.d.summary.insert === 3 && ap.d.summary.batch_id > 0, 'apply: 3 inserted'); const B1 = ap.d.summary.batch_id;
  ok((await countEmp()) === before + 3, '3 new employees, none removed');
  const E1 = (await pool.query('SELECT * FROM employees WHERE register_no=$1', [n0 + 1])).rows[0], E2 = (await pool.query('SELECT * FROM employees WHERE register_no=$1', [n0 + 2])).rows[0], E3 = (await pool.query('SELECT * FROM employees WHERE register_no=$1', [n0 + 3])).rows[0];
  sec('5. All 27 fields were stored exactly');
  ok(E1.register_no === n0 + 1 && E1.fayda_fan === fan(1) && fan(1).startsWith('0') && E1.pension_no === pen(1) && pen(1).startsWith('00'), 'register serial kept; FAN and pension keep their leading zeros');
  ok(E1.full_name_am === `አበበ ሙከራ${tag}1 ደሳለኝ` && E1.full_name_en === `Test Person ${tag}1 Desta`, 'Amharic and English full names are exact');
  ok(E1.sex === 'male' && E1.workplace === 'ኮምቦልቻ ፖሊ ቴክኒክ ኮሌጅ' && E1.ethnicity === 'አማራ' && E1.education_field === 'Automotive Technology' && E1.education_level === '2ኛ ድግሪ', 'gender, workplace, ethnicity, education field and level');
  ok(String(E1.date_of_birth).slice(0, 10) === '1984-10-30' && String(E1.hire_date).slice(0, 10) === R.ethToGreg(2000, 12, 26) && String(E1.child1_dob).slice(0, 10) === R.ethToGreg(1995, 9, 23) && E1.child2_dob === null, 'dates are converted from the Ethiopian calendar; a blank child date is NULL');
  ok(E1.prior_service_text === '2 አመት ከ11 ወር' && E1.institution_service_text === '16 አመት ከ7 ወር' && E1.total_service_text === '19 አመት ከ6 ወር', 'the three service durations are kept as written');
  ok(E1.marital_status === 'married' && E1.jeg_title === `ዲን/የA-ኢንስትራክተር ${tag}` && E1.job_grade === 'XVII' && Number(E1.basic_salary) === 25285 && E1.employment_type === 'permanent', 'marital status, JEG title, grade, salary (numeric), employment type');
  ok(E1.newly_hired_fy === false && E1.promoted_fy === true && E1.disability === null && E1.long_term_training === 'ሀገር ውስጥ አዳማ ዩኒቨርሲቲ 2', 'check marks -> booleans; no disability = NULL; training kept');
  ok(E2.newly_hired_fy === true && E2.promoted_fy === false && E2.disability === 'የመንቀሳቀስ' && String(E2.child2_dob).slice(0, 10) === R.ethToGreg(2000, 2, 1) && E2.employment_type === 'contract', 'second row: ticks, disability, second child, contract type');
  ok(Number(E3.basic_salary) === 0 && E3.date_of_birth === null && E3.pension_no === null, 'an invalid salary, an empty date and "no pension" are stored as NULL (nothing invented)');
  ok(Number(E1.id) > 0 && (await pool.query('SELECT 1 FROM import_rows WHERE batch_id=$1 AND source_row=$2 AND employee_id=$3', [B1, n0 + 1, E1.id])).rows[0] !== undefined, 'the import is recorded per row (for the report and undo)');

  sec('6. Repeating the import creates no duplicates');
  const rp = await call('POST', '/register-import/apply', body(f1, { confirm: true, with_salary: true }), T.hrm); ok(rp.s === 201 && rp.d.summary.insert === 0 && rp.d.summary.update === 0 && rp.d.summary.skip === 3, 'second run: 0 inserted, 0 updated, 3 skipped'); ok((await countEmp()) === before + 3, 'still exactly 3 new employees');
  ok(Number((await pool.query('SELECT count(*) FROM employees WHERE register_no BETWEEN $1 AND $2', [n0 + 1, n0 + 3])).rows[0].count) === 3, 'one employee per register number');

  sec('7. Existing employees are preserved; conflicts are reported, not overwritten');
  const ex = (await pool.query("INSERT INTO employees(employee_no,first_name,father_name,sex,hire_date,fayda_fan,pension_no,phone,notes) VALUES($1,'Existing','Person','female','2015-05-05',$2,'KEEP-ME','0911000000','my note') RETURNING *", ['EMP-T' + tag, fan(50)])).rows[0];
  const f2 = await book([row(50, { no: n0 + 50, sex: 'ወ', sal: 18000 })], tmp(2)); const cnt2 = await countEmp(), ap2 = await call('POST', '/register-import/apply', body(f2, { confirm: true, with_salary: true }), T.hrm);
  ok(ap2.s === 201 && ap2.d.summary.insert === 0 && ap2.d.summary.update === 1, 'matched by FAN: updated, not duplicated'); ok((await countEmp()) === cnt2, 'no new employee was created');
  const x2 = (await pool.query('SELECT * FROM employees WHERE id=$1', [ex.id])).rows[0];
  ok(x2.employee_no === ex.employee_no && x2.pension_no === 'KEEP-ME' && x2.sex === 'female' && x2.phone === '0911000000' && x2.notes === 'my note' && String(x2.hire_date).slice(0, 10) === '2015-05-05', 'existing values (pension, sex, phone, notes, hire date) were NOT overwritten');
  ok(x2.register_no === n0 + 50 && x2.education_level === '2ኛ ድግሪ' && x2.full_name_am && Number(x2.basic_salary) === 18000, 'empty fields were filled from the register');
  ok(ap2.d.rows[0].issues.some((i) => /conflict: sex/.test(i)) && ap2.d.rows[0].issues.some((i) => /conflict: pension_no/.test(i)), 'the conflicting values are reported (field names only)');
  const rep = await call('GET', `/register-import/batches/${ap2.d.summary.batch_id}`, null, T.hrm); ok(rep.s === 200 && rep.d.rows.length === 1 && rep.d.rows[0].issues.length > 0, 'the error report can be downloaded by an authorized user');

  sec('8. Duplicates and invalid rows');
  const f3 = await book([row(60, { no: n0 + 60 }), row(60, { no: n0 + 60 }), row(61, { no: n0 + 61, fan: fan(62) }), row(62, { no: n0 + 62, fan: fan(62) }), row(63, { no: n0 + 63, am: 'አንድ', en: 'One' }), row(64, { no: n0 + 64, hire: '' }), row(65, { no: n0 + 65, sex: '' })], tmp(3));
  const pv3 = await call('POST', '/register-import/preview', body(f3), T.hrm), s3 = pv3.d.summary;
  ok(s3.source_rows === 7 && s3.skip >= 1 && s3.fail >= 3 && s3.duplicates >= 3 && s3.valid + s3.invalid === 7, `identical repeated row skipped; repeated FAN flagged; invalid rows (one-word name, no hire date, no sex) refused: ${JSON.stringify(s3)}`);
  ok(pv3.d.rows.filter((r) => /Fayda number repeated/.test(r.issues.join())).length === 2, 'both rows with the same FAN are flagged (never merged)');

  sec('9. Rollback on failure: one transaction');
  const f4 = await book([row(70, { no: n0 + 70 }), row(71, { no: n0 + 70 })], tmp(4));   // two different people with the same register number -> the second insert fails
  const c4 = await countEmp(), bad4 = await call('POST', '/register-import/apply', body(f4, { confirm: true }), T.hrm);
  ok(bad4.s >= 400 && (await countEmp()) === c4 && (await pool.query('SELECT 1 FROM employees WHERE register_no=$1', [n0 + 70])).rows.length === 0, 'a failing row leaves NOTHING behind (the first row was rolled back too)');
  ok((await pool.query("SELECT 1 FROM import_batches WHERE source_file='x.xlsx' AND id>$1 AND inserted=2", [B1])).rows.length === 0, 'no half-finished batch is recorded');

  sec('10. Undo a batch');
  const f5 = await book([row(80, { no: n0 + 80 })], tmp(5)), ap5 = await call('POST', '/register-import/apply', body(f5, { confirm: true }), T.hrm), c5 = await countEmp();
  ok((await call('POST', `/register-import/batches/${ap5.d.summary.batch_id}/rollback`, {}, T.hrm)).s === 400, 'undo needs a confirmation'); const ub = await call('POST', `/register-import/batches/${ap5.d.summary.batch_id}/rollback`, { confirm: true }, T.hrm);
  ok(ub.s === 200 && ub.d.del === 1 && (await countEmp()) === c5 - 1, 'undo removes only the employee that batch inserted'); ok((await call('POST', `/register-import/batches/${ap5.d.summary.batch_id}/rollback`, { confirm: true }, T.hrm)).s === 400, 'a batch can be undone only once');
  const ub2 = await call('POST', `/register-import/batches/${ap2.d.summary.batch_id}/rollback`, { confirm: true }, T.hrm); const x3 = (await pool.query('SELECT * FROM employees WHERE id=$1', [ex.id])).rows[0];
  ok(ub2.s === 200 && x3.register_no === null && x3.education_level === null && Number(x3.basic_salary) === 0 && x3.pension_no === 'KEEP-ME' && x3.employee_no === ex.employee_no, 'undo of an update empties only the fields it filled; the employee and the older values stay');
  const list = (await call('GET', '/register-import/batches', null, T.hrm)).d; ok(Array.isArray(list) && list.length >= 3 && list.some((b) => b.rolled_back_at), 'batch history is available');

  sec('11. Create, edit, view with the new fields (API)');
  const LK = (await call('GET', '/lookups', null, T.hrm)).d, dep = LK.departments[0].id;
  const mkb = { first_name: 'Reg', father_name: 'Field' + tag, sex: 'female', hire_date: '2022-03-01', department_id: dep, register_no: n0 + 100, full_name_am: 'ረጊ ፊልድ', full_name_en: 'Reg Field', workplace: 'Kombolcha Polytechnic College', ethnicity: 'አማራ', education_field: 'Computer Science', education_level: 'ድግሪ', prior_service_text: '1 አመት', institution_service_text: '4 አመት', total_service_text: '5 አመት', child1_dob: '2015-01-01', child2_dob: '2018-02-02', jeg_title: 'IT Officer', job_grade: 'XIII', newly_hired_fy: true, promoted_fy: false, disability: 'Hearing', long_term_training: 'Ethiopia, Masters' };
  const cr = await call('POST', '/employees', mkb, T.hrm); ok(cr.s === 201 && cr.d.register_no === n0 + 100 && cr.d.education_level === 'ድግሪ', 'HR creates an employee with all the register fields'); const nid = cr.d.id;
  ok((await call('POST', '/employees', { ...mkb, first_name: 'Reg2' }, T.hrm)).s === 400, 'a register number cannot be used twice'); ok((await call('POST', '/employees', { ...mkb, first_name: 'Reg3', register_no: -4 }, T.hrm)).s === 400, 'register number must be positive'); ok((await call('POST', '/employees', { ...mkb, first_name: 'Reg4', register_no: n0 + 101, child1_dob: '2999-01-01' }, T.hrm)).s === 400, 'a child date of birth in the future is refused');
  const d1 = (await call('GET', `/employees/${nid}`, null, T.hrm)).d; ok(d1.full_name_en === 'Reg Field' && d1.disability === 'Hearing' && d1.child2_dob && d1.job_grade === 'XIII' && d1.newly_hired_fy === true && d1.promoted_fy === false && d1.long_term_training === 'Ethiopia, Masters', 'the detail view returns every field to HR');
  const up = await call('PUT', `/employees/${nid}`, { education_level: '2ኛ ድግሪ', promoted_fy: true, disability: '' }, T.hrm); ok(up.s === 200, 'HR edits'); const d2 = (await call('GET', `/employees/${nid}`, null, T.hrm)).d; ok(d2.education_level === '2ኛ ድግሪ' && d2.promoted_fy === true && d2.disability === null && d2.jeg_title === 'IT Officer', 'edit changes only what was sent');

  sec('12. Privacy: sensitive fields are protected by the backend');
  const asEmp = (await call('GET', `/employees/${nid}`, null, T.emp)).s, mine = (await call('GET', '/me', null, T.emp)).d; ok(asEmp === 403 || asEmp === 404, 'an employee cannot open someone else\'s record');
  const full = (await call('GET', `/employees/${nid}`, null, T.hro)).d; ok(full.education_level && full.register_no === n0 + 100, 'HR officer sees the register fields');
  const pr = (await pool.query('SELECT e.id FROM employees e WHERE e.manager_id=(SELECT employee_id FROM users WHERE email=$1) LIMIT 1', ['mgr@hrms.test'])).rows[0];
  if (pr) { await pool.query('UPDATE employees SET disability=$2,child1_dob=$3,ethnicity=$4,education_level=$5,register_no=NULL WHERE id=$1', [pr.id, 'x', '2010-01-01', 'y', 'z']); const m = (await call('GET', `/employees/${pr.id}`, null, T.mgr)).d;
    ok(m.disability === undefined && m.child1_dob === undefined && m.child2_dob === undefined && m.ethnicity === undefined && m.education_level === undefined && m.register_no === undefined && m.jeg_title === undefined && m.newly_hired_fy === undefined, 'a line manager gets none of the register / family / disability fields');
    ok(m.full_name_am !== undefined, 'names stay visible (staff directory level)'); } else ok(false, 'demo manager has no report to test');
  ok((await call('GET', '/employees?sex=female&education_level=z', null, T.mgr)).d.every?.((x) => x.education_level === undefined), 'a manager cannot use or see the register columns');
  ok((await call('GET', '/employees-register/options', null, T.mgr)).s === 403 && (await call('GET', '/employees-register/options', null, T.hro)).s === 200, 'the filter values are HR only');
  ok((await call('PUT', `/employees/${nid}`, { disability: 'hack' }, T.mgr)).s === 403 && (await call('PUT', `/employees/${nid}`, { disability: 'hack' }, T.emp)).s === 403, 'only HR (employees.manage) can edit the fields');
  ok(!JSON.stringify(mine).includes('"fayda_fan"'), 'the full FAN is never in ordinary responses');

  sec('13. Search, filters and the register order');
  const L = (qs) => call('GET', `/employees${qs}`, null, T.hrm).then((x) => x.d);
  ok((await L('?q=ረጊ')).some((x) => x.id === nid) && (await L('?q=reg%20field')).some((x) => x.id === nid), 'search finds the Amharic and the English name');
  ok((await L(`?sex=female&education_level=${encodeURIComponent('2ኛ ድግሪ')}&job_grade=XIII&department_id=${dep}&employment_type=permanent`)).some((x) => x.id === nid), 'filter by gender, education level, job grade, department and employment type');
  ok(!(await L('?sex=male&job_grade=XIII')).some((x) => x.id === nid), 'a different gender does not match');
  const rg = await L('?sort=register_no'), nums = rg.map((x) => x.register_no).filter((x) => x != null); ok(nums.length >= 2 && nums.every((v, i) => i === 0 || v >= nums[i - 1]), 'the register view is ordered by the original serial number');
  ok(rg.length === 0 || rg.slice(-1)[0].register_no !== undefined, 'register columns are present for HR');
  const o = (await call('GET', '/employees-register/options', null, T.hrm)).d; ok(o.education_levels.some((x) => x.v === '2ኛ ድግሪ') && o.job_grades.some((x) => x.v === 'XIII'), 'filter options list the real values');

  sec('14. Existing data and rules are intact');
  ok((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('payslips','payroll_runs')")).rows[0].count === '0' || Number((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('payslips','payroll_runs')")).rows[0].count) === 0, 'no payroll tables (the no-payroll rule holds)');
  ok(Number((await pool.query("SELECT count(*) FROM employees WHERE status<>'terminated'")).rows[0].count) >= before, 'no employee was deleted by any import');

  for (const f of [1, 2, 3, 4, 5]) fs.unlink(tmp(f), () => {});
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
