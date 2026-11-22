const jwt = require('jsonwebtoken'), { q } = require('./db');
const SUPER = 'super_admin';
// HR work (HR cases, discipline, recruitment, separations, uniforms and work tools, permanent employment) belongs to the HR department ALONE:
// the technical owner account (all-rights) does not pass these checks; HR staff hold them through their role or a named designation.
const HR_ONLY = new Set(['cases.manage', 'cases.decide_hr', 'cases.authorize', 'discipline.manage', 'recruitment.manage', 'separations.manage', 'ppe.manage', 'ppe.exception', 'employment.confirm']);

const bad = (m, http = 400) => Object.assign(new Error(m), { http });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  if (e.http) return res.status(e.http).json({ error: e.message });
  if (e.code === '23505') return res.status(409).json({ error: 'A record with this value already exists' });
  if (e.code === '23503') return res.status(400).json({ error: 'A linked record does not exist or is still in use' });
  if (e.code === '23514') return res.status(400).json({ error: 'One of the values is out of the allowed range' });
  if (e.code === '22P02' || e.code === '22007' || e.code === '22003') return res.status(400).json({ error: 'One of the values has the wrong format' });
  if (e.code === 'P0001') return res.status(400).json({ error: e.message });
  console.error(e); res.status(500).json({ error: 'Server error' });
});

const permsFor = async (role) => role === SUPER ? (await q('SELECT code FROM permissions ORDER BY code')).rows.map((x) => x.code)
  : (await q('SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code=$1 ORDER BY p.code', [role])).rows.map((x) => x.code);

// perm(...codes): the signed-in staff member needs ANY of the listed permissions.
// The user's CURRENT role / active flag / permissions are read from the database on every request, so deactivating an account
// or editing a role takes effect immediately, not when the token expires.
const perm = (...codes) => async (req, res, next) => {
  try {
    let t; try { t = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Not authenticated' }); }
    const u = (await q('SELECT id,name,email,role,employee_id,active FROM users WHERE id=$1', [t.id])).rows[0];
    if (!u || !u.active) return res.status(401).json({ error: 'This account is deactivated' });
    req.user = u; req.perms = await permsFor(u.role);
    // HR officers designated BY NAME to decide for the HR authority get that one permission (revoking takes effect on the next request)
    if (u.role !== SUPER && req.perms.includes('cases.manage') && !req.perms.includes('cases.decide_hr') && (await q('SELECT 1 FROM authority_delegates WHERE user_id=$1 AND revoked_at IS NULL AND permission=$2', [u.id, 'cases.decide_hr'])).rows[0]) req.perms.push('cases.decide_hr');
    if (!codes.length || (u.role === SUPER ? codes.some((c) => !HR_ONLY.has(c)) : codes.some((c) => req.perms.includes(c)))) return next();
    res.status(403).json({ error: 'You do not have permission for this action' });
  } catch (e) { next(e); }
};
const has = (req, code) => (req.user.role === SUPER ? !HR_ONLY.has(code) : req.perms.includes(code));

// audit(req, action, entity, id, detail): append-only record of who did what
const audit = (req, action, entity, id, detail) =>
  q('INSERT INTO audit_logs(user_id,action,entity,entity_id,detail,ip) VALUES($1,$2,$3,$4,$5,$6)', [req.user?.id ?? null, action, entity, id == null ? null : String(id), detail || null, req.ip]).catch(console.error);

// Small in-memory per-IP rate limiter
const limit = (max, windowMs, key = (req) => req.ip) => {
  max = max * (Number(process.env.RATE_LIMIT_MULT) || 1); // tests raise the limits; production leaves this unset
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req), n = Date.now(), h = hits.get(k) && hits.get(k).reset > n ? hits.get(k) : { count: 0, reset: n + windowMs };
    h.count++; hits.set(k, h);
    if (h.count > max) return res.status(429).json({ error: 'Too many attempts, try again later' });
    next();
  };
};
module.exports = { perm, has, permsFor, audit, limit, wrap, bad, SUPER, HR_ONLY };
