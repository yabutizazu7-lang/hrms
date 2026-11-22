// Migration safety: build a database from the ORIGINAL schema (db/schema.sql only), add employee data, then run the upgrade (init.js) twice.
// Verifies: no data lost, new columns/tables exist, re-running changes nothing, existing identifiers keep their exact text.
require('../src/env');
const { Client } = require('pg'), { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
const NAME = 'hrms_migration_check', base = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
(async () => {
  const adm = new Client({ ...base, database: 'postgres' }); await adm.connect(); await adm.query(`DROP DATABASE IF EXISTS ${NAME}`); await adm.query(`CREATE DATABASE ${NAME}`); await adm.end();
  const c = new Client({ ...base, database: NAME }); await c.connect();
  const dir = path.join(__dirname, '../db/migrations'), orig = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await c.query(orig);   // a pre-upgrade database
  await c.query("INSERT INTO roles(code,name) VALUES('employee','Employee') ON CONFLICT DO NOTHING");
  await c.query("INSERT INTO employees(employee_no,first_name,father_name,sex,hire_date,pension_no,national_id) VALUES('EMP-00007','Abebe','Kebede','male','2015-03-01','ሰ/0012345','00987654321'),('EMP-00008','Sara','Tesfaye','female','2018-01-01',NULL,NULL)");
  const before = (await c.query('SELECT employee_no,pension_no,national_id,full_name FROM employees ORDER BY id')).rows;
  const env = { ...process.env, DB_NAME: NAME }, run = () => execFileSync('node', [path.join(__dirname, '../src/init.js')], { env, encoding: 'utf8' });
  const out1 = run(); ok(/Migration applied: 002/.test(out1), 'the upgrade applies migration 002');
  const after = (await c.query('SELECT employee_no,pension_no,national_id,full_name FROM employees ORDER BY id')).rows; ok(JSON.stringify(before) === JSON.stringify(after), 'existing employee rows are byte-for-byte unchanged (leading zeros and letters kept)');
  ok((await c.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='employees' AND column_name IN ('fayda_fan','staff_position_id','fayda_status')")).rows[0].n === 3, 'new identifier columns exist and are separate from employee_no, pension_no and national_id');
  for (const t of ['staff_positions', 'hr_cases', 'hr_case_events', 'service_periods', 'ppe_issues', 'hr_plans', 'import_batches', 'schema_migrations']) ok((await c.query('SELECT to_regclass($1) AS r', [t])).rows[0].r, 'table ' + t);
  ok((await c.query("SELECT count(*)::int AS n FROM employees WHERE staff_position_id IS NOT NULL OR fayda_fan IS NOT NULL")).rows[0].n === 0, 'no identifier is invented for existing employees (missing numbers stay empty for HR to verify)');
  const rs = async () => Object.fromEntries((await c.query("SELECT key,value FROM settings WHERE key LIKE 'retirement%'")).rows.map((r) => [r.key, r.value]));
  let st = await rs(); ok(st.retirement_age_years === '60' && /not yet recorded/.test(st.retirement_age_source), 'the retirement age 60 is applied on upgrade, with its source marked as not yet legally referenced');
  await c.query("UPDATE settings SET value='62' WHERE key='retirement_age_years'"); run(); st = await rs(); ok(st.retirement_age_years === '62', 'a later change by HR is never overwritten by re-running the upgrade');
  const out2 = run(); ok(!/Migration applied/.test(out2), 'running the upgrade again changes nothing'); ok((await c.query('SELECT count(*)::int AS n FROM schema_migrations WHERE name LIKE $1', ['002%'])).rows[0].n === 1, 'the migration is recorded exactly once');
  const sqlText = fs.readdirSync(dir).filter((f) => f !== '006_remove_payroll.sql').map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'); ok(!/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(sqlText), 'migrations contain no DROP TABLE / TRUNCATE / DELETE (except the payroll removal, checked next)'); { const m6 = fs.readFileSync(path.join(dir, '006_remove_payroll.sql'), 'utf8'); ok(/IF n = 0 THEN\s+DROP TABLE IF EXISTS payslips, payroll_runs, loans, tax_brackets CASCADE/.test(m6) && !/employees/i.test(m6.replace(/--.*$/gm, '')), 'the payroll removal drops payroll tables only when they are empty and never touches the employees table'); }
  ok((await c.query("SELECT count(*)::int AS n FROM employees")).rows[0].n === 2, 'no employee was added or removed');
  await c.end(); const adm2 = new Client({ ...base, database: 'postgres' }); await adm2.connect(); await adm2.query(`DROP DATABASE ${NAME}`); await adm2.end();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
