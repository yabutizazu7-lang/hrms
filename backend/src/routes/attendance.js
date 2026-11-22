const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr');
const r = express.Router();

// local date / minutes-since-midnight in the organisation's time zone
const local = (tz, d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) }; };
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw bad('Time is not valid (use HH:MM)'); return Number(m[1]) * 60 + Number(m[2]); };
const toTs = (date, time, tz) => q("SELECT (($1::text||' '||$2::text)::timestamp AT TIME ZONE $3) AS ts", [date, time, tz]).then((x) => x.rows[0].ts);
async function dayInfo(c, empId, date) {
  const st = await H.settings(), weekend = String(st.weekend_days || '0,6').split(',').map(Number);
  const [hol, lv] = await Promise.all([c.query('SELECT name FROM holidays WHERE holiday_date=$1', [date]), c.query("SELECT 1 FROM leave_requests WHERE employee_id=$1 AND status='approved' AND start_date<=$2 AND end_date>=$2", [empId, date])]);
  return { weekend: weekend.includes(new Date(date + 'T00:00:00Z').getUTCDay()), holiday: hol.rows[0]?.name || null, on_leave: !!lv.rows[0] };
}
const lateInfo = (st, minutes) => { const start = hm(st.work_start || '08:30'), grace = Number(st.grace_minutes) || 0; return { late: minutes > start + grace, minutes_late: Math.max(0, minutes - start) }; };

r.get('/attendance/today', perm(), wrap(async (req, res) => {
  if (!req.user.employee_id) return res.json({ linked: false }); const st = await H.settings(), now = local(st.timezone || 'Africa/Addis_Ababa');
  const rec = (await q('SELECT * FROM attendance WHERE employee_id=$1 AND work_date=$2', [req.user.employee_id, now.date])).rows[0];
  res.json({ linked: true, work_date: now.date, record: rec || null, ...(await dayInfo({ query: q }, req.user.employee_id, now.date)), work_start: st.work_start, work_end: st.work_end, grace_minutes: Number(st.grace_minutes) });
}));
r.post('/attendance/clock', perm(), wrap(async (req, res) => {
  if (!req.user.employee_id) throw bad('Your account is not linked to an employee record'); const action = U.oneOf(req.body.action, ['in', 'out'], 'Action');
  const out = await tx(async (t) => {
    const emp = U.needRow((await t.query('SELECT id,status FROM employees WHERE id=$1', [req.user.employee_id])).rows[0], 'Employee'); if (emp.status === 'terminated') throw bad('A former employee cannot clock in');
    const st = await H.settings(), tz = st.timezone || 'Africa/Addis_Ababa', now = local(tz), info = await dayInfo(t, emp.id, now.date);
    if (info.on_leave) throw bad('You are on approved leave today');
    const cur = (await t.query('SELECT * FROM attendance WHERE employee_id=$1 AND work_date=$2 FOR UPDATE', [emp.id, now.date])).rows[0];
    if (action === 'in') {
      if (cur && cur.check_in) throw bad('You already clocked in today', 409); const { late, minutes_late } = lateInfo(st, now.minutes);
      return (await t.query("INSERT INTO attendance(employee_id,work_date,check_in,status,minutes_late,source) VALUES($1,$2,now(),$3,$4,'self') ON CONFLICT(employee_id,work_date) DO UPDATE SET check_in=now(),status=$3,minutes_late=$4 RETURNING *", [emp.id, now.date, late ? 'late' : 'present', late ? minutes_late : 0])).rows[0];
    }
    if (!cur || !cur.check_in) throw bad('Clock in first'); if (cur.check_out) throw bad('You already clocked out today', 409);
    return (await t.query("UPDATE attendance SET check_out=now(),minutes_worked=GREATEST(0,floor(extract(epoch FROM now()-check_in)/60))::int WHERE id=$1 RETURNING *", [cur.id])).rows[0];
  });
  audit(req, 'clock_' + action, 'attendance', out.id); res.json(out);
}));

const ASEL = 'SELECT a.*,e.full_name,e.employee_no,d.name AS department FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id';
r.get('/attendance', perm(), wrap(async (req, res) => {
  const p = [], w = [H.empScope(req, p, 'e', 'attendance.view_all')], f = req.query, from = f.from || H.addDays(H.today(), -30), to = f.to || H.today();
  w.push(`a.work_date>=$${p.push(from)}`, `a.work_date<=$${p.push(to)}`); if (f.employee_id) w.push(`a.employee_id=$${p.push(U.int(f.employee_id, 'Employee'))}`); if (f.mine === '1') w.push(`a.employee_id=$${p.push(req.user.employee_id ?? 0)}`);
  res.json((await q(`${ASEL} WHERE ${w.join(' AND ')} ORDER BY a.work_date DESC,e.full_name LIMIT 600`, p)).rows);
}));
r.post('/attendance/manual', perm('attendance.manage'), wrap(async (req, res) => {
  const b = req.body, empId = U.int(b.employee_id, 'Employee', true), date = U.str(b.work_date, { req: true, max: 10, name: 'Date' }); if (isNaN(new Date(date)) || date > H.today()) throw bad('The date cannot be in the future');
  if (!b.check_in) throw bad('Check-in time is required'); const out = await tx(async (t) => {
    U.needRow((await t.query('SELECT 1 FROM employees WHERE id=$1', [empId])).rows[0], 'Employee'); const st = await H.settings(), tz = st.timezone || 'Africa/Addis_Ababa', inM = hm(b.check_in), { late, minutes_late } = lateInfo(st, inM);
    const ci = (await t.query("SELECT (($1::text||' '||$2::text)::timestamp AT TIME ZONE $3) AS ts", [date, b.check_in, tz])).rows[0].ts, co = b.check_out ? (await t.query("SELECT (($1::text||' '||$2::text)::timestamp AT TIME ZONE $3) AS ts", [date, b.check_out, tz])).rows[0].ts : null;
    if (co && co < ci) throw bad('Check-out is before check-in');
    return (await t.query("INSERT INTO attendance(employee_id,work_date,check_in,check_out,status,minutes_late,minutes_worked,source,note) VALUES($1,$2,$3,$4,$5,$6,$7,'manual',$8) ON CONFLICT(employee_id,work_date) DO UPDATE SET check_in=$3,check_out=$4,status=$5,minutes_late=$6,minutes_worked=$7,source='manual',note=$8 RETURNING *",
      [empId, date, ci, co, late ? 'late' : 'present', late ? minutes_late : 0, co ? Math.max(0, Math.floor((co - ci) / 60000)) : null, U.str(b.note, { max: 300 })])).rows[0];
  });
  audit(req, 'manual', 'attendance', out.id); res.status(201).json(out);
}));

// ---------------------------------------------------------------- corrections ("I forgot to clock in")
const CSEL = 'SELECT c.*,e.full_name,e.employee_no,e.manager_id,u.name AS decided_by_name FROM attendance_corrections c JOIN employees e ON e.id=c.employee_id LEFT JOIN users u ON u.id=c.decided_by';
r.get('/attendance/corrections', perm(), wrap(async (req, res) => {
  const p = [], w = [H.empScope(req, p, 'e', 'attendance.manage')]; if (req.query.status) w.push(`c.status=$${p.push(req.query.status)}`);
  res.json((await q(`${CSEL} WHERE ${w.join(' AND ')} ORDER BY (c.status='pending') DESC,c.created_at DESC LIMIT 300`, p)).rows.map((x) => ({ ...x, can_decide: x.status === 'pending' && x.employee_id !== req.user.employee_id && (has(req, 'attendance.manage') || x.manager_id === req.user.employee_id && has(req, 'leave.approve')) })));
}));
r.post('/attendance/corrections', perm(), wrap(async (req, res) => {
  if (!req.user.employee_id) throw bad('Your account is not linked to an employee record'); const b = req.body, date = U.str(b.work_date, { req: true, max: 10, name: 'Date' });
  if (isNaN(new Date(date)) || date > H.today()) throw bad('The date cannot be in the future'); if (date < H.addDays(H.today(), -30)) throw bad('Corrections can only be requested for the last 30 days');
  if (b.check_in) hm(b.check_in); if (b.check_out) hm(b.check_out); if (!b.check_in && !b.check_out) throw bad('Enter the check-in or the check-out time'); if (b.check_in && b.check_out && hm(b.check_out) < hm(b.check_in)) throw bad('Check-out is before check-in');
  if ((await q("SELECT 1 FROM attendance_corrections WHERE employee_id=$1 AND work_date=$2 AND status='pending'", [req.user.employee_id, date])).rows[0]) throw bad('There is already a pending correction for this day', 409);
  const row = (await q('INSERT INTO attendance_corrections(employee_id,work_date,check_in,check_out,reason) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.employee_id, date, b.check_in || null, b.check_out || null, U.str(b.reason, { req: true, max: 300, name: 'Reason' })])).rows[0]; audit(req, 'request', 'attendance_corrections', row.id); res.status(201).json(row);
}));
r.post('/attendance/corrections/:id/decide', perm(), wrap(async (req, res) => {
  const approve = !!req.body.approve, note = U.str(req.body.note, { max: 300 }); if (!approve && !note) throw bad('Write the reason for rejecting the correction');
  const out = await tx(async (t) => {
    const c = U.needRow((await t.query('SELECT c.*,e.manager_id FROM attendance_corrections c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE OF c', [Number(req.params.id) || 0])).rows[0], 'Correction');
    if (c.status !== 'pending') throw bad('This correction was already decided'); if (c.employee_id === req.user.employee_id) throw bad('You cannot decide your own correction', 403);
    if (!(has(req, 'attendance.manage') || (c.manager_id === req.user.employee_id && has(req, 'leave.approve')))) throw bad('Only the manager of the employee or HR can decide this correction', 403);
    if (approve) {
      const st = await H.settings(), tz = st.timezone || 'Africa/Addis_Ababa', date = String(c.work_date).slice(0, 10), cur = (await t.query('SELECT * FROM attendance WHERE employee_id=$1 AND work_date=$2', [c.employee_id, date])).rows[0];
      const ts = async (tm) => (await t.query("SELECT (($1::text||' '||$2::text)::timestamp AT TIME ZONE $3) AS ts", [date, tm, tz])).rows[0].ts;
      const ci = c.check_in ? await ts(String(c.check_in).slice(0, 5)) : cur?.check_in, co = c.check_out ? await ts(String(c.check_out).slice(0, 5)) : cur?.check_out;
      if (!ci) throw bad('A check-in time is needed to approve this correction'); if (co && co < ci) throw bad('Check-out is before check-in');
      const inM = local(tz, ci).minutes, { late, minutes_late } = lateInfo(st, inM);
      await t.query("INSERT INTO attendance(employee_id,work_date,check_in,check_out,status,minutes_late,minutes_worked,source,note) VALUES($1,$2,$3,$4,$5,$6,$7,'correction',$8) ON CONFLICT(employee_id,work_date) DO UPDATE SET check_in=$3,check_out=$4,status=$5,minutes_late=$6,minutes_worked=$7,source='correction',note=$8",
        [c.employee_id, date, ci, co, late ? 'late' : 'present', late ? minutes_late : 0, co ? Math.max(0, Math.floor((co - ci) / 60000)) : null, `Correction: ${c.reason}`]);
    }
    return (await t.query('UPDATE attendance_corrections SET status=$2,decided_by=$3,decided_at=now(),decision_note=$4 WHERE id=$1 RETURNING *', [c.id, approve ? 'approved' : 'rejected', req.user.id, note])).rows[0];
  });
  audit(req, out.status, 'attendance_corrections', out.id); res.json(out);
}));

// ---------------------------------------------------------------- monthly summary: present, late, leave and absent days
r.get('/attendance/summary', perm(), wrap(async (req, res) => {
  const month = String(req.query.month || H.today().slice(0, 7)); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Month is not valid');
  const from = month + '-01', last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10), to = last < H.today() ? last : H.today();
  const p = [], scope = H.empScope(req, p, 'e', 'attendance.view_all'); const emps = (await q(`SELECT e.id,e.employee_no,e.full_name,e.hire_date,e.termination_date,d.name AS department FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE ${scope} AND e.status<>'terminated' OR (${scope} AND e.termination_date>=$${p.push(from)}) ORDER BY e.full_name`, p)).rows;
  const ids = emps.map((e) => e.id); if (!ids.length || to < from) return res.json({ month, working_days: 0, rows: [] });
  const st = await H.settings(), weekend = String(st.weekend_days || '0,6').split(',').map(Number);
  const [hol, att, lv] = await Promise.all([q('SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN $1 AND $2', [from, to]), q('SELECT employee_id,work_date,status,minutes_late FROM attendance WHERE employee_id=ANY($1) AND work_date BETWEEN $2 AND $3', [ids, from, to]), q("SELECT employee_id,start_date,end_date FROM leave_requests WHERE employee_id=ANY($1) AND status='approved' AND start_date<=$3 AND end_date>=$2", [ids, from, to])]);
  const holidays = new Set(hol.rows.map((x) => H.iso(x.holiday_date))), days = []; for (let d = from; d <= to; d = H.addDays(d, 1)) if (!weekend.includes(new Date(d + 'T00:00:00Z').getUTCDay()) && !holidays.has(d)) days.push(d);
  const A = {}; att.rows.forEach((x) => { (A[x.employee_id] ||= {})[H.iso(x.work_date)] = x; });
  const rows = emps.map((e) => { let present = 0, late = 0, mins = 0, leave = 0, absent = 0, expected = 0; const hire = H.iso(e.hire_date), term = e.termination_date ? H.iso(e.termination_date) : null;
    for (const d of days) { if (d < hire || (term && d > term)) continue; expected++; const a = A[e.id]?.[d], onl = lv.rows.some((l) => l.employee_id === e.id && H.iso(l.start_date) <= d && H.iso(l.end_date) >= d); if (onl) leave++; else if (a) { present++; if (a.status === 'late') { late++; mins += a.minutes_late; } } else absent++; }
    return { employee_id: e.id, employee_no: e.employee_no, full_name: e.full_name, department: e.department, expected, present, late, minutes_late: mins, leave, absent }; });
  res.json({ month, working_days: days.length, rows });
}));
module.exports = r;
