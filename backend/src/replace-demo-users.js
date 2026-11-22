// Replaces the DEMO login accounts (seed:demo creates them all as <login>@hrms.test) with the real staff accounts.
// Touches ONLY rows in `users` whose e-mail ends in @hrms.test. Employees, leave, attendance, payroll, cases, documents,
// settings and every other table are left exactly as they are (foreign keys to users are ON DELETE SET NULL / CASCADE for password resets).
// Default is a DRY RUN that changes nothing:   npm run users:replace-demo
// To apply:                                    npm run users:replace-demo -- --apply
require('./env');
const bcrypt = require('bcryptjs'), crypto = require('crypto'), { pool, tx } = require('./db'), U = require('./util'), { enqueue, live } = require('./notify');
const APPLY = process.argv.includes('--apply');
const STAFF = [
  { env: 'STAFF_HR_LEADER_EMAIL', name: 'Riyot Fentaw Tessema', job_title: 'HR Team Leader', role: 'hr_manager' },
  { env: 'STAFF_HR_EXPERT_EMAIL', name: 'Meaz Mamo', job_title: 'HR Expert', role: 'hr_officer' },
  { env: 'STAFF_SECRETARY_EMAIL', name: 'Nitsanet Muhammd', job_title: 'Secretary', role: 'secretary' },
];
const genPassword = () => crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'a1';
const DEMO = "lower(email) LIKE '%@hrms.test'";
(async () => {
  const missing = STAFF.filter((s) => !(process.env[s.env] || '').trim()).map((s) => s.env);
  if (missing.length) { console.error('Set these in backend/.env first (the real e-mail address each person signs in with):\n  ' + missing.join('\n  ')); process.exit(1); }
  const people = STAFF.map((s) => ({ ...s, email: U.email(process.env[s.env].trim().toLowerCase(), true) }));
  if (people.some((p) => p.email.endsWith('@hrms.test'))) throw new Error('Staff e-mails must be real addresses, not @hrms.test');
  if (new Set(people.map((p) => p.email)).size !== people.length) throw new Error('The three e-mail addresses must be different');
  for (const p of people) if (!(await pool.query('SELECT 1 FROM roles WHERE code=$1', [p.role])).rows[0]) throw new Error(`Role "${p.role}" does not exist yet - run: npm run db:init`);
  if (!(await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='job_title'")).rows[0]) throw new Error('Column users.job_title is missing - run: npm run db:init');
  const demo = (await pool.query(`SELECT id,name,email,role FROM users WHERE ${DEMO} ORDER BY id`)).rows;
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - demo accounts found (${demo.length}):`); demo.forEach((u) => console.log(`  - ${u.email}  (${u.name}, ${u.role})`));
  // never leave the system without a working super admin
  const keep = (await pool.query(`SELECT count(*)::int AS n FROM users WHERE role='super_admin' AND active AND NOT (${DEMO})`)).rows[0].n;
  if (!keep) throw new Error('Refusing: no real (non-demo) active Super Admin exists. Run "npm run seed:admin" first, then retry.');
  console.log('Accounts to create/update:'); people.forEach((p) => console.log(`  + ${p.name} <${p.email}>  ${p.job_title}  -> role ${p.role}`));
  if (!APPLY) { console.log('\nNothing was changed. Re-run with --apply to do it.'); return pool.end(); }
  const made = [];
  await tx(async (t) => {
    const del = await t.query(`DELETE FROM users WHERE ${DEMO} RETURNING id`);
    for (const p of people) {
      const ex = (await t.query('SELECT id FROM users WHERE lower(email)=$1', [p.email])).rows[0];
      if (ex) { await t.query('UPDATE users SET name=$2,role=$3,job_title=$4,active=true WHERE id=$1', [ex.id, p.name, p.role, p.job_title]); made.push({ ...p, id: ex.id, pw: null }); continue; }
      const pw = genPassword(), id = (await t.query('INSERT INTO users(name,email,password_hash,role,job_title,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id', [p.name, p.email, await bcrypt.hash(pw, 10), p.role, p.job_title])).rows[0].id;
      made.push({ ...p, id, pw });
    }
    await t.query("INSERT INTO audit_logs(action,entity,detail) VALUES('replace_demo_users','users',$1)", [`deleted ${del.rowCount} demo accounts; created/updated ${made.length} staff accounts`]);
    console.log(`Deleted ${del.rowCount} demo accounts.`);
  });
  for (const m of made) if (m.pw) await enqueue(m.email, 'Your HR system account', `Hello ${m.name},\n\nAn account was created for you.\nAddress: ${process.env.PUBLIC_URL || ''}/login\nEmail: ${m.email}\nTemporary password: ${m.pw}\n\nYou must choose a new password at your first sign-in.`);
  console.log(live() ? 'Login details were queued by e-mail (sent when the server is running).' : 'E-mail is in TEST MODE - nothing was sent. Temporary passwords (shown once):');
  if (!live()) made.filter((m) => m.pw).forEach((m) => console.log(`  ${m.email}  ${m.pw}`));
  console.log('Done. Each person must change the password at first sign-in.'); await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
