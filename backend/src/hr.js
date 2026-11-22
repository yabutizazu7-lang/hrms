// Shared HR helpers: settings, working-day arithmetic, employee visibility.
const { q } = require('./db'), { has } = require('./mw');
let cache = null, at = 0;
async function settings(force) { if (!force && cache && Date.now() - at < 30000) return cache; cache = Object.fromEntries((await q('SELECT key,value FROM settings')).rows.map((r) => [r.key, r.value])); at = Date.now(); return cache; }
const clearSettings = () => { cache = null; };
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// working days between two dates (inclusive): not a weekend day, not a public holiday
async function workingDays(from, to, c = { query: q }) {
  const st = await settings(), weekend = String(st.weekend_days || '0,6').split(',').map(Number);
  const hol = new Set((await c.query('SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN $1 AND $2', [from, to])).rows.map((x) => iso(x.holiday_date)));
  let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) { if (!weekend.includes(new Date(d + 'T00:00:00Z').getUTCDay()) && !hol.has(d)) n++; }
  return n;
}
// Employees the signed-in user may see: everyone (hr.view_all) / own line of reports (team.view) / themselves.
function empScope(req, params, a = 'e', allPerm = 'hr.view_all') {
  if (has(req, allPerm)) return 'TRUE';
  const me = req.user.employee_id, parts = [];
  if (me) parts.push(`${a}.id=$${params.push(me)}`);
  if (me && has(req, 'team.view')) parts.push(`${a}.id IN (WITH RECURSIVE t AS (SELECT id FROM employees WHERE manager_id=$${params.push(me)} UNION SELECT x.id FROM employees x JOIN t ON x.manager_id=t.id) SELECT id FROM t)`);
  return parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
}
const isDirectManager = async (c, mgrEmpId, empId) => !!mgrEmpId && !!(await c.query('SELECT 1 FROM employees WHERE id=$1 AND manager_id=$2', [empId, mgrEmpId])).rows[0];
const inDownline = async (c, mgrEmpId, empId) => !!mgrEmpId && !!(await c.query('WITH RECURSIVE t AS (SELECT id FROM employees WHERE manager_id=$1 UNION SELECT x.id FROM employees x JOIN t ON x.manager_id=t.id) SELECT 1 FROM t WHERE id=$2', [mgrEmpId, empId])).rows[0];
const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
module.exports = { settings, clearSettings, iso, addDays, workingDays, empScope, isDirectManager, inDownline, today, round2 };
