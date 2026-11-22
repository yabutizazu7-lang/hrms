// Retirement (ጡረታ): age rules, status of every employee, and the scheduled notification to the HR Manager.
// The age is ALWAYS calculated from employees.date_of_birth and today's date (Africa/Addis_Ababa by default); it is never typed in and never stored.
// The hire date plays no part in the retirement age. The retirement age comes from the setting retirement_age_years (60).
const { q } = require('./db'), H = require('./hr'), S = require('./service'), { enqueue } = require('./notify');
const pad = (n) => String(n).padStart(2, '0'), leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// the date a person has lived `n` full years: a 29 February birthday counts from 1 March in a year that has no 29 February
const addYears = (iso, n) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number), ny = y + n; return m === 2 && d === 29 && !leap(ny) ? `${ny}-03-01` : `${ny}-${pad(m)}-${pad(d)}`; };
const ageOn = (dob, on) => { let a = Number(String(on).slice(0, 4)) - Number(String(dob).slice(0, 4)); if (addYears(dob, a) > String(on).slice(0, 10)) a--; return a; };
const localToday = async () => new Intl.DateTimeFormat('en-CA', { timeZone: (await H.settings()).timezone || 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const retirementAge = async () => { const v = (await H.settings(true)).retirement_age_years, n = Number(v); return v !== '' && Number.isFinite(n) && n > 0 ? n : null; };
// the four categories. "completed" wins: a retired employee is no longer "eligible".
const statusOf = (age, retAge, completed) => (completed ? 'completed' : age >= retAge ? 'eligible' : age >= retAge - 1 ? 'approaching' : 'active');
const STATUSES = ['active', 'approaching', 'eligible', 'completed'];

// every employee that has a date of birth and is either still employed or has completed a retirement
const BASE = `SELECT e.id,e.employee_no,e.full_name,e.full_name_am,e.full_name_en,e.sex,e.date_of_birth,e.hire_date,e.status AS employee_status,e.termination_date,d.id AS department_id,d.name AS department,pos.title AS job_title,e.jeg_title,
    oc.id AS open_case_id,oc.ref_no AS open_case_ref,oc.stage AS open_case_stage,ac.id AS approved_case_id,ac.ref_no AS approved_case_ref,ac.stage AS approved_case_stage,ac.effective_date AS official_retirement_date,
    (ac.stage='completed' OR EXISTS (SELECT 1 FROM separations s WHERE s.employee_id=e.id AND s.kind='retirement' AND s.status IN ('pending','completed'))) AS completed,rl.id AS letter_id
  FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id
  LEFT JOIN LATERAL (SELECT id,ref_no,stage FROM hr_cases c WHERE c.employee_id=e.id AND c.case_type='retirement' AND c.stage NOT IN ('completed','rejected','cancelled') ORDER BY id DESC LIMIT 1) oc ON TRUE
  LEFT JOIN LATERAL (SELECT id,ref_no,stage,effective_date FROM hr_cases c WHERE c.employee_id=e.id AND c.case_type='retirement' AND c.decision='approved' AND c.stage<>'cancelled' ORDER BY id DESC LIMIT 1) ac ON TRUE
  LEFT JOIN retirement_letters rl ON rl.case_id=ac.id`;
const shape = (e, retAge, today) => {
  const dob = H.iso(e.date_of_birth), age = ageOn(dob, today), elig = addYears(dob, retAge), appr = addYears(dob, retAge - 1), st = statusOf(age, retAge, !!e.completed);
  const days = Math.round((Date.parse(elig) - Date.parse(today)) / 864e5);
  return { id: e.id, employee_no: e.employee_no, full_name: e.full_name, sex: e.sex, date_of_birth: dob, age, department_id: e.department_id, department: e.department, job_title: e.job_title || e.jeg_title || null, hire_date: H.iso(e.hire_date),
    employee_status: e.employee_status, retirement_eligibility_date: elig, approaching_date: appr, days_to_eligibility: days, status: st, open_case_id: e.open_case_id, open_case_ref: e.open_case_ref, open_case_stage: e.open_case_stage,
    approved_case_id: e.approved_case_id, official_retirement_date: e.official_retirement_date ? H.iso(e.official_retirement_date) : null, letter_id: e.letter_id };
};
async function everyone(c = { query: q }, only) {
  const retAge = await retirementAge(); if (retAge == null) return { retAge: null, today: await localToday(), rows: [], missingDob: 0 };
  const today = await localToday(), p = [], w = ["e.date_of_birth IS NOT NULL", "(e.status<>'terminated' OR ac.stage='completed' OR EXISTS (SELECT 1 FROM separations s WHERE s.employee_id=e.id AND s.kind='retirement' AND s.status='completed'))"];
  if (only) w.push(`e.id=$${p.push(only)}`);
  const rows = (await c.query(`${BASE} WHERE ${w.join(' AND ')} ORDER BY e.full_name`, p)).rows.map((e) => shape(e, retAge, today));
  const missingDob = Number((await c.query("SELECT count(*) FROM employees WHERE status<>'terminated' AND date_of_birth IS NULL")).rows[0].count);
  return { retAge, today, rows, missingDob };
}
const counts = (rows) => { const n = { active: 0, approaching: 0, eligible: 0, completed: 0, in_process: 0 }; for (const r of rows) { n[r.status]++; if (r.open_case_id) n.in_process++; } return n; };
async function summary() {
  const { retAge, today, rows, missingDob } = await everyone(); if (retAge == null) return { configured: false };
  const alerts = rows.filter((r) => r.status === 'eligible' || r.status === 'approaching').sort((a, b) => a.retirement_eligibility_date.localeCompare(b.retirement_eligibility_date)).slice(0, 8)
    .map((r) => ({ id: r.id, full_name: r.full_name, employee_no: r.employee_no, age: r.age, status: r.status, retirement_eligibility_date: r.retirement_eligibility_date, open_case_id: r.open_case_id }));
  return { configured: true, retirement_age: retAge, today, ...counts(rows), missing_date_of_birth: missingDob, alerts };
}

// ---- the scheduled check: idempotent. Each employee gets ONE "approaching" and ONE "eligible" record (unique key); each record is e-mailed ONCE (claimed with notified_at).
async function hrManagers() { return (await q("SELECT DISTINCT u.email FROM users u JOIN roles ro ON ro.code=u.role JOIN role_permissions rp ON rp.role_id=ro.id JOIN permissions p ON p.id=rp.permission_id WHERE u.active AND u.role<>'super_admin' AND p.code='cases.decide_hr'")).rows.map((x) => x.email).filter(Boolean); }
async function runCheck() {
  const { retAge, rows } = await everyone(); if (retAge == null) return { raised: 0, notified: 0 }; let raised = 0;
  for (const r of rows) {
    if (r.status === 'completed' || r.employee_status === 'terminated') continue;
    const ms = r.status === 'eligible' ? ['eligible', r.retirement_eligibility_date] : r.status === 'approaching' ? ['approaching', r.approaching_date] : null; if (!ms) continue;
    raised += (await q('INSERT INTO retirement_milestones(employee_id,milestone,reached_on,retirement_age) VALUES($1,$2,$3,$4) ON CONFLICT (employee_id,milestone) DO NOTHING', [r.id, ms[0], ms[1], retAge])).rowCount;
  }
  const claimed = (await q("UPDATE retirement_milestones SET notified_at=now() WHERE notified_at IS NULL RETURNING id,employee_id,milestone,reached_on,retirement_age")).rows; if (!claimed.length) return { raised, notified: 0 };
  const to = await hrManagers(), byId = new Map(rows.map((r) => [r.id, r])), link = `${process.env.PUBLIC_URL || ''}/retirement`;
  for (const m of ['eligible', 'approaching']) {
    const list = claimed.filter((c) => c.milestone === m && byId.get(c.employee_id)); if (!list.length) continue;
    const lines = list.map((c) => { const r = byId.get(c.employee_id); return `- ${r.full_name} (${r.employee_no})${r.department ? ', ' + r.department : ''}: ${m === 'eligible' ? `reached ${retAge} on ${c.reached_on}` : `turns ${retAge} on ${r.retirement_eligibility_date}`}`; }).join('\n');
    const linesAm = list.map((c) => { const r = byId.get(c.employee_id); return `- ${r.full_name} (${r.employee_no})${r.department ? ', ' + r.department : ''}: ${m === 'eligible' ? `${retAge} ዓመት የሞላው ${c.reached_on}` : `${retAge} ዓመት የሚሞላው ${r.retirement_eligibility_date}`}`; }).join('\n');
    const subj = m === 'eligible' ? `Retirement: ${list.length} employee(s) reached age ${retAge} / ጡረታ: ${list.length} ሠራተኛ ${retAge} ዓመት ደርሷል` : `Retirement: ${list.length} employee(s) now aged ${retAge - 1} / ጡረታ: ${list.length} ሠራተኛ ወደ ጡረታ እየቀረበ ነው`;
    const body = `${m === 'eligible' ? `These employees reached the retirement age (${retAge}) and are eligible for retirement:` : `These employees are ${retAge - 1} years old and approaching retirement:`}\n${lines}\n\nOpen the Retirement page: ${link}\n\n${m === 'eligible' ? `እነዚህ ሠራተኞች የጡረታ ዕድሜ (${retAge}) ደርሰዋል:` : `እነዚህ ሠራተኞች ${retAge - 1} ዓመት ሆኗቸዋል፤ ወደ ጡረታ እየቀረቡ ነው:`}\n${linesAm}\n\nየጡረታ ገጽ: ${link}`;
    for (const a of to) await enqueue(a, subj, body);
  }
  return { raised, notified: claimed.length };
}
const start = () => { const go = () => runCheck().catch((e) => console.error('retirement check:', e.message)); setTimeout(go, 7000).unref(); setInterval(go, 6 * 3600 * 1000).unref(); };
module.exports = { addYears, ageOn, localToday, retirementAge, statusOf, STATUSES, everyone, counts, summary, runCheck, start, shape };
