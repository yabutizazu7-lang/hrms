const express = require('express'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const { q } = require('../db'), { perm, permsFor, audit, limit, wrap, bad } = require('../mw'), { enqueue } = require('../notify'), U = require('../util');
const r = express.Router();
const MAX_FAILS = 5, LOCK_MIN = 15;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sign = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, job_title: u.job_title, employee_id: u.employee_id, employee_no: u.employee_no, department: u.department, employee_name: u.employee_name, must_change_password: u.must_change_password });
const policy = (pw) => { if (typeof pw !== 'string' || pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw bad('Password must have at least 10 characters, with letters and numbers'); };
const me = (id) => q('SELECT u.*,e.employee_no,e.full_name AS employee_name,d.name AS department FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE u.id=$1', [id]).then((x) => x.rows[0]);

r.post('/login', limit(30, 15 * 60 * 1000), wrap(async (req, res) => {
  const email = U.email(req.body.email, true), pw = String(req.body.password || '');
  const u = (await q('SELECT * FROM users WHERE lower(email)=$1', [email])).rows[0];
  const fail = () => res.status(401).json({ error: 'Wrong email or password' });
  if (!u) { await bcrypt.compare(pw, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi'); return fail(); } // same timing for unknown emails
  if (u.locked_until && new Date(u.locked_until) > new Date()) return res.status(423).json({ error: 'Account locked after too many wrong passwords. Try again in a few minutes' });
  if (!(await bcrypt.compare(pw, u.password_hash))) {
    const n = u.failed_logins + 1;
    await q("UPDATE users SET failed_logins=CASE WHEN $2::int>=$3::int THEN 0 ELSE $2::int END,locked_until=CASE WHEN $2::int>=$3::int THEN now()+($4||' minutes')::interval ELSE NULL END WHERE id=$1", [u.id, n, MAX_FAILS, String(LOCK_MIN)]);
    audit({ user: u, ip: req.ip }, n >= MAX_FAILS ? 'login_locked' : 'login_failed', 'users', u.id);
    return fail();
  }
  if (!u.active) return res.status(403).json({ error: 'This account is deactivated' });
  await q('UPDATE users SET failed_logins=0,locked_until=NULL,last_login=now() WHERE id=$1', [u.id]);
  audit({ user: u, ip: req.ip }, 'login', 'users', u.id);
  res.json({ token: sign(u), user: publicUser(await me(u.id)), permissions: await permsFor(u.role) });
}));

r.get('/me', perm(), wrap(async (req, res) => res.json({ user: publicUser(await me(req.user.id)), permissions: req.perms })));

r.post('/change-password', perm(), limit(20, 15 * 60 * 1000), wrap(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(String(req.body.current || ''), u.password_hash))) throw bad('Current password is wrong');
  policy(req.body.password);
  if (req.body.password === req.body.current) throw bad('Choose a different password');
  await q('UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1', [u.id, await bcrypt.hash(req.body.password, 10)]);
  audit(req, 'change_password', 'users', u.id); res.json({ ok: true });
}));

// Forgot password: always answers the same, so the form cannot be used to find out which e-mail addresses have accounts
r.post('/forgot', limit(10, 60 * 60 * 1000), wrap(async (req, res) => {
  let email; try { email = U.email(req.body.email, true); } catch { return res.json({ ok: true }); }
  const u = (await q('SELECT id,name FROM users WHERE lower(email)=$1 AND active', [email])).rows[0];
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    await q("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [u.id, sha(token)]);
    await enqueue(email, 'Password reset', `Hello ${u.name},\n\nOpen this link within one hour to choose a new password:\n${process.env.PUBLIC_URL || ''}/reset/${token}\n\nIf you did not ask for this, ignore this message and tell the court administration.`);
  }
  res.json({ ok: true });
}));
r.post('/reset', limit(20, 60 * 60 * 1000), wrap(async (req, res) => {
  policy(req.body.password);
  const row = (await q('SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()', [sha(String(req.body.token || ''))])).rows[0];
  if (!row) throw bad('This reset link is invalid or has expired');
  await q('UPDATE users SET password_hash=$2,failed_logins=0,locked_until=NULL,must_change_password=false WHERE id=$1', [row.user_id, await bcrypt.hash(req.body.password, 10)]);
  await q('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.user_id]);
  audit({ user: { id: row.user_id }, ip: req.ip }, 'reset_password', 'users', row.user_id); res.json({ ok: true });
}));
module.exports = r; module.exports.policy = policy;
