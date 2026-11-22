require('./env');
const HR_SOURCE = 'Kombolcha Polytechnic College: the Human Resources department alone processes and takes the final decision on this matter (written clarification of the institution)';
const fs = require('fs'), path = require('path'), { pool } = require('./db'), { PERMISSIONS, ROLES, NEW_GRANTS, GRANTS_003, GRANTS_007, GRANTS_009, GRANTS_011 } = require('./rbac-seed');
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  // additive migrations (db/migrations/*.sql): each runs once inside a transaction and is recorded; they only add tables/columns
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const mdir = path.join(__dirname, '../db/migrations');
  for (const f of fs.existsSync(mdir) ? fs.readdirSync(mdir).filter((x) => x.endsWith('.sql')).sort() : []) {
    if ((await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f])).rows[0]) continue;
    const c = await pool.connect();
    try { await c.query('BEGIN'); await c.query(fs.readFileSync(path.join(mdir, f), 'utf8')); await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]); await c.query('COMMIT'); console.log('Migration applied:', f); }
    catch (e) { await c.query('ROLLBACK'); console.error('Migration FAILED and was rolled back:', f, '-', e.message); throw e; }
    finally { c.release(); }
  }
  for (const [code, module_, description] of PERMISSIONS) await pool.query('INSERT INTO permissions(code,module,description) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET module=$2,description=$3', [code, module_, description]);
  for (const r of ROLES) {
    const ins = await pool.query('INSERT INTO roles(code,name,description) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET name=$2,description=$3 RETURNING id,(xmax=0) AS created', [r.code, r.name, r.description]);
    const { id, created } = ins.rows[0];
    if (!created) continue; // existing role: keep the permissions the administrator configured
    const list = r.perms === '*' ? PERMISSIONS.map((p) => p[0]) : r.perms;
    for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE code=$2 ON CONFLICT DO NOTHING', [id, p]);
  }
  // one-time, additive grants of the new permissions to roles that already existed
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='grants-002'")).rows[0]) {
    for (const [role, list] of Object.entries(NEW_GRANTS)) for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING', [role, p]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('grants-002')");
  }
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='grants-003'")).rows[0]) {
    for (const [role, list] of Object.entries(GRANTS_003)) for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING', [role, p]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('grants-003')");
  }
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='grants-007'")).rows[0]) {   // permanent-employment confirmation: granted once to HR roles, never removed
    for (const [role, list] of Object.entries(GRANTS_007)) for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING', [role, p]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('grants-007')");
  }
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='grants-009'")).rows[0]) {   // HR authority: granted once to the HR Manager role, never removed; HR officers are designated by name
    for (const [role, list] of Object.entries(GRANTS_009)) for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING', [role, p]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('grants-009')");
  }
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='grants-011'")).rows[0]) {   // ppe.exception: HR Manager only
    for (const [role, list] of Object.entries(GRANTS_011)) for (const p of list) await pool.query('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING', [role, p]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('grants-011')");
  }
  // work clothing / equipment catalogue (Directive 173/2018, PDF pp. 4-27): loaded once, never overwrites anything that already exists
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='ppe-catalog-173-2018'")).rows[0]) {
    const r = await require('./seed-ppe').seedPpeCatalog(pool); console.log('Uniform & equipment catalogue loaded:', JSON.stringify(r));
    await pool.query("INSERT INTO schema_migrations(name) VALUES('ppe-catalog-173-2018')");
  }
  // approval authority per case type: defaults are PLACEHOLDERS until an authorized HR decision confirms them (verified=false)
  await pool.query("CREATE TABLE IF NOT EXISTS case_approval_rules (case_type TEXT PRIMARY KEY, approver_permission TEXT NOT NULL DEFAULT 'cases.approve', requires_recommendation BOOLEAN NOT NULL DEFAULT TRUE, source_ref TEXT, verified BOOLEAN NOT NULL DEFAULT FALSE)");
  for (const t of ['permanent_appointment', 'promotion', 'acting_assignment', 'internal_transfer', 'external_transfer', 'termination', 'retirement', 'long_term_education', 'short_term_training', 'experience_certificate', 'recommendation_letter'])
    await pool.query('INSERT INTO case_approval_rules(case_type,approver_permission,requires_recommendation,source_ref,verified) VALUES($1,$2,$3,$4,true) ON CONFLICT DO NOTHING', [t, 'cases.decide_hr', t !== 'experience_certificate', HR_SOURCE]);
  await pool.query("INSERT INTO case_approval_rules(case_type,approver_permission,requires_recommendation,source_ref,verified) VALUES('disciplinary','cases.decide_hr',TRUE,$1,true) ON CONFLICT DO NOTHING", [HR_SOURCE]);
  // the work-experience certificate is an HR function: its default deciding authority becomes the HR authority - once, and only while the rule is still the untouched placeholder
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='authority-defaults-009'")).rows[0]) {
    await pool.query("UPDATE case_approval_rules SET approver_permission='cases.decide_hr' WHERE case_type='experience_certificate' AND approver_permission='cases.approve' AND NOT verified AND source_ref IS NULL");
    await pool.query("INSERT INTO schema_migrations(name) VALUES('authority-defaults-009')");
  }
  // items the directive names "for men" / "for women" (the catalogue is imported above, after the migrations ran): idempotent
  await pool.query("UPDATE ppe_items SET applies_to_sex='male' WHERE applies_to_sex IS NULL AND name_am ~ 'ለወንድ|ለወንዶች'");
  await pool.query("UPDATE ppe_items SET applies_to_sex='female' WHERE applies_to_sex IS NULL AND name_am ~ 'ለሴት|ለሴቶች'");
  // job-title entitlements: link every college title that is safely the same occupation as one in Directive 173/2018 Annex 3 - once; the same process can be run again at any time (idempotent)
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='ppe-title-map-011'")).rows[0]) {
    const PM = require('./ppe-map'), c = { query: (s, p) => pool.query(s, p) }, added = await PM.autoMap(c), v = PM.summarize(await PM.plan(c));
    if (v.employees) await pool.query('INSERT INTO ppe_mapping_runs(employees,matched,review,titles,titles_matched,titles_review,links_added) VALUES($1,$2,$3,$4,$5,$6,$7)', [v.employees, v.matched, v.review, v.titles, v.titles_matched, v.titles_review, added]);
    await pool.query("INSERT INTO schema_migrations(name) VALUES('ppe-title-map-011')");
  }
  // HR EXCLUSIVE AUTHORITY (clarification of the college): the HR department alone processes and decides all HR cases. Done once; nothing else is touched.
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='hr-exclusive-010'")).rows[0]) {
    await pool.query("UPDATE case_approval_rules SET approver_permission='cases.decide_hr', verified=true, source_ref=$1", [HR_SOURCE]);   // every case type: HR decides, confirmed
    await pool.query("UPDATE approval_authorities SET active=(permission='cases.decide_hr')");   // the other options are switched off (kept for history, never deleted)
    await pool.query('UPDATE hr_cases SET authority_override=NULL WHERE authority_override IS NOT NULL');   // a case forwarded earlier comes back to HR
    await pool.query("DELETE FROM permissions WHERE code IN ('cases.approve','discipline.decide')");   // no institution-level decision permission remains (role links go with them)
    await pool.query("INSERT INTO schema_migrations(name) VALUES('hr-exclusive-010')");
  }
  // defaults the system needs to work out of the box (only inserted when missing; everything is editable in the Administration pages)
  const defaults = { org_name: 'Your Organization', org_name_am: '', hr_manager_name: 'Riyot Fentaw Tessema', currency: 'ETB', work_start: '08:30', work_end: '17:30', grace_minutes: '15', weekend_days: '0,6', probation_months: '6', probation_auto_permanent: '1', notice_days: '30', alert_days: '30', timezone: 'Africa/Addis_Ababa', ppe_wait_months: '6', ppe_immediate_note: 'Chemical, health, garage and fire-fighting work: entitled from the assignment date (Directive 173/2018 Art. 7(2)) - HR to confirm', termination_requires_case: 'true', retirement_age_years: '', retirement_min_service_years: '', retirement_age_source: '' };
  for (const [k, v] of Object.entries(defaults)) await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', [k, v]);
  // retirement age 60: specified by the HRMS owner (24 Oct 2026). Applied once, and only where the value is still blank, so a later change by HR is never overwritten.
  if (!(await pool.query("SELECT 1 FROM schema_migrations WHERE name='retirement-age-60'")).rows[0]) {
    await pool.query("UPDATE settings SET value='60' WHERE key='retirement_age_years' AND value=''");
    await pool.query("UPDATE settings SET value='Instruction of the HRMS owner (24 Oct 2026). Governing law / directive reference not yet recorded - HR to enter it.' WHERE key='retirement_age_source' AND value=''");
    await pool.query("INSERT INTO schema_migrations(name) VALUES('retirement-age-60')");
  }
  if (!(await pool.query('SELECT 1 FROM leave_types LIMIT 1')).rows[0]) for (const t of [['ANNUAL', 'Annual leave', 16, 2, 1, true, false, null, 0, true], ['SICK', 'Sick leave', 30, 0, 0, true, true, null, 0, false], ['MATERN', 'Maternity leave', 90, 0, 0, true, false, 'female', 0, false], ['PATERN', 'Paternity leave', 3, 0, 0, true, false, 'male', 0, false], ['MARRIAGE', 'Marriage leave', 3, 0, 0, true, false, null, 0, false], ['BEREAVE', 'Bereavement leave', 3, 0, 0, true, false, null, 0, false], ['UNPAID', 'Unpaid leave', null, 0, 0, false, false, null, 3, false]])
    await pool.query('INSERT INTO leave_types(code,name,days_per_year,increment_every_years,increment_days,paid,requires_document,sex_restriction,min_notice_days,prorate_first_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', t);
  if (!(await pool.query('SELECT 1 FROM appraisal_criteria LIMIT 1')).rows[0]) for (const [n, w] of [['Quality of work', 25], ['Productivity and results', 25], ['Teamwork and communication', 20], ['Initiative and problem solving', 15], ['Attendance and discipline', 15]]) await pool.query('INSERT INTO appraisal_criteria(name,weight) VALUES($1,$2)', [n, w]);
  console.log('Database ready:', PERMISSIONS.length, 'permissions,', ROLES.length, 'roles.');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
