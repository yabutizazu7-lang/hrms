// Lookups, users, roles & permissions, settings, tax brackets, audit trail, e-mail log
const express = require('express'), bcrypt = require('bcryptjs'), crypto = require('crypto'), H = require('../hr');
const { q, tx } = require('../db'), { perm, has, audit, wrap, bad, SUPER } = require('../mw'), U = require('../util'), { enqueue, live, flush } = require('../notify'), { policy } = require('./auth');
const r = express.Router();

// ---------------------------------------------------------------- lookups (dropdowns) every signed-in user may read
r.get('/lookups', perm(), wrap(async (req, res) => {
  const [deps, pos, types, roles] = await Promise.all([q('SELECT id,code,name,parent_id FROM departments WHERE active ORDER BY name'), q('SELECT id,code,title,department_id FROM positions WHERE active ORDER BY title'), q('SELECT id,code,name,paid,sex_restriction,requires_document FROM leave_types WHERE active ORDER BY name'), q('SELECT code,name FROM roles ORDER BY id')]);
  res.json({ departments: deps.rows, positions: pos.rows, leave_types: types.rows, roles: roles.rows });
}));

// ---------------------------------------------------------------- users
const ULIST = 'SELECT u.id,u.name,u.email,u.role,u.job_title,u.employee_id,e.employee_no,u.active,u.last_login,u.locked_until,u.created_at FROM users u LEFT JOIN employees e ON e.id=u.employee_id';
const genPassword = () => crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'a1';
async function checkRole(req, role) { U.needRow((await q('SELECT 1 FROM roles WHERE code=$1', [role])).rows[0], 'Role'); if (role === SUPER && req.user.role !== SUPER) throw bad('Only a Super Admin can create another Super Admin', 403); }
r.get('/users', perm('users.manage'), wrap(async (req, res) => res.json((await q(`${ULIST} ORDER BY u.active DESC,u.name`)).rows)));
r.post('/users', perm('users.manage'), wrap(async (req, res) => {
  const b = req.body, role = U.str(b.role, { req: true, name: 'Role' }); await checkRole(req, role); const pw = b.password ? (policy(b.password), b.password) : genPassword();
  const row = (await q('INSERT INTO users(name,email,password_hash,role,employee_id,job_title,must_change_password) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id,name,email', [U.str(b.name, { req: true, max: 150, name: 'Name' }), U.email(b.email, true), await bcrypt.hash(pw, 10), role, U.int(b.employee_id, 'Employee'), U.str(b.job_title, { max: 100, name: 'Job title' }) || null])).rows[0];
  await enqueue(row.email, 'Your HR system account', `Hello ${row.name},\n\nAn account was created for you.\nAddress: ${process.env.PUBLIC_URL || ''}/login\nEmail: ${row.email}\nTemporary password: ${pw}\n\nYou must choose a new password at your first sign-in.`);
  audit(req, 'create', 'users', row.id, role); res.status(201).json({ ...row, mail: live() ? 'queued' : 'simulated' });
}));
r.put('/users/:id', perm('users.manage'), wrap(async (req, res) => {
  const id = Number(req.params.id) || 0, b = req.body, cur = U.needRow((await q('SELECT * FROM users WHERE id=$1', [id])).rows[0], 'User'); if (cur.role === SUPER && req.user.role !== SUPER) throw bad('Only a Super Admin can edit a Super Admin', 403);
  const role = b.role !== undefined ? U.str(b.role, { req: true, name: 'Role' }) : cur.role; if (role !== cur.role) await checkRole(req, role); const active = b.active !== undefined ? !!b.active : cur.active;
  if (id === req.user.id && (!active || role !== cur.role)) throw bad('You cannot deactivate or change the role of your own account');
  if (cur.role === SUPER && (!active || role !== SUPER) && Number((await q('SELECT count(*) FROM users WHERE role=$1 AND active', [SUPER])).rows[0].count) < 2) throw bad('At least one active Super Admin must remain');
  const row = (await q('UPDATE users SET name=$2,email=$3,role=$4,active=$5,job_title=$6 WHERE id=$1 RETURNING id', [id, b.name !== undefined ? U.str(b.name, { req: true, max: 150, name: 'Name' }) : cur.name, b.email !== undefined ? U.email(b.email, true) : cur.email, role, active, b.job_title !== undefined ? (U.str(b.job_title, { max: 100, name: 'Job title' }) || null) : cur.job_title])).rows[0]; audit(req, 'update', 'users', id, `role=${role} active=${active}`); res.json(row);
}));
r.post('/users/:id/reset-password', perm('users.manage'), wrap(async (req, res) => { const u = U.needRow((await q('SELECT id,name,email,role FROM users WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'User'); if (u.role === SUPER && req.user.role !== SUPER) throw bad('Only a Super Admin can reset a Super Admin', 403); const pw = genPassword(); await q('UPDATE users SET password_hash=$2,must_change_password=true,failed_logins=0,locked_until=NULL WHERE id=$1', [u.id, await bcrypt.hash(pw, 10)]); await enqueue(u.email, 'Your password was reset', `Hello ${u.name},\n\nYour temporary password is: ${pw}\nYou must choose a new one at your next sign-in.`); audit(req, 'reset_password', 'users', u.id); res.json({ ok: true, mail: live() ? 'queued' : 'simulated' }); }));
r.post('/users/:id/unlock', perm('users.manage'), wrap(async (req, res) => { await q('UPDATE users SET failed_logins=0,locked_until=NULL WHERE id=$1', [Number(req.params.id) || 0]); audit(req, 'unlock', 'users', req.params.id); res.json({ ok: true }); }));

// ---------------------------------------------------------------- roles & permissions
r.get('/rbac', perm('roles.manage'), wrap(async (req, res) => {
  const [roles, permissions, grants] = await Promise.all([
    q('SELECT r.code,r.name,r.description,(SELECT count(*) FROM users u WHERE u.role=r.code)::int AS users,(SELECT count(*) FROM role_permissions rp WHERE rp.role_id=r.id)::int AS permissions FROM roles r ORDER BY r.id'),
    q('SELECT code,module,description FROM permissions ORDER BY module,code'),
    q('SELECT r.code AS role,p.code AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id'),
  ]);
  res.json({ roles: roles.rows, permissions: permissions.rows, grants: grants.rows });
}));
r.put('/roles/:code/permissions', perm('roles.manage'), wrap(async (req, res) => {
  const code = req.params.code; if (code === SUPER) throw bad('The Super Admin role always has everything');
  const list = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  await tx(async (t) => {
    const role = U.needRow((await t.query('SELECT id FROM roles WHERE code=$1', [code])).rows[0], 'Role');
    // Separation of duties: only a Super Admin can hand out the right to edit roles
    if (list.includes('roles.manage') && req.user.role !== SUPER) throw bad('Only a Super Admin can grant role management', 403);
    await t.query('DELETE FROM role_permissions WHERE role_id=$1', [role.id]);
    await t.query('INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE code=ANY($2)', [role.id, list]);
  });
  audit(req, 'permissions', 'roles', code, `${list.length} permissions`); res.json({ ok: true });
}));

// ---------------------------------------------------------------- system settings (config.manage)
const optNum = (lo, hi) => (v) => (v === '' || v == null ? '' : String(num(v, lo, hi)));   // blank = not configured
const SETTING_RULES = { retirement_age_source: (v) => U.str(v, { max: 300 }) || '', retirement_age_years: optNum(40, 90), retirement_min_service_years: optNum(0, 60), ppe_wait_months: (v) => num(v, 0, 60), termination_requires_case: (v) => (['true', 'false'].includes(String(v)) ? String(v) : (() => { throw bad('Must be true or false'); })()), hr_manager_name: (v) => U.str(v, { max: 120 }) || '', org_name_am: (v) => U.str(v, { max: 120 }) || '', org_name: (v) => U.str(v, { req: true, max: 120, name: 'Organization name' }), currency: (v) => U.str(v, { req: true, max: 5, name: 'Currency' }), work_start: (v) => time(v), work_end: (v) => time(v), grace_minutes: (v) => num(v, 0, 240), weekend_days: (v) => { const a = String(v).split(',').map((x) => x.trim()).filter(Boolean); if (a.some((x) => !/^[0-6]$/.test(x))) throw bad('Weekend days: use numbers 0 (Sunday) to 6 (Saturday), separated by commas'); return a.join(','); },
  probation_months: (v) => num(v, 1, 24), probation_auto_permanent: (v) => { if (!['0', '1'].includes(String(v))) throw bad('Automatic permanent employment must be 1 (yes) or 0 (no)'); return String(v); }, notice_days: (v) => num(v, 0, 365), alert_days: (v) => num(v, 1, 365), timezone: (v) => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return v; } catch { throw bad('Time zone is not valid'); } } };
const time = (v) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw bad('Time is not valid (use HH:MM)'); return String(v); };
const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw bad('Value is out of range'); return String(n); };
r.get('/settings', perm('config.manage'), wrap(async (req, res) => res.json(await H.settings(true))));
r.put('/settings', perm('config.manage'), wrap(async (req, res) => {
  const keys = Object.keys(req.body || {}).filter((k) => SETTING_RULES[k]); if (!keys.length) throw bad('No changes');
  await tx(async (t) => { for (const k of keys) await t.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, SETTING_RULES[k](req.body[k])]); }); H.clearSettings(); audit(req, 'update', 'settings', null, keys.join(',')); res.json(await H.settings(true));
}));

// ---------------------------------------------------------------- audit trail + e-mail log
// audit trail: filter by period (2 weeks, 1/3/6/9 months, 1 year), search, user; paged; summary; CSV export. Entries are immutable.
const PERIODS = { '2w': '14 days', '1m': '1 month', '3m': '3 months', '6m': '6 months', '9m': '9 months', '1y': '1 year', all: null };
// HR scope (audit.view_hr without audit.view): HR records only. Accounts, roles, settings and sign-in events are out of scope,
// and disciplinary cases are hidden unless the viewer may handle discipline.
const HR_ENTITIES = ['employees', 'employee_documents', 'hr_cases', 'separations', 'vacancies', 'applicants', 'appraisals', 'appraisal_cycles', 'appraisal_criteria', 'service_periods', 'ppe_issues', 'ppe_entitlements', 'ppe_stock_moves', 'ppe_items', 'leave_requests', 'leave_types', 'leave_adjustments', 'trainings', 'staff_positions', 'positions', 'departments', 'hr_plans', 'hr_plan_items', 'hr_plan_progress', 'verification_flags', 'announcements', 'holidays', 'attendance', 'attendance_corrections', 'case_approval_rules', 'discipline_sanctions'];
function auditFilter(req) {
  const w = [], p = [];
  if (!has(req, 'audit.view')) {
    p.push(HR_ENTITIES); w.push(`a.entity = ANY($${p.length}::text[])`);
    if (!has(req, 'discipline.manage') && !has(req, 'discipline.decide')) w.push("NOT (a.entity='hr_cases' AND a.entity_id ~ '^[0-9]+$' AND a.entity_id::int IN (SELECT id FROM hr_cases WHERE case_type='disciplinary'))");
  }
  if (req.query.period) { const iv = PERIODS[U.oneOf(req.query.period, Object.keys(PERIODS), 'Period')]; if (iv) w.push(`a.at >= now() - interval '${iv}'`); }   // interval comes from the fixed map above, never from the request
  if (req.query.q) { p.push(`%${String(req.query.q).slice(0, 100)}%`); w.push(`(a.action ILIKE $${p.length} OR a.entity ILIKE $${p.length} OR a.detail ILIKE $${p.length} OR a.entity_id ILIKE $${p.length} OR u.name ILIKE $${p.length})`); }
  if (req.query.user_id) w.push(`a.user_id=$${p.push(Number(req.query.user_id) || 0)}`);
  if (req.query.action) w.push(`a.action=$${p.push(String(req.query.action).slice(0, 60))}`);
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', p };
}
r.get('/audit', perm('audit.view', 'audit.view_hr'), wrap(async (req, res) => {
  const { where, p } = auditFilter(req), size = Math.min(500, Math.max(1, Number(req.query.page_size) || 500)), page = Math.max(1, Number(req.query.page) || 1);
  const total = Number((await q(`SELECT count(*) FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where}`, p)).rows[0].count); res.set('X-Total-Count', String(total));
  res.json((await q(`SELECT a.id,a.at,a.action,a.entity,a.entity_id,a.detail,a.ip,u.name AS user_name,u.role FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} ORDER BY a.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows);
}));
r.get('/audit/summary', perm('audit.view', 'audit.view_hr'), wrap(async (req, res) => {
  const { where, p } = auditFilter(req);
  const [t, a, u, d] = await Promise.all([q(`SELECT count(*)::int AS entries,count(DISTINCT a.user_id)::int AS users,min(a.at) AS first,max(a.at) AS last FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where}`, p), q(`SELECT a.action,count(*)::int AS n FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} GROUP BY a.action ORDER BY n DESC LIMIT 8`, p), q(`SELECT COALESCE(u.name,'—') AS user_name,count(*)::int AS n FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} GROUP BY u.name ORDER BY n DESC LIMIT 5`, p), q(`SELECT (a.at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS n FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 400`, p)]);
  res.json({ scope: has(req, 'audit.view') ? 'all' : 'hr', ...t.rows[0], by_action: a.rows, by_user: u.rows, by_day: d.rows });
}));
// CSV of the chosen period (up to 50,000 entries). Cells that start with = + - @ are neutralised so a spreadsheet cannot run them. The export itself is audited.
r.get('/audit/export', perm('audit.view', 'audit.view_hr'), wrap(async (req, res) => {
  const { where, p } = auditFilter(req), rows = (await q(`SELECT a.id,a.at,u.name AS user_name,u.role,a.action,a.entity,a.entity_id,a.detail,a.ip FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} ORDER BY a.id DESC LIMIT 50000`, p)).rows;
  const cell = (v) => { let t = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  audit(req, 'export', 'audit_logs', null, `period=${req.query.period || 'all'} rows=${rows.length}`);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-trail-${req.query.period || 'all'}.csv"`, 'Cache-Control': 'no-store' }).send('\uFEFF' + ['id,at,user,role,action,entity,entity_id,detail,ip', ...rows.map((r) => [r.id, r.at, r.user_name, r.role, r.action, r.entity, r.entity_id, r.detail, r.ip].map(cell).join(','))].join('\r\n'));
}));
r.get('/notifications', perm('email.view'), wrap(async (req, res) => res.json({ live: live(), rows: (await q('SELECT id,to_email,subject,status,attempts,error,created_at,sent_at FROM notifications ORDER BY id DESC LIMIT 300')).rows })));
r.post('/notifications/:id/retry', perm('email.view'), wrap(async (req, res) => { await q("UPDATE notifications SET status='queued',attempts=0,next_try_at=now(),error=NULL WHERE id=$1 AND status='failed'", [Number(req.params.id) || 0]); flush(); res.json({ ok: true }); }));
module.exports = r;
