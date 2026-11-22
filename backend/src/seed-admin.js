require('./env');
const bcrypt = require('bcryptjs'), { pool } = require('./db');
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase(), pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 10) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) in .env'); process.exit(1); }
  const hash = await bcrypt.hash(pw, 10);
  await pool.query(`INSERT INTO users(name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,'super_admin',true)
    ON CONFLICT (lower(email)) DO UPDATE SET password_hash=$3,role='super_admin',active=true,failed_logins=0,locked_until=NULL`, [process.env.ADMIN_NAME || 'System Administrator', email, hash]);
  console.log('Super admin ready:', email, '(you must change the password at first sign-in)'); await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
