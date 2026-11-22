const express = require('express'), bcrypt = require('bcryptjs'), crypto = require('crypto'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), { enqueue, live } = require('../notify');
const IDS = require('../ids'), P = require('./probation'), S = require('../service');
const r = express.Router();
const TYPES = ['permanent', 'contract', 'probation', 'intern', 'part_time'], MARITAL = ['single', 'married', 'divorced', 'widowed'];
const DOC_TYPES = ['contract', 'id_card', 'certificate', 'cv', 'offer_letter', 'warning', 'medical', 'tax', 'other'], OWN_DOC_TYPES = ['id_card', 'certificate', 'cv', 'other'];
const ACCOUNT_ROLES = ['employee', 'manager', 'executive', 'hr_officer'];

// ---------------------------------------------------------------- organization
r.get('/departments', perm(), wrap(async (req, res) => res.json((await q(`SELECT d.*,p.name AS parent_name,h.full_name AS head_name,(SELECT count(*) FROM employees e WHERE e.department_id=d.id AND e.status<>'terminated')::int AS headcount FROM departments d LEFT JOIN departments p ON p.id=d.parent_id LEFT JOIN employees h ON h.id=d.head_employee_id ORDER BY d.name`)).rows)));
const deptBody = (b) => ({ code: (U.str(b.code, { req: true, max: 8, name: 'Code' }) || '').toUpperCase(), name: U.str(b.name, { req: true, max: 120, name: 'Name' }), parent_id: U.int(b.parent_id, 'Parent department'), head_employee_id: U.int(b.head_employee_id, 'Head'), active: b.active === undefined ? true : !!b.active });
r.post('/departments', perm('org.manage'), wrap(async (req, res) => { const b = deptBody(req.body), row = (await q('INSERT INTO departments(code,name,parent_id,head_employee_id,active) VALUES($1,$2,$3,$4,$5) RETURNING *', Object.values(b))).rows[0]; audit(req, 'create', 'departments', row.id); res.status(201).json(row); }));
r.put('/departments/:id', perm('org.manage'), wrap(async (req, res) => {
  const b = deptBody(req.body), id = Number(req.params.id) || 0; if (b.parent_id === id) throw bad('A department cannot be its own parent');
  if (b.parent_id && (await q('WITH RECURSIVE t AS (SELECT id FROM departments WHERE parent_id=$1 UNION SELECT d.id FROM departments d JOIN t ON d.parent_id=t.id) SELECT 1 FROM t WHERE id=$2', [id, b.parent_id])).rows[0]) throw bad('A department cannot be placed under one of its own sub-departments');
  const row = U.needRow((await q('UPDATE departments SET code=$2,name=$3,parent_id=$4,head_employee_id=$5,active=$6 WHERE id=$1 RETURNING *', [id, ...Object.values(b)])).rows[0], 'Department'); audit(req, 'update', 'departments', id); res.json(row);
}));
r.get('/positions', perm(), wrap(async (req, res) => { const sal = has(req, 'salary.view'); res.json((await q(`SELECT p.id,p.code,p.title,p.department_id,p.grade,${sal ? 'p.min_salary,p.max_salary,' : ''}p.active,d.name AS department_name,(SELECT count(*) FROM employees e WHERE e.position_id=p.id AND e.status<>'terminated')::int AS holders FROM positions p LEFT JOIN departments d ON d.id=p.department_id ORDER BY p.title`)).rows); }));
const posBody = (b) => { const o = { code: (U.str(b.code, { req: true, max: 20, name: 'Code' }) || '').toUpperCase(), title: U.str(b.title, { req: true, max: 120, name: 'Title' }), department_id: U.int(b.department_id, 'Department'), grade: U.str(b.grade, { max: 20 }), min_salary: U.money(b.min_salary, 'Minimum salary'), max_salary: U.money(b.max_salary, 'Maximum salary'), active: b.active === undefined ? true : !!b.active }; if (o.min_salary != null && o.max_salary != null && o.min_salary > o.max_salary) throw bad('The minimum salary is higher than the maximum'); return o; };
r.post('/positions', perm('org.manage'), wrap(async (req, res) => { const b = posBody(req.body), row = (await q('INSERT INTO positions(code,title,department_id,grade,min_salary,max_salary,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', Object.values(b))).rows[0]; audit(req, 'create', 'positions', row.id); res.status(201).json(row); }));
r.put('/positions/:id', perm('org.manage'), wrap(async (req, res) => { const b = posBody(req.body), row = U.needRow((await q('UPDATE positions SET code=$2,title=$3,department_id=$4,grade=$5,min_salary=$6,max_salary=$7,active=$8 WHERE id=$1 RETURNING *', [Number(req.params.id) || 0, ...Object.values(b)])).rows[0], 'Position'); audit(req, 'update', 'positions', row.id); res.json(row); }));
// staff directory: every signed-in employee can find a colleague (no sensitive fields)
r.get('/directory', perm(), wrap(async (req, res) => {
  const p = [], w = ["e.status<>'terminated'"]; if (req.query.q) { p.push(`%${String(req.query.q).trim()}%`); w.push('(e.full_name ILIKE $1 OR e.employee_no ILIKE $1 OR pos.title ILIKE $1 OR d.name ILIKE $1)'); }
  res.json((await q(`SELECT e.id,e.employee_no,e.full_name,e.phone,e.email,e.manager_id,d.name AS department,pos.title AS position,m.full_name AS manager FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN employees m ON m.id=e.manager_id WHERE ${w.join(' AND ')} ORDER BY e.full_name LIMIT 200`, p)).rows);
}));

// ---------------------------------------------------------------- employees
const BASIC = 'e.id,e.employee_no,e.first_name,e.father_name,e.grandfather_name,e.full_name,e.full_name_am,e.full_name_en,e.sex,e.hire_date,e.department_id,e.position_id,e.manager_id,e.employment_type,e.status,e.phone,e.email,e.probation_end,e.contract_end,e.termination_date';
const JOINS = 'FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN employees m ON m.id=e.manager_id LEFT JOIN users u ON u.employee_id=e.id';
const SEL = `${BASIC},d.name AS department,pos.title AS position,m.full_name AS manager_name,u.role AS account_role,(u.id IS NOT NULL) AS has_account`;
r.get('/employees', perm(), wrap(async (req, res) => {
  const p = [], w = [H.empScope(req, p)], f = req.query, sal = has(req, 'salary.view');
  if (f.q) { p.push(`%${String(f.q).trim()}%`); w.push(`(e.full_name ILIKE $${p.length} OR e.full_name_am ILIKE $${p.length} OR e.full_name_en ILIKE $${p.length} OR e.employee_no ILIKE $${p.length} OR e.email ILIKE $${p.length})`); }
  if (f.status && f.status !== 'all') w.push(`e.status=$${p.push(f.status)}`); else if (!f.status) w.push("e.status<>'terminated'");
  if (f.hired_from) w.push(`e.hire_date>=$${p.push(U.date(f.hired_from, 'Hired from'))}`); if (f.hired_to) w.push(`e.hire_date<=$${p.push(U.date(f.hired_to, 'Hired to'))}`);
  if (f.probation_status) { const n = `'${H.today()}'`; w.push({ on_probation: `(e.employment_type='probation' AND e.probation_end > ${n}::date)`, awaiting_decision: `(e.employment_type='probation' AND e.probation_end <= ${n}::date AND NOT EXISTS (SELECT 1 FROM permanent_reviews r WHERE r.employee_id=e.id AND r.due_date=e.probation_end AND r.status IN ('confirmed','not_approved')))`, confirmed: "EXISTS (SELECT 1 FROM permanent_reviews r WHERE r.employee_id=e.id AND r.status='confirmed')" }[f.probation_status] || 'TRUE'); }
  if (f.department_id) w.push(`e.department_id=$${p.push(U.int(f.department_id, 'Department'))}`); if (f.employment_type) w.push(`e.employment_type=$${p.push(f.employment_type)}`); if (f.manager_id) w.push(`e.manager_id=$${p.push(U.int(f.manager_id, 'Manager'))}`);
  const hr = has(req, 'hr.view_all');   // register filters and columns are for HR only (the backend decides, not the screen)
  if (hr && f.sex) w.push(`e.sex=$${p.push(U.oneOf(f.sex, ['male', 'female'], 'Gender'))}`); if (hr && f.education_level) w.push(`e.education_level=$${p.push(String(f.education_level))}`); if (hr && f.job_grade) w.push(`e.job_grade=$${p.push(String(f.job_grade))}`);
  const td = `'${H.today()}'`, order = hr && f.sort === 'register_no' ? 'e.register_no NULLS LAST,e.full_name' : 'e.full_name';
  const needExp = hr && (f.experience_min_years || f.experience_max_years || /^(experience|service)/.test(f.sort || ''));   // work-experience filters and sorting are calculated from the dates, never stored
  let out = (await q(`SELECT ${SEL}${hr ? ',e.termination_date,e.register_no,e.education_level,e.education_field,e.job_grade,e.jeg_title,e.workplace' : ''}${sal ? ',e.basic_salary' : ''},CASE WHEN e.employment_type='probation' THEN GREATEST(0, e.probation_end - ${td}::date) END AS probation_days_left ${JOINS} WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT ${needExp ? 3000 : 500}`, p)).rows;
  if (hr) {
    const per = {}; for (const x of (await q('SELECT employee_id,start_date,end_date,verified,is_current_institution FROM service_periods WHERE employee_id=ANY($1::int[])', [out.map((x) => x.id)])).rows) (per[x.employee_id] ||= []).push(x);
    const today = H.today(); out = out.map((x) => { const e = S.experience(x, per[x.id] || [], today); return { ...x, experience: { current: e.current, previous_verified: e.previous_verified, total_verified: e.total_verified, warnings: e.warnings, sort_key: e.sort_key, current_key: e.current_key } }; });
    if (f.experience_min_years) { const m = Number(f.experience_min_years) * 360; out = out.filter((x) => x.experience.sort_key >= m); }
    if (f.experience_max_years) { const m = (Number(f.experience_max_years) + 1) * 360 - 1; out = out.filter((x) => x.experience.sort_key <= m); }   // "up to 5" includes 5 years 11 months 29 days
    const by = { experience: (a, b) => b.experience.sort_key - a.experience.sort_key, experience_asc: (a, b) => a.experience.sort_key - b.experience.sort_key, service: (a, b) => b.experience.current_key - a.experience.current_key, service_asc: (a, b) => a.experience.current_key - b.experience.current_key }[f.sort];
    if (by) out.sort(by); out = out.slice(0, 500);
  }
  res.json(out);
}));
// the values behind the register filters (HR only)
r.get('/employees-register/options', perm('hr.view_all'), wrap(async (req, res) => {
  const d = async (c) => (await q(`SELECT ${c} AS v,count(*)::int AS n FROM employees WHERE ${c} IS NOT NULL AND status<>'terminated' GROUP BY ${c} ORDER BY ${c}`)).rows;
  res.json({ education_levels: await d('education_level'), job_grades: await d('job_grade') });
}));

const body = (b, req, partial = false) => {
  const o = {}, put = (k, f) => { if (!partial || b[k] !== undefined) o[k] = f(); };
  put('first_name', () => U.str(b.first_name, { req: true, max: 60, name: 'First name' })); put('father_name', () => U.str(b.father_name, { req: true, max: 60, name: 'Father\'s name' })); put('grandfather_name', () => U.str(b.grandfather_name, { max: 60 }));
  put('sex', () => U.oneOf(b.sex, ['male', 'female'], 'Sex')); put('date_of_birth', () => { const d = U.str(b.date_of_birth, { max: 10 }); if (d && (isNaN(new Date(d)) || new Date(d) > new Date())) throw bad('Date of birth is not valid'); if (d) { const age = (Date.now() - new Date(d)) / 31557600000; if (age < 15 || age > 80) throw bad('The age of the employee is not plausible'); } return d; });
  put('marital_status', () => U.oneOf(b.marital_status, MARITAL, 'Marital status', false)); put('nationality', () => U.str(b.nationality, { max: 60 })); put('national_id', () => U.str(b.national_id, { max: 40 })); put('tin', () => U.str(b.tin, { max: 40 })); put('pension_no', () => U.str(b.pension_no, { max: 40 }));
  put('phone', () => U.phone(b.phone)); put('email', () => U.email(b.email)); put('personal_email', () => U.email(b.personal_email)); put('address', () => U.str(b.address, { max: 300 })); put('emergency_name', () => U.str(b.emergency_name, { max: 120 })); put('emergency_phone', () => U.phone(b.emergency_phone));
  put('hire_date', () => { const d = U.str(b.hire_date, { req: true, max: 10, name: 'Hire date' }); if (isNaN(new Date(d))) throw bad('Hire date is not valid'); if (new Date(d) > new Date(Date.now() + 366 * 864e5)) throw bad('Hire date is too far in the future'); return d; });
  put('department_id', () => U.int(b.department_id, 'Department')); put('position_id', () => U.int(b.position_id, 'Position')); put('manager_id', () => U.int(b.manager_id, 'Manager'));
  put('employment_type', () => U.oneOf(b.employment_type || 'permanent', TYPES, 'Employment type')); put('probation_end', () => U.str(b.probation_end, { max: 10 })); put('contract_end', () => U.str(b.contract_end, { max: 10 }));
  put('bank_name', () => U.str(b.bank_name, { max: 80 })); put('bank_account', () => U.str(b.bank_account, { max: 40 })); put('notes', () => U.str(b.notes, { max: 2000 }));
  const dt = (k, name) => put(k, () => { const d = U.str(b[k], { max: 10 }); if (!d) return null; if (isNaN(new Date(d)) || new Date(d) > new Date()) throw bad(`${name} is not valid`); return d; });
  put('register_no', () => { const n = U.int(b.register_no, 'Register number'); if (n != null && n < 1) throw bad('Register number must be 1 or more'); return n; });
  put('full_name_am', () => U.str(b.full_name_am, { max: 150 })); put('full_name_en', () => U.str(b.full_name_en, { max: 150 })); put('workplace', () => U.str(b.workplace, { max: 200 })); put('ethnicity', () => U.str(b.ethnicity, { max: 80 }));
  put('education_field', () => U.str(b.education_field, { max: 200 })); put('education_level', () => U.str(b.education_level, { max: 80 }));
  put('prior_service_text', () => U.str(b.prior_service_text, { max: 80 })); put('institution_service_text', () => U.str(b.institution_service_text, { max: 80 })); put('total_service_text', () => U.str(b.total_service_text, { max: 80 }));
  dt('child1_dob', 'First child date of birth'); dt('child2_dob', 'Second child date of birth');
  put('jeg_title', () => U.str(b.jeg_title, { max: 200 })); put('job_grade', () => U.str(b.job_grade, { max: 30 }));
  put('newly_hired_fy', () => !!b.newly_hired_fy); put('promoted_fy', () => !!b.promoted_fy);
  put('disability', () => U.str(b.disability, { max: 300 })); put('long_term_training', () => U.str(b.long_term_training, { max: 500 }));
  for (const k of ['basic_salary', 'transport_allowance', 'housing_allowance', 'other_allowance']) if (b[k] !== undefined && b[k] !== '') { if (!has(req, 'salary.manage')) throw bad('You do not have permission to set salaries', 403); o[k] = U.money(b[k], 'Salary'); }
  return o;
};
async function checkRefs(t, o, cur = {}) {
  const type = o.employment_type ?? cur.employment_type, hire = o.hire_date ?? (cur.hire_date ? String(cur.hire_date).slice(0, 10) : null);
  if (type === 'contract' && !(o.contract_end ?? cur.contract_end)) throw bad('Contract end date is required for a contract employee');
  for (const k of ['probation_end', 'contract_end']) if (o[k] && hire && o[k] < String(hire).slice(0, 10)) throw bad(`${k === 'contract_end' ? 'Contract end' : 'Probation end'} date is before the hire date`);
  if (o.register_no != null && (await t.query('SELECT 1 FROM employees WHERE register_no=$1 AND id<>$2', [o.register_no, cur.id || 0])).rows[0]) throw bad('This register number is already used by another employee');
  if (o.department_id) U.needRow((await t.query('SELECT 1 FROM departments WHERE id=$1 AND active', [o.department_id])).rows[0], 'Department');
  if (o.position_id) U.needRow((await t.query('SELECT 1 FROM positions WHERE id=$1 AND active', [o.position_id])).rows[0], 'Position');
  const pos = o.position_id ?? cur.position_id, sal = o.basic_salary ?? (o.basic_salary === undefined ? undefined : null);
  if (pos && sal != null && sal > 0) { const pr = (await t.query('SELECT min_salary,max_salary FROM positions WHERE id=$1', [pos])).rows[0]; if (pr && ((pr.min_salary != null && sal < Number(pr.min_salary)) || (pr.max_salary != null && sal > Number(pr.max_salary)))) throw bad('The basic salary is outside the range of this position'); }
}
const hist = (t, id, kind, from, to, note, uid, date) => t.query('INSERT INTO employee_history(employee_id,kind,from_value,to_value,note,by_user,effective_date) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE))', [id, kind, from == null ? null : String(from), to == null ? null : String(to), note || null, uid, date || null]);

async function createEmployee(t, req, b, fromRecruitment = false) {
  // every NEW employee starts as "Probationary (Trial Period)" and becomes permanent after six months of service: there is no other choice at registration
  if (!fromRecruitment && b.employment_type && b.employment_type !== 'probation') throw bad('A new employee is registered as Probationary (Trial Period) and becomes permanent after six months of service');
  b = { ...b, employment_type: 'probation', probation_end: undefined, contract_end: undefined };
  const o = body(b, req); await P.fillProbationEnd(o); await checkRefs(t, o);
  if (o.manager_id) U.needRow((await t.query("SELECT 1 FROM employees WHERE id=$1 AND status<>'terminated'", [o.manager_id])).rows[0], 'Manager');
  const no = 'EMP-' + U.pad(await U.nextNo(t, 'employee'), 5), cols = Object.keys(o);
  const e = (await t.query(`INSERT INTO employees(employee_no,${cols},created_by) VALUES($1,${cols.map((_, i) => '$' + (i + 2))},$${cols.length + 2}) RETURNING *`, [no, ...Object.values(o), req.user.id])).rows[0];
  await hist(t, e.id, 'hired', null, `${e.employment_type}`, 'Employee registered', req.user.id, e.hire_date);
  if (await P.autoConfirmIfDue(t, e.id)) return (await t.query('SELECT * FROM employees WHERE id=$1', [e.id])).rows[0]; return e;   // a start date that is already six months or more in the past: permanent at once
}
r.post('/employees', perm('employees.manage'), wrap(async (req, res) => { const e = await tx((t) => createEmployee(t, req, req.body)); audit(req, 'create', 'employees', e.id, e.employee_no); res.status(201).json(e); }));

// who may see which fields of an employee
async function visibleEmployee(req, id, c = { query: q }) {
  const p = [Number(id) || 0], w = H.empScope(req, p), e = (await c.query(`SELECT e.*,d.name AS department,pos.title AS position,m.full_name AS manager_name,u.id AS user_id,u.role AS account_role,u.active AS account_active,sp.position_no AS staff_position_no,sp.verified AS staff_position_verified ${JOINS} LEFT JOIN staff_positions sp ON sp.id=e.staff_position_id WHERE e.id=$1 AND ${w}`, p)).rows[0];
  return U.needRow(e, 'Employee');
}
const mask = (req, e) => {
  const own = e.id === req.user.employee_id, sens = own || has(req, 'employees.sensitive'), sal = own || has(req, 'salary.view'), hr = own || has(req, 'hr.view_all');
  const o = { ...e }; if (!sens) for (const k of ['disability', 'child1_dob', 'child2_dob', 'ethnicity', 'national_id', 'tin', 'pension_no', 'bank_name', 'bank_account', 'personal_email', 'address', 'emergency_name', 'emergency_phone']) delete o[k];
  // Fayda / digital ID: never in ordinary responses. Everybody (including the owner) sees only the masked form; the full number needs fayda.view and is fetched (and audited) through GET /employees/:id/fayda
  o.fayda_masked = IDS.maskFan(e.fayda_fan); delete o.fayda_fan; if (!(own || has(req, 'hr.view_all') || has(req, 'positions.manage'))) { delete o.fayda_masked; delete o.fayda_status; delete o.identifiers_verified; }
  if (!sal) for (const k of ['basic_salary', 'transport_allowance', 'housing_allowance', 'other_allowance']) delete o[k];
  if (!hr) { delete o.date_of_birth; delete o.marital_status; delete o.notes; delete o.nationality; for (const k of ['register_no', 'workplace', 'education_field', 'education_level', 'prior_service_text', 'institution_service_text', 'total_service_text', 'jeg_title', 'job_grade', 'newly_hired_fy', 'promoted_fy', 'long_term_training']) delete o[k]; } if (!has(req, 'hr.view_all')) delete o.notes; delete o.created_by; return o;
};
r.get('/employees/:id', perm(), wrap(async (req, res) => {
  const e = await visibleEmployee(req, req.params.id), id = e.id, own = id === req.user.employee_id;
  const [reports, hs] = await Promise.all([q("SELECT id,employee_no,full_name FROM employees WHERE manager_id=$1 AND status<>'terminated' ORDER BY full_name", [id]), has(req, 'hr.view_all') || own ? q('SELECT h.*,u.name AS by_name FROM employee_history h LEFT JOIN users u ON u.id=h.by_user WHERE h.employee_id=$1 ORDER BY h.at DESC,h.id DESC', [id]) : { rows: [] }]);
  const sal = own || has(req, 'salary.view'); audit(req, 'view', 'employees', id, e.employee_no);
  let experience;   // current service, previous verified experience and total verified experience (derived from dates, as of today)
  if (own || has(req, 'hr.view_all') || has(req, 'service.manage')) { const ps = (await q('SELECT * FROM service_periods WHERE employee_id=$1 ORDER BY start_date', [e.id])).rows; experience = { ...S.experience(e, ps, H.today()), previous: ps.map((x) => ({ id: x.id, employer: x.employer, job_title: x.job_title, start_date: String(x.start_date).slice(0, 10), end_date: x.end_date ? String(x.end_date).slice(0, 10) : null, verified: !!x.verified, is_current_institution: !!x.is_current_institution })) }; }
  const probation = own || has(req, 'hr.view_all') ? await P.forEmployee({ query: q }, e, has(req, 'hr.view_all')) : undefined;
  res.json({ ...mask(req, e), probation, experience, reports: reports.rows, history: hs.rows.map((x) => (x.kind === 'salary_change' && !sal ? { ...x, from_value: null, to_value: null } : x)), can_edit: has(req, 'employees.manage'), is_self: own });
}));
r.put('/employees/:id', perm('employees.manage'), wrap(async (req, res) => {
  let corr = null;
  const out = await tx(async (t) => {
    const id = Number(req.params.id) || 0, cur = U.needRow((await t.query('SELECT * FROM employees WHERE id=$1 FOR UPDATE', [id])).rows[0], 'Employee');
    if (cur.status === 'terminated') throw bad('A former employee cannot be edited');
    const o = body(req.body, req, true); delete o.probation_end;   // the completion date is calculated from the start date, never typed in
    const fromHire = String(cur.hire_date).slice(0, 10), hireChanged = o.hire_date !== undefined && o.hire_date !== fromHire;
    const why = hireChanged ? U.str(req.body.change_note, { req: true, max: 300, name: 'Reason for the correction' }) : null;
    await P.fillProbationEnd(o, cur); await checkRefs(t, o, cur);
    if (o.manager_id !== undefined && o.manager_id !== null) {
      if (o.manager_id === id) throw bad('An employee cannot be their own manager');
      U.needRow((await t.query("SELECT 1 FROM employees WHERE id=$1 AND status<>'terminated'", [o.manager_id])).rows[0], 'Manager');
      if ((await t.query('WITH RECURSIVE t AS (SELECT id FROM employees WHERE manager_id=$1 UNION SELECT x.id FROM employees x JOIN t ON x.manager_id=t.id) SELECT 1 FROM t WHERE id=$2', [id, o.manager_id])).rows[0]) throw bad('This would create a reporting loop: the new manager already reports to this employee');
    }
    if (hireChanged) { corr = `${fromHire} -> ${o.hire_date}: ${why}`; await hist(t, id, 'note', fromHire, o.hire_date, 'Hire date corrected: ' + why, req.user.id, null); if (cur.employment_type === 'probation' || o.employment_type === 'probation') await P.cancelOpen(t, id, 'Hire date corrected'); }
    if (cur.employment_type === 'probation' && o.employment_type !== undefined && o.employment_type !== 'probation') await P.cancelOpen(t, id, 'Employment type changed to ' + o.employment_type + ' by HR');
    const keys = Object.keys(o); if (!keys.length) throw bad('No changes');
    const names = async (tbl, col, v) => (v ? (await t.query(`SELECT ${col} AS n FROM ${tbl} WHERE id=$1`, [v])).rows[0]?.n : null);
    const date = U.str(req.body.effective_date, { max: 10 }) || null;
    if (o.position_id !== undefined && o.position_id !== cur.position_id) await hist(t, id, 'promotion', await names('positions', 'title', cur.position_id), await names('positions', 'title', o.position_id), req.body.change_note, req.user.id, date);
    if (o.department_id !== undefined && o.department_id !== cur.department_id) await hist(t, id, 'transfer', await names('departments', 'name', cur.department_id), await names('departments', 'name', o.department_id), req.body.change_note, req.user.id, date);
    if (o.manager_id !== undefined && o.manager_id !== cur.manager_id) await hist(t, id, 'manager_change', await names('employees', 'full_name', cur.manager_id), await names('employees', 'full_name', o.manager_id), req.body.change_note, req.user.id, date);
    if (o.basic_salary !== undefined && Number(o.basic_salary) !== Number(cur.basic_salary)) await hist(t, id, 'salary_change', cur.basic_salary, o.basic_salary, req.body.change_note, req.user.id, date);
    if (o.employment_type !== undefined && o.employment_type !== cur.employment_type) await hist(t, id, 'contract', cur.employment_type, o.employment_type, req.body.change_note, req.user.id, date);
    else if ((o.contract_end !== undefined && String(o.contract_end || '') !== String(cur.contract_end || '').slice(0, 10)) && cur.employment_type === 'contract') await hist(t, id, 'contract', `ends ${String(cur.contract_end || '').slice(0, 10)}`, `ends ${o.contract_end}`, req.body.change_note || 'Contract renewed', req.user.id, date);
    return (await t.query(`UPDATE employees SET ${keys.map((k, i) => `${k}=$${i + 2}`)} WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => o[k])])).rows[0];
  });
  if (corr) audit(req, 'correct_hire_date', 'employees', out.id, corr);
  audit(req, 'update', 'employees', out.id, out.employee_no); res.json(mask(req, out));
}));
// employees keep a few contact fields up to date themselves
r.put('/me/profile', perm(), wrap(async (req, res) => {
  if (!req.user.employee_id) throw bad('Your account is not linked to an employee record', 400); const b = req.body, s = {};
  if (b.phone !== undefined) s.phone = U.phone(b.phone); if (b.personal_email !== undefined) s.personal_email = U.email(b.personal_email); if (b.address !== undefined) s.address = U.str(b.address, { max: 300 }); if (b.emergency_name !== undefined) s.emergency_name = U.str(b.emergency_name, { max: 120 }); if (b.emergency_phone !== undefined) s.emergency_phone = U.phone(b.emergency_phone); if (b.marital_status !== undefined) s.marital_status = U.oneOf(b.marital_status, MARITAL, 'Marital status', false);
  const k = Object.keys(s); if (!k.length) throw bad('No changes'); await q(`UPDATE employees SET ${k.map((x, i) => `${x}=$${i + 2}`)} WHERE id=$1`, [req.user.employee_id, ...k.map((x) => s[x])]); audit(req, 'update_profile', 'employees', req.user.employee_id, k.join(',')); res.json({ ok: true });
}));

// login account for an employee
r.post('/employees/:id/account', perm('accounts.manage', 'users.manage'), wrap(async (req, res) => {
  const e = U.needRow((await q('SELECT * FROM employees WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Employee'); if (e.status === 'terminated') throw bad('A former employee cannot have an account');
  if (!e.email) throw bad('Enter the work e-mail address of the employee first'); const role = U.oneOf(req.body.role || 'employee', ['employee', 'manager', 'executive', 'hr_officer', 'hr_manager', 'admin'], 'Role');
  if (!has(req, 'users.manage') && !ACCOUNT_ROLES.includes(role)) throw bad('You can only create accounts for ordinary staff roles', 403);
  const pw = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'a1';
  const u = (await q('INSERT INTO users(name,email,password_hash,role,employee_id,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id,email', [e.full_name, e.email, await bcrypt.hash(pw, 10), role, e.id])).rows[0];
  await enqueue(e.email, 'Your HR system account', `Hello ${e.first_name},\n\nYour account was created.\nAddress: ${process.env.PUBLIC_URL || ''}/login\nEmail: ${e.email}\nTemporary password: ${pw}\n\nYou must choose a new password at your first sign-in.`);
  audit(req, 'create_account', 'employees', e.id, role); res.status(201).json({ ok: true, user_id: u.id, mail: live() ? 'queued' : 'simulated' });
}));

// ---------------------------------------------------------------- personnel documents
async function docAccess(req, empId) {
  const own = empId === req.user.employee_id; if (!own && !has(req, 'documents.view_all')) throw bad('Employee not found', 404);
  return { own, all: has(req, 'documents.view_all') };
}
r.get('/employees/:id/documents', perm(), wrap(async (req, res) => {
  const e = await visibleEmployee(req, req.params.id), a = await docAccess(req, e.id);
  res.json((await q(`SELECT d.id,d.doc_type,d.title,d.filename,d.mime,d.size_bytes,d.sha256,d.expires_on,d.confidential,d.uploaded_at,u.name AS uploaded_by_name FROM employee_documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.employee_id=$1 ${a.all ? '' : 'AND NOT d.confidential'} ORDER BY d.id DESC`, [e.id])).rows);
}));
r.post('/employees/:id/documents', perm(), wrap(async (req, res) => {
  const e = await visibleEmployee(req, req.params.id), own = e.id === req.user.employee_id, b = req.body || {};
  if (!own && !has(req, 'documents.manage')) throw bad('You cannot add documents for this employee', 403);
  const type = U.oneOf(b.doc_type || 'other', own && !has(req, 'documents.manage') ? OWN_DOC_TYPES : DOC_TYPES, 'Document type'), f = F.save('emp/' + e.id, b, undefined);
  try {
    const row = await tx(async (t) => { const d = (await t.query('INSERT INTO employee_documents(employee_id,doc_type,title,filename,mime,size_bytes,sha256,storage_name,expires_on,confidential,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,title,sha256',
      [e.id, type, U.str(b.title, { req: true, max: 200, name: 'Title' }), f.filename, f.mime, f.size, f.sha256, f.storage, U.str(b.expires_on, { max: 10 }), !!b.confidential && has(req, 'documents.manage'), req.user.id])).rows[0]; return d; });
    audit(req, 'upload', 'employee_documents', row.id, row.sha256); res.status(201).json(row);
  } catch (x) { F.remove('emp/' + e.id, f.storage); throw x; }
}));
async function findDoc(req, id) {
  const d = U.needRow((await q('SELECT * FROM employee_documents WHERE id=$1', [Number(id) || 0])).rows[0], 'Document'); const a = await docAccess(req, d.employee_id);
  if (d.confidential && !a.all) throw bad('Document not found', 404); return d;
}
r.get('/documents/:id/download', perm(), wrap(async (req, res) => {
  const d = await findDoc(req, req.params.id), buf = F.read('emp/' + d.employee_id, d.storage_name);
  if (U.sha256(buf) !== d.sha256) { audit(req, 'integrity_failure', 'employee_documents', d.id); throw bad('The integrity check of this file failed. It may have been altered. Tell the system administrator', 500); }
  audit(req, 'download', 'employee_documents', d.id, d.title);
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(buf);
}));
r.post('/documents/:id/verify', perm(), wrap(async (req, res) => { const d = await findDoc(req, req.params.id); let actual = null; try { actual = U.sha256(F.read('emp/' + d.employee_id, d.storage_name)); } catch {} res.json({ ok: actual === d.sha256 }); }));
module.exports = { router: r, createEmployee, hist, visibleEmployee, mask };
