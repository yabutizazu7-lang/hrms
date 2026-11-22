const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), { enqueue } = require('../notify');
const r = express.Router();

r.get('/holidays', perm(), wrap(async (req, res) => { const y = U.int(req.query.year || new Date().getFullYear(), 'Year'); res.json((await q('SELECT * FROM holidays WHERE EXTRACT(year FROM holiday_date)=$1 ORDER BY holiday_date', [y])).rows); }));
r.post('/holidays', perm('config.manage'), wrap(async (req, res) => { const d = U.str(req.body.holiday_date, { req: true, max: 10, name: 'Date' }); if (isNaN(new Date(d))) throw bad('Date is not valid'); const row = (await q('INSERT INTO holidays(holiday_date,name) VALUES($1,$2) RETURNING *', [d, U.str(req.body.name, { req: true, max: 100, name: 'Name' })])).rows[0]; H.clearSettings(); audit(req, 'create', 'holidays', row.id); res.status(201).json(row); }));
r.delete('/holidays/:id', perm('config.manage'), wrap(async (req, res) => { await q('DELETE FROM holidays WHERE id=$1', [Number(req.params.id) || 0]); audit(req, 'delete', 'holidays', req.params.id); res.sendStatus(204); }));

r.get('/leave-types', perm(), wrap(async (req, res) => res.json((await q('SELECT * FROM leave_types ORDER BY active DESC,name')).rows)));
const typeBody = (b) => ({ code: (U.str(b.code, { req: true, max: 8, name: 'Code' }) || '').toUpperCase(), name: U.str(b.name, { req: true, max: 80, name: 'Name' }), days_per_year: b.days_per_year === '' || b.days_per_year == null ? null : U.money(b.days_per_year, 'Days per year'),
  increment_every_years: U.int(b.increment_every_years ?? 0, 'Years'), increment_days: U.money(b.increment_days ?? 0, 'Extra days'), paid: b.paid === undefined ? true : !!b.paid, prorate_first_year: !!b.prorate_first_year, requires_document: !!b.requires_document,
  sex_restriction: U.oneOf(b.sex_restriction || null, ['male', 'female'], 'Sex', false), min_notice_days: U.int(b.min_notice_days ?? 0, 'Notice days'), active: b.active === undefined ? true : !!b.active });
r.post('/leave-types', perm('config.manage'), wrap(async (req, res) => { const b = typeBody(req.body), c = Object.keys(b), row = (await q(`INSERT INTO leave_types(${c}) VALUES(${c.map((_, i) => '$' + (i + 1))}) RETURNING *`, Object.values(b))).rows[0]; audit(req, 'create', 'leave_types', row.id); res.status(201).json(row); }));
r.put('/leave-types/:id', perm('config.manage'), wrap(async (req, res) => { const b = typeBody(req.body), c = Object.keys(b), row = U.needRow((await q(`UPDATE leave_types SET ${c.map((k, i) => `${k}=$${i + 2}`)} WHERE id=$1 RETURNING *`, [Number(req.params.id) || 0, ...Object.values(b)])).rows[0], 'Leave type'); audit(req, 'update', 'leave_types', row.id); res.json(row); }));

// Entitlement for one employee, one leave type and one year: base days + service-year increments (+ first-year proration) + HR adjustments
async function balances(c, emp, year) {
  const types = (await c.query('SELECT * FROM leave_types WHERE active ORDER BY id')).rows;
  const [adj, used, pend] = await Promise.all([c.query('SELECT leave_type_id,sum(days) AS d FROM leave_adjustments WHERE employee_id=$1 AND year=$2 GROUP BY 1', [emp.id, year]),
    c.query("SELECT leave_type_id,sum(days) AS d FROM leave_requests WHERE employee_id=$1 AND status='approved' AND EXTRACT(year FROM start_date)=$2 GROUP BY 1", [emp.id, year]), c.query("SELECT leave_type_id,sum(days) AS d FROM leave_requests WHERE employee_id=$1 AND status='pending' AND EXTRACT(year FROM start_date)=$2 GROUP BY 1", [emp.id, year])]);
  const A = Object.fromEntries(adj.rows.map((x) => [x.leave_type_id, Number(x.d)])), Uu = Object.fromEntries(used.rows.map((x) => [x.leave_type_id, Number(x.d)])), P = Object.fromEntries(pend.rows.map((x) => [x.leave_type_id, Number(x.d)]));
  const hire = new Date(String(emp.hire_date).slice(0, 10) + 'T00:00:00Z'), yearEnd = new Date(Date.UTC(year, 11, 31));
  return types.filter((t) => !t.sex_restriction || t.sex_restriction === emp.sex).map((t) => {
    let ent = null;
    if (t.days_per_year != null) {
      ent = Number(t.days_per_year); const years = Math.max(0, Math.floor((yearEnd - hire) / 31557600000));
      if (t.increment_every_years > 0) ent += Math.floor(years / t.increment_every_years) * Number(t.increment_days);
      if (t.prorate_first_year && hire.getUTCFullYear() === year) ent = Math.floor(ent * ((yearEnd - hire) / 864e5 + 1) / 365 * 2) / 2; // joined this year: pro rata, rounded down to half days
      if (hire.getUTCFullYear() > year) ent = 0;
    }
    const adjd = A[t.id] || 0, usedd = Uu[t.id] || 0, pending = P[t.id] || 0;
    return { leave_type_id: t.id, code: t.code, name: t.name, paid: t.paid, entitlement: ent, adjustments: adjd, used: usedd, pending, balance: ent == null ? null : ent + adjd - usedd, available: ent == null ? null : ent + adjd - usedd - pending };
  });
}
const canSee = async (req, empId) => { if (empId === req.user.employee_id || has(req, 'leave.manage')) return; if (has(req, 'team.view') && await H.inDownline({ query: q }, req.user.employee_id, empId)) return; throw bad('Employee not found', 404); };
r.get('/leave/balances', perm(), wrap(async (req, res) => {
  const empId = U.int(req.query.employee_id ?? req.user.employee_id, 'Employee', true); await canSee(req, empId);
  const emp = U.needRow((await q('SELECT id,sex,hire_date,full_name FROM employees WHERE id=$1', [empId])).rows[0], 'Employee'), year = U.int(req.query.year || new Date().getFullYear(), 'Year');
  res.json({ employee: emp.full_name, year, balances: await balances({ query: q }, emp, year) });
}));

const LSEL = `SELECT l.*,t.name AS type_name,t.code AS type_code,t.paid,e.full_name AS employee_name,e.employee_no,e.manager_id,d.name AS department,u.name AS decided_by_name FROM leave_requests l JOIN leave_types t ON t.id=l.leave_type_id JOIN employees e ON e.id=l.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users u ON u.id=l.decided_by`;
r.get('/leave/requests', perm(), wrap(async (req, res) => {
  const p = [], w = [H.empScope(req, p, 'e', 'leave.manage')], f = req.query;
  if (f.status) w.push(`l.status=$${p.push(f.status)}`); if (f.employee_id) w.push(`l.employee_id=$${p.push(U.int(f.employee_id, 'Employee'))}`); if (f.mine === '1') w.push(`l.employee_id=$${p.push(req.user.employee_id ?? 0)}`);
  if (f.approvals === '1') { w.push("l.status='pending'"); if (!has(req, 'leave.manage')) w.push(`e.manager_id=$${p.push(req.user.employee_id ?? 0)}`); }
  if (f.year) w.push(`EXTRACT(year FROM l.start_date)=$${p.push(U.int(f.year, 'Year'))}`);
  res.json((await q(`${LSEL} WHERE ${w.join(' AND ')} ORDER BY (l.status='pending') DESC,l.start_date DESC LIMIT 400`, p)).rows.map((x) => ({ ...x, can_decide: x.status === 'pending' && x.employee_id !== req.user.employee_id && (has(req, 'leave.manage') || (has(req, 'leave.approve') && x.manager_id === req.user.employee_id)) })));
}));
r.post('/leave/requests', perm(), wrap(async (req, res) => {
  const b = req.body || {}, empId = U.int(b.employee_id ?? req.user.employee_id, 'Employee', true);
  if (empId !== req.user.employee_id && !has(req, 'leave.manage')) throw bad('You can only request leave for yourself', 403);
  const out = await tx(async (t) => {
    const emp = U.needRow((await t.query('SELECT * FROM employees WHERE id=$1 FOR UPDATE', [empId])).rows[0], 'Employee'); if (emp.status === 'terminated') throw bad('A former employee cannot request leave');
    const type = U.needRow((await t.query('SELECT * FROM leave_types WHERE id=$1 AND active', [U.int(b.leave_type_id, 'Leave type', true)])).rows[0], 'Leave type');
    if (type.sex_restriction && type.sex_restriction !== emp.sex) throw bad('This type of leave does not apply to this employee');
    const s = U.str(b.start_date, { req: true, max: 10, name: 'Start date' }), e = U.str(b.end_date || b.start_date, { max: 10 }); if (isNaN(new Date(s)) || isNaN(new Date(e))) throw bad('Date is not valid'); if (e < s) throw bad('The end date is before the start date');
    if (s.slice(0, 4) !== e.slice(0, 4)) throw bad('A leave request cannot cross the end of the year. Make one request for each year');
    if ((new Date(e) - new Date(s)) / 864e5 > 370) throw bad('Date is not valid');
    const today = H.today(), notice = (new Date(s) - new Date(today)) / 864e5;
    if (s < H.addDays(today, -30) && !has(req, 'leave.manage')) throw bad('Leave cannot be requested more than 30 days after it started. Ask HR');
    if (notice < Number(type.min_notice_days) && s >= today && !has(req, 'leave.manage')) throw bad(`This type of leave needs at least ${type.min_notice_days} days notice`);
    const days = await H.workingDays(s, e, t); if (days <= 0) throw bad('The selected dates contain no working days');
    if ((await t.query("SELECT 1 FROM leave_requests WHERE employee_id=$1 AND status IN('pending','approved') AND start_date<=$3 AND end_date>=$2", [empId, s, e])).rows[0]) throw bad('This overlaps with another leave request of the employee', 409);
    const year = Number(s.slice(0, 4)), bal = (await balances(t, emp, year)).find((x) => x.leave_type_id === type.id);
    if (bal && bal.available != null && days > bal.available) throw bad(`Not enough leave days: ${days} requested, ${bal.available} available`);
    let hasDoc = false; if (b.document) { const f = F.save('emp/' + empId, b.document); await t.query("INSERT INTO employee_documents(employee_id,doc_type,title,filename,mime,size_bytes,sha256,storage_name,uploaded_by,confidential) VALUES($1,'medical',$2,$3,$4,$5,$6,$7,$8,true)", [empId, `${type.name} certificate ${s}`, f.filename, f.mime, f.size, f.sha256, f.storage, req.user.id]); hasDoc = true; }
    if (type.requires_document && !hasDoc) throw bad('A medical certificate or supporting document is required for this type of leave');
    const l = (await t.query('INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,days,reason,has_document,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [empId, type.id, s, e, days, U.str(b.reason, { max: 500 }), hasDoc, req.user.id])).rows[0];
    const mgr = emp.manager_id && (await t.query('SELECT email,full_name FROM employees WHERE id=$1', [emp.manager_id])).rows[0];
    if (mgr && mgr.email) await enqueue(mgr.email, `Leave request: ${emp.full_name}`, `${emp.full_name} requested ${days} working day(s) of ${type.name} from ${s} to ${e}.\nPlease review it: ${process.env.PUBLIC_URL || ''}/leave`);
    return l;
  });
  audit(req, 'request', 'leave_requests', out.id); res.status(201).json(out);
}));
r.post('/leave/requests/:id/decide', perm(), wrap(async (req, res) => {
  const approve = !!req.body.approve, note = U.str(req.body.note, { max: 500 }); if (!approve && !note) throw bad('Write the reason for rejecting the request');
  const out = await tx(async (t) => {
    const l = U.needRow((await t.query('SELECT l.*,e.manager_id,e.sex,e.hire_date,e.email,e.full_name,t.name AS type_name FROM leave_requests l JOIN employees e ON e.id=l.employee_id JOIN leave_types t ON t.id=l.leave_type_id WHERE l.id=$1 FOR UPDATE OF l', [Number(req.params.id) || 0])).rows[0], 'Leave request');
    if (l.status !== 'pending') throw bad('This request was already decided'); if (l.employee_id === req.user.employee_id) throw bad('You cannot decide your own leave request', 403);
    if (!(has(req, 'leave.manage') || (has(req, 'leave.approve') && l.manager_id === req.user.employee_id))) throw bad('Only the manager of the employee or HR can decide this request', 403);
    if (approve) { const emp = { id: l.employee_id, sex: l.sex, hire_date: l.hire_date }, bal = (await balances(t, emp, Number(String(l.start_date).slice(0, 4)))).find((x) => x.leave_type_id === l.leave_type_id); if (bal && bal.balance != null && l.days > bal.balance) throw bad('The employee does not have enough leave days left'); }
    const u = (await t.query('UPDATE leave_requests SET status=$2,decided_by=$3,decided_at=now(),decision_note=$4 WHERE id=$1 RETURNING *', [l.id, approve ? 'approved' : 'rejected', req.user.id, note])).rows[0];
    if (l.email) await enqueue(l.email, `Your leave request was ${approve ? 'approved' : 'rejected'}`, `Your ${l.type_name} request (${String(l.start_date).slice(0, 10)} to ${String(l.end_date).slice(0, 10)}) was ${approve ? 'approved' : 'rejected'}.${note ? '\nNote: ' + note : ''}`); return u;
  });
  audit(req, out.status, 'leave_requests', out.id); res.json(out);
}));
r.post('/leave/requests/:id/cancel', perm(), wrap(async (req, res) => {
  const l = U.needRow((await q('SELECT * FROM leave_requests WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Leave request'), own = l.employee_id === req.user.employee_id, hr = has(req, 'leave.manage'), today = H.today();
  if (!own && !hr) throw bad('Leave request not found', 404); if (!['pending', 'approved'].includes(l.status)) throw bad('This request can no longer be cancelled');
  if (l.status === 'approved' && String(l.start_date).slice(0, 10) <= today && !hr) throw bad('Leave that has already started can only be cancelled by HR');
  if (hr === false && String(l.end_date).slice(0, 10) < today) throw bad('This request can no longer be cancelled');
  await q("UPDATE leave_requests SET status='cancelled',decided_by=$2,decided_at=now(),decision_note=COALESCE($3,decision_note) WHERE id=$1", [l.id, req.user.id, U.str(req.body.note, { max: 300 })]); audit(req, 'cancel', 'leave_requests', l.id); res.json({ ok: true });
}));
// return-to-work record: the date the employee actually resumed work (HR records it, or the employee confirms their own return). It does not change the approved days or balances.
r.post('/leave/requests/:id/return', perm(), wrap(async (req, res) => {
  const l = U.needRow((await q('SELECT * FROM leave_requests WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Leave request'), own = l.employee_id === req.user.employee_id, hr = has(req, 'leave.manage');
  if (!own && !hr) throw bad('Leave request not found', 404); if (l.status !== 'approved') throw bad('Only approved leave has a return to work'); if (l.return_to_work_on) throw bad('The return to work is already recorded', 409);
  const on = U.str(req.body.return_to_work_on || H.today(), { max: 10 }); if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || isNaN(new Date(on))) throw bad('Enter a valid date');
  if (on <= String(l.start_date).slice(0, 10)) throw bad('The return date must be after the leave started'); if (on > H.today() && !hr) throw bad('The return date cannot be in the future');
  await q('UPDATE leave_requests SET return_to_work_on=$2 WHERE id=$1', [l.id, on]); audit(req, 'return_to_work', 'leave_requests', l.id, on); res.json({ ok: true, return_to_work_on: on });
}));
r.post('/leave/adjustments', perm('leave.manage'), wrap(async (req, res) => {
  const b = req.body, empId = U.int(b.employee_id, 'Employee', true), typeId = U.int(b.leave_type_id, 'Leave type', true), year = U.int(b.year ?? new Date().getFullYear(), 'Year'), days = Number(b.days);
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 365) throw bad('Days is not valid');
  const out = await tx(async (t) => {
    const emp = U.needRow((await t.query('SELECT id,sex,hire_date FROM employees WHERE id=$1', [empId])).rows[0], 'Employee'), bal = (await balances(t, emp, year)).find((x) => x.leave_type_id === typeId); U.needRow(bal, 'Leave type');
    if (bal.balance != null && bal.balance + days < 0) throw bad('The balance cannot become negative');
    return (await t.query('INSERT INTO leave_adjustments(employee_id,leave_type_id,year,days,reason,by_user) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [empId, typeId, year, days, U.str(b.reason, { req: true, max: 300, name: 'Reason' }), req.user.id])).rows[0];
  });
  audit(req, 'adjust', 'leave_adjustments', out.id, `${days}`); res.status(201).json(out);
}));
// who is away: approved leave in a period, within what the user may see
r.get('/leave/calendar', perm(), wrap(async (req, res) => {
  const from = req.query.from || H.today(), to = req.query.to || H.addDays(from, 30), p = [from, to], w = ["l.status='approved'", 'l.start_date<=$2', 'l.end_date>=$1', H.empScope(req, p, 'e', 'leave.manage')];
  res.json((await q(`SELECT l.id,l.start_date,l.end_date,l.days,t.name AS type_name,e.full_name,e.id AS employee_id,d.name AS department FROM leave_requests l JOIN leave_types t ON t.id=l.leave_type_id JOIN employees e ON e.id=l.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE ${w.join(' AND ')} ORDER BY l.start_date`, p)).rows);
}));
module.exports = { router: r, balances };
