// Training, separations (resignation / termination with clearance), announcements
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), { enqueue } = require('../notify'), E = require('./employees');
const r = express.Router();

// ---------------------------------------------------------------- training
r.get('/trainings', perm(), wrap(async (req, res) => {
  const p = [], w = []; if (!has(req, 'training.manage')) w.push(`t.employee_id=$${p.push(req.user.employee_id ?? 0)}`); else if (req.query.employee_id) w.push(`t.employee_id=$${p.push(U.int(req.query.employee_id, 'Employee'))}`);
  res.json((await q(`SELECT t.*,e.full_name,e.employee_no FROM trainings t JOIN employees e ON e.id=t.employee_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY t.start_date DESC NULLS LAST,t.id DESC LIMIT 400`, p)).rows);
}));
const tBody = (b) => { const o = { title: U.str(b.title, { req: true, max: 200, name: 'Title' }), provider: U.str(b.provider, { max: 150 }), start_date: U.str(b.start_date, { max: 10 }), end_date: U.str(b.end_date, { max: 10 }), cost: U.money(b.cost, 'Cost'), status: U.oneOf(b.status || 'planned', ['planned', 'completed', 'cancelled'], 'Status'), note: U.str(b.note, { max: 500 }) }; if (o.start_date && o.end_date && o.end_date < o.start_date) throw bad('The end date is before the start date'); return o; };
r.post('/trainings', perm('training.manage'), wrap(async (req, res) => { const o = tBody(req.body), emp = U.needRow((await q('SELECT id FROM employees WHERE id=$1', [U.int(req.body.employee_id, 'Employee', true)])).rows[0], 'Employee'), c = Object.keys(o), row = (await q(`INSERT INTO trainings(employee_id,${c},created_by) VALUES($1,${c.map((_, i) => '$' + (i + 2))},$${c.length + 2}) RETURNING *`, [emp.id, ...Object.values(o), req.user.id])).rows[0]; audit(req, 'create', 'trainings', row.id); res.status(201).json(row); }));
r.put('/trainings/:id', perm('training.manage'), wrap(async (req, res) => { const o = tBody(req.body), c = Object.keys(o), row = U.needRow((await q(`UPDATE trainings SET ${c.map((k, i) => `${k}=$${i + 2}`)} WHERE id=$1 RETURNING *`, [Number(req.params.id) || 0, ...Object.values(o)])).rows[0], 'Training'); audit(req, 'update', 'trainings', row.id); res.json(row); }));

// ---------------------------------------------------------------- announcements
r.get('/announcements', perm(), wrap(async (req, res) => res.json((await q('SELECT a.*,u.name AS author FROM announcements a LEFT JOIN users u ON u.id=a.created_by WHERE a.expires_at IS NULL OR a.expires_at>=CURRENT_DATE ORDER BY a.published_at DESC LIMIT 50')).rows)));
r.post('/announcements', perm('announcements.manage'), wrap(async (req, res) => { const exp = U.str(req.body.expires_at, { max: 10 }); if (exp && exp < H.today()) throw bad('The expiry date is in the past'); const row = (await q('INSERT INTO announcements(title,body,expires_at,created_by) VALUES($1,$2,$3,$4) RETURNING *', [U.str(req.body.title, { req: true, max: 150, name: 'Title' }), U.str(req.body.body, { req: true, max: 4000, name: 'Text' }), exp, req.user.id])).rows[0]; audit(req, 'create', 'announcements', row.id); res.status(201).json(row); }));
r.delete('/announcements/:id', perm('announcements.manage'), wrap(async (req, res) => { await q('DELETE FROM announcements WHERE id=$1', [Number(req.params.id) || 0]); audit(req, 'delete', 'announcements', req.params.id); res.sendStatus(204); }));

// ---------------------------------------------------------------- separations
const ITEMS = ['Return of equipment, keys and ID card', 'Handover of work to the manager', 'Finance: loans and advances settled', 'HR: exit interview and final documents'];
const KINDS = ['resignation', 'termination', 'end_of_contract', 'retirement', 'dismissal', 'transfer_out'];
const CASE_ONLY = ['termination', 'dismissal', 'retirement', 'transfer_out']; // these need an authorized HR case decision (routes/cases.js); a plain form is not enough
async function open(t, req, empId, b, uid, fromCase = false) {
  if (!fromCase && CASE_ONLY.includes(b.kind) && String((await H.settings()).termination_requires_case) !== 'false') throw bad('This kind of separation needs an approved HR case (Cases → ' + b.kind + ') with an authorized decision', 403);
  const emp = U.needRow((await t.query("SELECT * FROM employees WHERE id=$1 AND status<>'terminated' FOR UPDATE", [empId])).rows[0], 'Employee'), kind = U.oneOf(b.kind, KINDS, 'Type'), last = U.str(b.last_day, { req: true, max: 10, name: 'Last working day' });
  if (isNaN(new Date(last))) throw bad('Date is not valid'); if (last < H.today() && !has(req, 'separations.manage')) throw bad('The last working day cannot be in the past'); if (last < String(emp.hire_date).slice(0, 10)) throw bad('The last working day is before the hire date');
  if ((await t.query("SELECT 1 FROM separations WHERE employee_id=$1 AND status='pending'", [empId])).rows[0]) throw bad('A separation is already open for this employee', 409);
  const s = (await t.query('INSERT INTO separations(employee_id,kind,last_day,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [empId, kind, last, U.str(b.reason, { max: 1000 }), uid])).rows[0];
  for (const it of ITEMS) await t.query('INSERT INTO separation_clearance(separation_id,item) VALUES($1,$2)', [s.id, it]);
  await t.query("UPDATE employees SET status='on_notice' WHERE id=$1", [empId]); await E.hist(t, empId, 'status_change', 'active', 'on_notice', `${kind} – last day ${last}`, uid); return s;
}
r.get('/separations', perm('separations.manage'), wrap(async (req, res) => res.json((await q(`SELECT s.*,e.full_name,e.employee_no,d.name AS department,(SELECT count(*) FROM separation_clearance c WHERE c.separation_id=s.id AND NOT c.cleared)::int AS open_items FROM separations s JOIN employees e ON e.id=s.employee_id LEFT JOIN departments d ON d.id=e.department_id ORDER BY (s.status='pending') DESC,s.last_day DESC LIMIT 300`)).rows)));
r.get('/separations/mine', perm(), wrap(async (req, res) => res.json(req.user.employee_id ? (await q("SELECT id,kind,notice_date,last_day,status,reason FROM separations WHERE employee_id=$1 ORDER BY id DESC", [req.user.employee_id])).rows : [])));
r.get('/separations/:id', perm('separations.manage'), wrap(async (req, res) => { const s = U.needRow((await q('SELECT s.*,e.full_name,e.employee_no FROM separations s JOIN employees e ON e.id=s.employee_id WHERE s.id=$1', [Number(req.params.id) || 0])).rows[0], 'Separation'); res.json({ ...s, items: (await q('SELECT c.*,u.name AS cleared_by_name FROM separation_clearance c LEFT JOIN users u ON u.id=c.cleared_by WHERE c.separation_id=$1 ORDER BY c.id', [s.id])).rows }); }));
r.post('/separations', perm('separations.manage'), wrap(async (req, res) => { const s = await tx((t) => open(t, req, U.int(req.body.employee_id, 'Employee', true), req.body, req.user.id)); audit(req, 'create', 'separations', s.id, s.kind); res.status(201).json(s); }));
// an employee hands in their own resignation; the notice period comes from the settings
r.post('/separations/resign', perm(), wrap(async (req, res) => {
  if (!req.user.employee_id) throw bad('Your account is not linked to an employee record'); const days = Number((await H.settings()).notice_days) || 30, min = H.addDays(H.today(), days);
  if (String(req.body.last_day || '') < min) throw bad(`A resignation needs at least ${days} days notice. The last working day must be ${min} or later`);
  const s = await tx((t) => open(t, req, req.user.employee_id, { ...req.body, kind: 'resignation' }, req.user.id)); audit(req, 'resign', 'separations', s.id); res.status(201).json(s);
}));
r.post('/separations/:id/clear/:itemId', perm('separations.manage'), wrap(async (req, res) => {
  await tx(async (t) => {
    const s = U.needRow((await t.query("SELECT * FROM separations WHERE id=$1 AND status='pending'", [Number(req.params.id) || 0])).rows[0], 'Open separation'), it = U.needRow((await t.query('SELECT * FROM separation_clearance WHERE id=$1 AND separation_id=$2', [Number(req.params.itemId) || 0, s.id])).rows[0], 'Clearance item'), on = !!req.body.cleared;
    await t.query('UPDATE separation_clearance SET cleared=$2,cleared_by=$3,cleared_at=CASE WHEN $2 THEN now() END,note=$4 WHERE id=$1', [it.id, on, req.user.id, U.str(req.body.note, { max: 300 })]);
  });
  audit(req, 'clear', 'separations', req.params.id); res.json({ ok: true });
}));
r.post('/separations/:id/complete', perm('separations.manage'), wrap(async (req, res) => {
  const s = await tx(async (t) => {
    const s = U.needRow((await t.query("SELECT * FROM separations WHERE id=$1 AND status='pending' FOR UPDATE", [Number(req.params.id) || 0])).rows[0], 'Open separation'), last = String(s.last_day).slice(0, 10);
    if (last > H.today()) throw bad(`The last working day (${last}) has not arrived yet`);
    if ((await t.query('SELECT 1 FROM separation_clearance WHERE separation_id=$1 AND NOT cleared', [s.id])).rows[0]) throw bad('Every clearance item must be cleared first');
    const reports = Number((await t.query("SELECT count(*) FROM employees WHERE manager_id=$1 AND status<>'terminated'", [s.employee_id])).rows[0].count); if (reports) throw bad(`This employee still has ${reports} direct report(s). Assign them a new manager first`);
    await t.query("UPDATE leave_requests SET status='cancelled',decision_note='Employee left the organisation' WHERE employee_id=$1 AND status IN('pending','approved') AND start_date>$2", [s.employee_id, last]);
    await t.query("UPDATE employees SET status='terminated',termination_date=$2 WHERE id=$1", [s.employee_id, last]); await t.query('UPDATE departments SET head_employee_id=NULL WHERE head_employee_id=$1', [s.employee_id]);
    await t.query('UPDATE users SET active=false WHERE employee_id=$1', [s.employee_id]); await E.hist(t, s.employee_id, 'separation', 'on_notice', 'terminated', `${s.kind}: ${s.reason || ''}`, req.user.id, last);
    return (await t.query("UPDATE separations SET status='completed',completed_at=now() WHERE id=$1 RETURNING *", [s.id])).rows[0];
  });
  audit(req, 'complete', 'separations', s.id); res.json(s);
}));
r.post('/separations/:id/cancel', perm('separations.manage'), wrap(async (req, res) => {
  const s = await tx(async (t) => { const s = U.needRow((await t.query("UPDATE separations SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING *", [Number(req.params.id) || 0])).rows[0], 'Open separation'); await t.query("UPDATE employees SET status='active' WHERE id=$1 AND status='on_notice'", [s.employee_id]); await E.hist(t, s.employee_id, 'status_change', 'on_notice', 'active', 'Separation cancelled', req.user.id); return s; });
  audit(req, 'cancel', 'separations', s.id); res.json(s);
}));
module.exports = r; module.exports.openSeparation = open;
