// Permanent employment after probation. An employee registered as "probation" completes the probation period (setting `probation_months`,
// six by default) on hire_date + N months (month-ends are clamped: 31 Aug + 6 months = 28/29 Feb). On that date the employee becomes ELIGIBLE FOR REVIEW,
// With the setting probation_auto_permanent = 1 (default) the employee then becomes PERMANENT AUTOMATICALLY (recorded in the review and the history);
// with 0, HR is notified once and an authorized HR officer confirms (-> permanent) or declines (reason + next action).
// The dates are calculated here only; the screens show what this module returns.
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), { enqueue } = require('../notify');
const r = express.Router();

const months = async () => { const v = Number((await H.settings()).probation_months); return Number.isInteger(v) && v >= 1 && v <= 24 ? v : 6; };
const iso = (d) => String(d).slice(0, 10);
function addMonths(day, n) {   // calendar months with month-end clamping, no time-zone drift (pure UTC arithmetic)
  const [y, m, d] = iso(day).split('-').map(Number), t = (m - 1) + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const daysBetween = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 864e5);
// the date the probation period is completed: the stored date (set at registration / correction / extension), else calculated from the start date
const dueOf = (e, m) => (e.probation_end ? iso(e.probation_end) : addMonths(e.hire_date, m));

// everything a screen needs to know about one employee (reviews = that employee's permanent_reviews rows, newest first)
function describe(e, reviews, m, today = H.today()) {
  const last = reviews[0] || null, base = { start_date: iso(e.hire_date), employment_type: e.employment_type, probation_months: m, completion_date: null, remaining_days: null, eligible: false, state: 'not_applicable', last_decision: null };
  if (last && last.status !== 'pending' && last.status !== 'cancelled') base.last_decision = { status: last.status, decided_at: last.decided_at, decided_by_name: last.decided_by_name, effective_date: last.effective_date ? iso(last.effective_date) : null };
  if (e.employment_type === 'probation' && e.status !== 'terminated') {
    const due = dueOf(e, m); base.completion_date = due; base.remaining_days = Math.max(0, daysBetween(today, due)); base.eligible = today >= due;
    const decided = reviews.find((x) => iso(x.due_date) === due && (x.status === 'confirmed' || x.status === 'not_approved'));
    base.state = !base.eligible ? 'on_probation' : decided && decided.status === 'not_approved' ? 'not_approved' : 'awaiting_decision';
  } else if (e.employment_type === 'permanent' && reviews.some((x) => x.status === 'confirmed')) base.state = 'confirmed';
  return base;
}

async function forEmployee(c, e, withDetail) {
  const m = await months(), rows = (await c.query('SELECT * FROM permanent_reviews WHERE employee_id=$1 ORDER BY id DESC', [e.id])).rows;
  return { ...describe(e, rows, m), reviews: withDetail ? rows : undefined };
}

// ---- the scheduled check: idempotent. A review is raised at most once per completion date; its notification is claimed once.
async function notifyOpen() {
  const claimed = (await q("UPDATE permanent_reviews SET notified_at=now() WHERE status='pending' AND notified_at IS NULL RETURNING id,employee_id,due_date")).rows;
  if (!claimed.length) return 0;
  const to = (await q("SELECT DISTINCT u.email FROM users u WHERE u.active AND (u.role IN ('admin','super_admin') OR EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id JOIN roles ro ON ro.id=rp.role_id WHERE ro.code=u.role AND p.code='employment.confirm'))")).rows.map((x) => x.email);
  for (const c of claimed) {
    const e = (await q('SELECT e.full_name,e.employee_no,e.hire_date,d.name AS department FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1', [c.employee_id])).rows[0]; if (!e) continue;
    const link = `${process.env.PUBLIC_URL || ''}/probation`, line = `${e.full_name} (${e.employee_no})${e.department ? ' - ' + e.department : ''}`;
    for (const a of to) await enqueue(a, `Permanent employment decision required: ${e.full_name} / ቋሚ ቅጥር ውሳኔ ያስፈልጋል`,
      `${line} completed the probation period on ${iso(c.due_date)} (start date ${iso(e.hire_date)}) and is eligible for permanent employment.\nPlease confirm permanent employment or record a decision: ${link}\n\n${line} የሙከራ ጊዜውን ${iso(c.due_date)} አጠናቅቋል (የቅጥር መጀመሪያ ቀን ${iso(e.hire_date)}) እና ለቋሚ ቅጥር ብቁ ነው።\nቋሚ ቅጥርን ያጽድቁ ወይም ውሳኔ ይመዝግቡ: ${link}`);
  }
  return claimed.length;
}
const start = () => { const go = () => runCheck().catch((e) => console.error('probation check:', e.message)); setTimeout(go, 5000).unref(); setInterval(go, 6 * 3600 * 1000).unref(); };

// ---- helpers used by the employee routes (same transaction)
const fillProbationEnd = async (o, cur) => {   // calculated, never typed in: from the actual start date
  const type = o.employment_type ?? cur?.employment_type, hire = o.hire_date ?? (cur ? iso(cur.hire_date) : null);
  if (type === 'probation' && hire && (!cur || cur.employment_type !== 'probation' || o.hire_date !== undefined)) o.probation_end = addMonths(hire, await months());
  else if (type !== 'probation' && (!cur || cur.employment_type === 'probation')) o.probation_end = null;
};
const cancelOpen = (t, id, why) => t.query("UPDATE permanent_reviews SET status='cancelled',remarks=COALESCE(remarks||' | ','')||$2,decided_at=now() WHERE employee_id=$1 AND status='pending'", [id, why]);
const resolveByCase = async (t, emp, uid, name, eff, ref) => {   // the formal HR case "permanent appointment" also closes the review
  const due = dueOf(emp, await months()); await cancelOpen(t, emp.id, 'Replaced by HR case ' + ref);
  await t.query("INSERT INTO permanent_reviews(employee_id,due_date,status,decided_at,decided_by,decided_by_name,effective_date,remarks,notified_at) VALUES($1,$2,'confirmed',now(),$3,$4,$5,$6,now())", [emp.id, due, uid, name, eff, 'Confirmed through HR case ' + ref]);
};


// ---- automatic permanent employment (setting probation_auto_permanent, default on): six months of service completed -> permanent, recorded like a confirmation
const autoOn = async () => String((await H.settings()).probation_auto_permanent ?? '1') !== '0';
const dueFor = (e, m) => { const d = dueOf(e, m), min = addMonths(e.hire_date, m); return d > min ? d : min; };   // an extension (later date) is respected; an earlier typed date never shortens the six months
async function autoConfirm(t, e, due, m) {
  const cur = (await t.query("SELECT employment_type FROM employees WHERE id=$1 FOR UPDATE", [e.id])).rows[0]; if (!cur || cur.employment_type !== 'probation') return false;
  await cancelOpen(t, e.id, 'Closed: permanent automatically after the probation period');
  await t.query("UPDATE employees SET employment_type='permanent',probation_end=NULL,updated_at=now() WHERE id=$1", [e.id]);
  await t.query("INSERT INTO permanent_reviews(employee_id,due_date,status,decided_at,decided_by,decided_by_name,effective_date,remarks,notified_at) VALUES($1,$2,'confirmed',now(),NULL,'System (automatic)',$2,$3,now())", [e.id, due, `Automatically permanent: ${m} months of service completed`]);
  await require('./employees').hist(t, e.id, 'status_change', 'probation', 'permanent', `Automatically permanent: ${m} months of service completed`, null, due); return true;
}
async function autoConfirmIfDue(t, id) {   // used right after an employee is registered with a start date that is already more than six months ago
  if (!(await autoOn())) return false; const e = (await t.query("SELECT id,hire_date,probation_end FROM employees WHERE id=$1 AND employment_type='probation' AND status='active'", [id])).rows[0]; if (!e) return false;
  const m = await months(), due = dueFor(e, m); return due <= H.today() ? autoConfirm(t, e, due, m) : false;
}
async function runCheck() {
  const today = H.today(), m = await months(), auto = await autoOn(); let raised = 0, converted = 0;
  const emps = (await q("SELECT id,hire_date,probation_end FROM employees WHERE employment_type='probation' AND status='active'")).rows;
  for (const e of emps) {
    const due = auto ? dueFor(e, m) : dueOf(e, m); if (!e.probation_end) await q('UPDATE employees SET probation_end=$2 WHERE id=$1 AND probation_end IS NULL', [e.id, due]);
    if (due > today) continue;
    if (auto) { if (await tx((t) => autoConfirm(t, e, due, m))) converted++; continue; }
    raised += (await q('INSERT INTO permanent_reviews(employee_id,due_date) SELECT $1,$2::date WHERE NOT EXISTS (SELECT 1 FROM permanent_reviews WHERE employee_id=$1 AND due_date=$2::date) ON CONFLICT DO NOTHING RETURNING id', [e.id, due])).rowCount;
  }
  return { raised, converted, notified: await notifyOpen() };
}

// ---- decisions
async function open(t, id, req) {
  const e = U.needRow((await t.query('SELECT * FROM employees WHERE id=$1 FOR UPDATE', [id])).rows[0], 'Employee');
  if (e.id === req.user.employee_id) throw bad('You cannot decide your own permanent employment', 403);
  if (e.status !== 'active') throw bad('Only an active employee can be reviewed');
  if (e.employment_type !== 'probation') throw bad('This employee is not on probation');
  const due = dueOf(e, await months()), today = H.today();
  if (today < due) throw bad('The probation period is not completed yet');
  await t.query("UPDATE permanent_reviews SET status='cancelled',decided_at=now(),remarks=COALESCE(remarks||' | ','')||'Replaced by a review for a different date' WHERE employee_id=$1 AND status='pending' AND due_date<>$2", [id, due]);
  let rev = (await t.query("SELECT * FROM permanent_reviews WHERE employee_id=$1 AND status='pending' FOR UPDATE", [id])).rows[0];
  const latest = (await t.query('SELECT * FROM permanent_reviews WHERE employee_id=$1 AND due_date=$2 ORDER BY id DESC LIMIT 1', [id, due])).rows[0];
  if (!rev) rev = (await t.query('INSERT INTO permanent_reviews(employee_id,due_date,notified_at) VALUES($1,$2,now()) RETURNING *', [id, due])).rows[0];
  return { e, rev, due, today, latest };
}
r.post('/employees/:id/permanent/confirm', perm('employment.confirm'), wrap(async (req, res) => {
  const out = await tx(async (t) => {
    const { e, rev, due, today } = await open(t, Number(req.params.id) || 0, req), eff = iso(U.date(req.body.effective_date || today, 'Effective date', true));
    if (eff < due) throw bad('The effective date cannot be before the completion of the probation period'); if (eff > today) throw bad('The effective date cannot be in the future');
    const remarks = U.str(req.body.remarks, { max: 500 }) || null;
    await t.query("UPDATE employees SET employment_type='permanent',probation_end=NULL,updated_at=now() WHERE id=$1", [e.id]);
    await t.query("UPDATE permanent_reviews SET status='confirmed',decided_at=now(),decided_by=$2,decided_by_name=$3,effective_date=$4,remarks=$5 WHERE id=$1", [rev.id, req.user.id, req.user.name, eff, remarks]);
    await require('./employees').hist(t, e.id, 'status_change', 'probation', 'permanent', remarks || 'Permanent employment confirmed', req.user.id, eff);
    return e;
  });
  audit(req, 'confirm_permanent', 'employees', out.id, out.employee_no); res.json({ ok: true });
}));
r.post('/employees/:id/permanent/decline', perm('employment.confirm'), wrap(async (req, res) => {
  const out = await tx(async (t) => {
    const { e, rev, today, latest } = await open(t, Number(req.params.id) || 0, req);
    if (latest && latest.id !== rev.id && latest.status === 'not_approved') throw bad('A decision has already been recorded for this period');
    const reason = U.str(req.body.reason, { req: true, max: 500, name: 'Reason' }), action = U.oneOf(req.body.next_action, ['extend_probation', 'start_separation', 'other'], 'Next action'), remarks = U.str(req.body.remarks, { max: 500 }) || null;
    let next = null;
    if (action === 'extend_probation') { next = iso(U.date(req.body.next_review_date, 'New review date', true)); if (next <= today) throw bad('The new review date must be in the future'); if (next > addMonths(today, 24)) throw bad('The new review date is too far away'); await t.query('UPDATE employees SET probation_end=$2,updated_at=now() WHERE id=$1', [e.id, next]); }
    await t.query("UPDATE permanent_reviews SET status='not_approved',decided_at=now(),decided_by=$2,decided_by_name=$3,reason=$4,next_action=$5,next_review_date=$6,remarks=$7 WHERE id=$1", [rev.id, req.user.id, req.user.name, reason, action, next, remarks]);
    await require('./employees').hist(t, e.id, 'note', 'probation', next ? `probation until ${next}` : 'probation', `Permanent employment not approved: ${reason}${next ? ' (probation extended)' : ''}`, req.user.id, null);
    return e;
  });
  audit(req, 'decline_permanent', 'employees', out.id, out.employee_no); res.json({ ok: true });
}));

// ---- lists and numbers (HR)
async function summary() {
  const today = H.today(), alert = Number((await H.settings()).alert_days) || 30;
  const one = async (sql, p = []) => Number((await q(sql, p)).rows[0].n), ACT = "e.status='active' AND e.employment_type='probation'";
  const [approaching, awaiting, confirmed, deferred] = await Promise.all([
    one(`SELECT count(*) AS n FROM employees e WHERE ${ACT} AND e.probation_end > $1::date AND e.probation_end <= $1::date + $2::int`, [today, alert]),
    one(`SELECT count(*) AS n FROM employees e WHERE ${ACT} AND e.probation_end <= $1::date AND NOT EXISTS (SELECT 1 FROM permanent_reviews r WHERE r.employee_id=e.id AND r.due_date=e.probation_end AND r.status IN ('confirmed','not_approved'))`, [today]),
    one("SELECT count(DISTINCT employee_id) AS n FROM permanent_reviews WHERE status='confirmed'"),
    one(`SELECT count(*) AS n FROM employees e WHERE ${ACT} AND EXISTS (SELECT 1 FROM permanent_reviews r WHERE r.employee_id=e.id AND r.status='not_approved')`)]);
  return { approaching, awaiting_review: awaiting, confirmed, decision_pending: deferred, alert_days: alert, probation_months: await months() };
}
r.get('/permanent-employment/summary', perm('hr.view_all'), wrap(async (req, res) => res.json(await summary())));
r.get('/permanent-employment', perm('hr.view_all'), wrap(async (req, res) => {
  const m = await months(), today = H.today(), p = [], f = req.query, w = ["e.status<>'terminated'", "(e.employment_type='probation' OR EXISTS (SELECT 1 FROM permanent_reviews c WHERE c.employee_id=e.id AND c.status='confirmed'))"];
  if (f.department_id) w.push(`e.department_id=$${p.push(U.int(f.department_id, 'Department'))}`);
  if (f.q) w.push(`(e.full_name ILIKE $${p.push('%' + String(f.q).trim() + '%')} OR e.employee_no ILIKE $${p.length})`);
  if (f.from) w.push(`e.hire_date>=$${p.push(U.date(f.from, 'From'))}`); if (f.to) w.push(`e.hire_date<=$${p.push(U.date(f.to, 'To'))}`);
  const emps = (await q(`SELECT e.id,e.employee_no,e.full_name,e.hire_date,e.employment_type,e.status,e.probation_end,e.department_id,d.name AS department,pos.title AS position FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id WHERE ${w.join(' AND ')} ORDER BY e.hire_date DESC LIMIT 1000`, p)).rows;
  const revs = (await q('SELECT * FROM permanent_reviews WHERE employee_id=ANY($1::int[]) ORDER BY id DESC', [emps.map((e) => e.id)])).rows, by = {}; for (const x of revs) (by[x.employee_id] ||= []).push(x);
  const alert = Number((await H.settings()).alert_days) || 30, view = f.view || 'all';
  let rows = emps.map((e) => ({ ...e, ...describe(e, by[e.id] || [], m, today) }));
  rows = rows.filter((x) => view === 'all' || (view === 'approaching' && x.state === 'on_probation' && x.remaining_days <= alert) || (view === 'awaiting' && x.state === 'awaiting_decision') || (view === 'confirmed' && x.state === 'confirmed') || (view === 'not_approved' && x.state === 'not_approved') || (view === 'on_probation' && x.state === 'on_probation'));
  res.json(rows);
}));
r.post('/permanent-employment/check', perm('employment.confirm'), wrap(async (req, res) => { const out = await runCheck(); audit(req, 'probation_check', 'employees', null, `raised ${out.raised}, notified ${out.notified}`); res.json(out); }));

module.exports = { router: r, autoConfirmIfDue, summary, addMonths, dueOf, describe, forEmployee, runCheck, start, fillProbationEnd, cancelOpen, resolveByCase, months };
