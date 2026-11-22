// HR cases: permanent appointment, promotion, acting assignment, internal/external transfer, termination, retirement,
// disciplinary, long-term education, short-term training, experience certificate.
// One audited workflow engine. Every rule is enforced HERE (not in the browser): authorization, self-approval, stage order,
// required fields/documents, frozen decisions. Approval authority per case type is data (case_approval_rules), not code.
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), S = require('../service');
const WF = require('../workflows'), { enqueue } = require('../notify'), E = require('./employees'), M = require('./misc');
const r = express.Router(), TYPES = Object.keys(WF.T), ISO = /^\d{4}-\d{2}-\d{2}$/;

const mgrPerm = (t) => (t === 'disciplinary' ? 'discipline.manage' : 'cases.manage');
const ruleOf = async (type, c = { query: q }) => (await c.query('SELECT * FROM case_approval_rules WHERE case_type=$1', [type])).rows[0] || { approver_permission: 'cases.decide_hr', requires_recommendation: true, verified: true };

function visible(req, c) {
  const mine = c.employee_id === req.user.employee_id;
  if (c.case_type === 'disciplinary') return has(req, 'discipline.manage');   // the employee never opens disciplinary files; HR only
  if (c.confidential) return !mine && has(req, 'cases.manage');
  if (has(req, 'cases.view') || has(req, 'cases.manage')) return true;
  return mine || c.initiated_by === req.user.id;
}
// the single source of truth for "who may do what now" - used to enforce AND to tell the screen which buttons to show
const HR = 'cases.decide_hr';   // the HR (የሰው ሀብት) authority: the ONLY authority that processes and decides HR cases
function actionsFor(req, c, rule) {
  const staff = req.user.role !== 'super_admin';   // HR work is done by HR staff only: the technical owner account has no case actions
  const mine = c.employee_id === req.user.employee_id, init = c.initiated_by === req.user.id, mgr = staff && has(req, mgrPerm(c.case_type)) && !mine;
  const four = !!c.recommended_by && c.recommended_by === req.user.id;   // the person who recommended does not also decide (four eyes)
  const appr = staff && has(req, HR) && !mine && !init && !four;   // nobody decides their own case, and the person who opened it does not decide it
  const next = [...(WF.NEXT[c.stage] || [])]; if (c.stage === 'under_review' && rule.requires_recommendation === false) next.push('decide');
  const out = [];
  for (const a of next) {
    if (a === 'submit' && (init || mgr)) out.push(a);
    else if (a === 'cancel' && (init || mgr)) out.push(a);
    else if (['review', 'return', 'recommend', 'complete'].includes(a) && (mgr || (a === 'return' && c.stage === 'recommended' && appr))) out.push(a);
    else if (a === 'decide' && appr) out.push(a);
    else if (a === 'reopen' && (appr || mgr)) out.push(a);
    else if (a === 'appeal' && mgr && ['termination', 'disciplinary'].includes(c.case_type)) out.push(a);
  }
  if (!WF.FINAL.includes(c.stage) || c.stage === 'completed') if (mgr || appr || init) out.push('note');
  return out;
}

function cleanData(type, input, base = {}) {
  const spec = WF.T[type].fields, out = { ...base };
  for (const [k, v] of Object.entries(input || {})) {
    const f = spec[k]; if (!f) continue;
    if (v == null || v === '') { delete out[k]; continue; }
    const [kind, list] = f;
    if (kind === WF.DATE) { if (!ISO.test(String(v)) || isNaN(new Date(v))) throw bad(`${k} is not a valid date`); out[k] = String(v); }
    else if (kind === WF.NUM) { const n = Number(v); if (!Number.isFinite(n)) throw bad(`${k} must be a number`); out[k] = n; }
    else { const s = String(v).trim(); if (s.length > 2000) throw bad(`${k} is too long`); if (list && !list.includes(s)) throw bad(`${k} is not valid`); out[k] = s; }
  }
  return out;
}
const has_ = (d, k) => (Array.isArray(k) ? k.some((x) => d[x]) : !!d[k]);
const missing = (type, d) => { const t = WF.T[type]; const m = t.required.filter((k) => !has_(d, k)); if (t.oneOf && !t.oneOf.some((k) => d[k])) m.push(t.oneOf.join(' or ')); return m; };

const ref = async (t, type) => `HRC-${new Date().getFullYear()}-${WF.T[type].code}-${U.pad(await U.nextNo(t, 'case-' + new Date().getFullYear() + '-' + WF.T[type].code), 5)}`;
const ev = (t, id, action, from, to, note, uid) => t.query('INSERT INTO hr_case_events(case_id,action,from_stage,to_stage,note,by_user) VALUES($1,$2,$3,$4,$5,$6)', [id, action, from, to, note || null, uid]);
const SEL = `SELECT c.*,e.full_name,e.employee_no,e.department_id,d.name AS department,sp.position_no AS staff_position_no,pos.title AS job_title,iu.name AS initiated_by_name,ru.name AS reviewer_name,du.name AS decided_by_name FROM hr_cases c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN staff_positions sp ON sp.id=e.staff_position_id LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN users iu ON iu.id=c.initiated_by LEFT JOIN users ru ON ru.id=c.assigned_reviewer LEFT JOIN users du ON du.id=c.decided_by`;
const slim = (c) => ({ ...c, data: c.case_type === 'disciplinary' || c.case_type === 'termination' ? c.data : c.data });

r.get('/hr-cases/types', perm(), wrap(async (req, res) => {
  const rules = Object.fromEntries((await q('SELECT * FROM case_approval_rules')).rows.map((x) => [x.case_type, x]));
  res.json(TYPES.map((t) => ({ type: t, code: WF.T[t].code, fields: Object.fromEntries(Object.entries(WF.T[t].fields).map(([k, v]) => [k, { kind: v[0], options: v[1] || null }])), required: WF.T[t].required, one_of: WF.T[t].oneOf || null, min_documents: WF.T[t].docs, self_service: WF.T[t].self, confidential: !!WF.T[t].confidential, approval: rules[t] ? { permission: rules[t].approver_permission, requires_recommendation: rules[t].requires_recommendation, verified: rules[t].verified, source_ref: rules[t].source_ref } : null,
    can_create: has(req, mgrPerm(t)) || (WF.T[t].self && !!req.user.employee_id) })));
}));

r.get('/hr-cases', perm(), wrap(async (req, res) => {
  const p = [], w = [], page = Math.max(1, U.int(req.query.page || 1, 'Page')), size = Math.min(100, Math.max(1, U.int(req.query.page_size || 25, 'Page size')));
  if (req.query.type) w.push(`c.case_type=$${p.push(U.oneOf(req.query.type, TYPES, 'Type'))}`);
  if (req.query.stage) w.push(`c.stage=$${p.push(String(req.query.stage).slice(0, 20))}`);
  if (req.query.employee_id) w.push(`c.employee_id=$${p.push(U.int(req.query.employee_id, 'Employee'))}`);
  if (req.query.q) w.push(`(c.ref_no ILIKE $${p.push('%' + String(req.query.q).slice(0, 60) + '%')} OR e.full_name ILIKE $${p.length} OR e.employee_no ILIKE $${p.length})`);
  // visibility is decided in SQL too, so a listing can never contain a case the user may not open
  const me = req.user.employee_id ?? 0, all = has(req, 'cases.view') || has(req, 'cases.manage'), dis = has(req, 'discipline.manage');
  const vis = [`(c.case_type NOT IN ('disciplinary','termination') AND (${all ? 'TRUE' : `c.employee_id=$${p.push(me)} OR c.initiated_by=$${p.push(req.user.id)}`}))`];
  if (dis) vis.push("c.case_type='disciplinary'"); if (has(req, 'cases.manage')) vis.push(`(c.case_type='termination' AND c.employee_id<>$${p.push(me)})`);
  w.push(`(${vis.join(' OR ')})`);
  if (req.query.mine === '1') w.push(`c.employee_id=$${p.push(me)}`);
  const where = 'WHERE ' + w.join(' AND '), total = Number((await q(`SELECT count(*) FROM hr_cases c JOIN employees e ON e.id=c.employee_id ${where}`, p)).rows[0].count);
  const rows = (await q(`${SEL} ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
  res.json({ total, page, page_size: size, rows: rows.map(({ data, ...x }) => x) });
}));

const load = async (c, id, lock = false) => U.needRow((await c.query(`${SEL} WHERE c.id=$1 ${lock ? 'FOR UPDATE OF c' : ''}`, [Number(id) || 0])).rows[0], 'Case');
const mustSee = (req, c) => { if (!visible(req, c)) throw bad('Case not found', 404); };   // existence is not revealed

r.get('/hr-cases/:id', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c); const rule = await ruleOf(c.case_type);
  const [events, docs] = await Promise.all([q('SELECT v.*,u.name AS by_name FROM hr_case_events v LEFT JOIN users u ON u.id=v.by_user WHERE v.case_id=$1 ORDER BY v.id', [c.id]), q('SELECT id,doc_kind,title,filename,mime,size_bytes,sha256,uploaded_at FROM hr_case_documents WHERE case_id=$1 ORDER BY id', [c.id])]);
  if (c.confidential) audit(req, 'view', 'hr_cases', c.id, c.ref_no);
  res.json({ ...c, events: events.rows, documents: docs.rows, actions: actionsFor(req, c, rule), missing: missing(c.case_type, c.data), min_documents: WF.T[c.case_type].docs, approval_rule: { permission: rule.approver_permission, requires_recommendation: rule.requires_recommendation, verified: rule.verified }, authority: { permission: rule.approver_permission, forwarded: false, is_hr: rule.approver_permission === HR }, forward_options: [] });
}));

r.post('/hr-cases', perm(), wrap(async (req, res) => {
  const b = req.body, type = U.oneOf(b.case_type, TYPES, 'Case type'), spec = WF.T[type];
  const own = req.user.employee_id, empId = b.employee_id ? U.int(b.employee_id, 'Employee') : own;
  if (req.user.role === 'super_admin' && empId !== own) throw bad('HR cases are handled by the HR department', 403);   // the technical account only makes its own self-service requests
  if (!empId) throw bad('Choose the employee');
  const selfService = spec.self && empId === own && !has(req, mgrPerm(type));
  if (!selfService && !has(req, mgrPerm(type))) throw bad('You do not have permission to open this kind of case', 403);
  if (empId === own && !spec.self) throw bad('You cannot open this kind of case about yourself', 403);
  const c = await tx(async (t) => {
    const emp = U.needRow((await t.query('SELECT * FROM employees WHERE id=$1', [empId])).rows[0], 'Employee');
    if (emp.status === 'terminated' && !['experience_certificate', 'recommendation_letter'].includes(type)) throw bad('A former employee has no open HR procedures');
    if (type === 'permanent_appointment' && emp.employment_type !== 'probation') throw bad('Only an employee on probation can be appointed permanently');
    if (!['disciplinary', 'experience_certificate'].includes(type) && (await t.query("SELECT 1 FROM hr_cases WHERE employee_id=$1 AND case_type=$2 AND stage NOT IN ('completed','rejected','cancelled')", [empId, type])).rows[0]) throw bad('An open case of this kind already exists for this employee', 409);
    const data = cleanData(type, b.data), row = (await t.query('INSERT INTO hr_cases(ref_no,case_type,employee_id,initiated_by,reason,directive_ref,data,confidential) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [await ref(t, type), type, empId, req.user.id, U.str(b.reason, { max: 2000 }), U.str(b.directive_ref, { max: 300 }), data, !!spec.confidential])).rows[0];
    await ev(t, row.id, 'created', null, 'draft', null, req.user.id); return load(t, row.id);
  });
  audit(req, 'create', 'hr_cases', c.id, c.ref_no); res.status(201).json(c);
}));

// edit the record while it is a draft / returned (initiator or HR) or under review (HR only); every edit is logged
r.put('/hr-cases/:id', perm(), wrap(async (req, res) => {
  const c = await tx(async (t) => {
    const c = await load(t, req.params.id, true); mustSee(req, c); const rule = await ruleOf(c.case_type), mgr = has(req, mgrPerm(c.case_type)) && c.employee_id !== req.user.employee_id, init = c.initiated_by === req.user.id;
    const ok = (['draft', 'returned'].includes(c.stage) && (init || mgr)) || (c.stage === 'under_review' && mgr); if (!ok) throw bad('This case can no longer be edited in its current stage', 409); void rule;
    const data = cleanData(c.case_type, req.body.data, c.data), keys = Object.keys(req.body.data || {}).filter((k) => WF.T[c.case_type].fields[k]);
    await t.query('UPDATE hr_cases SET data=$2,reason=COALESCE($3,reason),directive_ref=COALESCE($4,directive_ref),updated_at=now() WHERE id=$1', [c.id, data, U.str(req.body.reason, { max: 2000 }), U.str(req.body.directive_ref, { max: 300 })]);
    await ev(t, c.id, 'edited', c.stage, c.stage, 'fields: ' + keys.join(', '), req.user.id); return load(t, c.id);
  });
  audit(req, 'update', 'hr_cases', c.id, c.ref_no); res.json(c);
}));

async function apply(t, req, c) {   // writes an APPROVED decision into the employee record; returns warnings for HR
  const d = c.data, eff = String(c.effective_date).slice(0, 10), uid = req.user.id, warn = [];
  const emp = (await t.query('SELECT e.*,pos.title AS pos_title FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id WHERE e.id=$1 FOR UPDATE OF e', [c.employee_id])).rows[0];
  const posName = async (id) => (await t.query('SELECT title,grade FROM positions WHERE id=$1', [id])).rows[0];
  switch (c.case_type) {
    case 'permanent_appointment':
      if (d.probation_evaluation_result !== 'satisfactory') throw bad('A permanent appointment needs a satisfactory probation evaluation');
      await require('./probation').resolveByCase(t, emp, uid, req.user.name, eff, c.ref_no);
      await t.query("UPDATE employees SET employment_type='permanent',probation_end=NULL,updated_at=now() WHERE id=$1", [emp.id]); await E.hist(t, emp.id, 'status_change', 'probation', 'permanent', `Permanent appointment ${c.ref_no}`, uid, eff); break;
    case 'promotion': {
      const np = U.needRow(await posName(d.new_position_id), 'New position'); await t.query('UPDATE employees SET position_id=$2,staff_position_id=COALESCE($3,staff_position_id),updated_at=now() WHERE id=$1', [emp.id, d.new_position_id, d.new_staff_position_id ?? null]);
      await E.hist(t, emp.id, 'promotion', emp.pos_title, `${np.title}${np.grade ? ' (' + np.grade + ')' : ''}`, `Promotion ${c.ref_no}`, uid, eff);
      const rg = (await t.query('SELECT min_salary,max_salary FROM positions WHERE id=$1', [d.new_position_id])).rows[0], sal = Number(emp.basic_salary);
      if ((rg.min_salary != null && sal < Number(rg.min_salary)) || (rg.max_salary != null && sal > Number(rg.max_salary))) warn.push('The current salary is outside the salary range of the new position. Adjust the salary through the normal salary procedure.'); break; }
    case 'acting_assignment':
      await E.hist(t, emp.id, 'note', null, d.acting_position_title, `${d.assignment_kind} assignment ${c.ref_no}: ${d.start_date}${d.end_date ? ' to ' + d.end_date : ''}`, uid, d.start_date || eff); break;
    case 'internal_transfer': {
      const sets = [], p = [emp.id]; if (d.to_department_id) sets.push(`department_id=$${p.push(d.to_department_id)}`); if (d.to_position_id) sets.push(`position_id=$${p.push(d.to_position_id)}`); if (d.to_staff_position_id) sets.push(`staff_position_id=$${p.push(d.to_staff_position_id)}`);
      await t.query(`UPDATE employees SET ${sets.join(',')},updated_at=now() WHERE id=$1`, p);
      const [a, b] = await Promise.all([t.query('SELECT name FROM departments WHERE id=$1', [emp.department_id]), t.query('SELECT name FROM departments WHERE id=$1', [d.to_department_id ?? emp.department_id])]);
      await E.hist(t, emp.id, 'transfer', a.rows[0]?.name || null, b.rows[0]?.name || null, `Internal transfer ${c.ref_no}`, uid, eff); break; }
    case 'external_transfer':
      if (d.direction === 'out') await M.openSeparation(t, req, emp.id, { kind: 'transfer_out', last_day: eff, reason: `Transfer to ${d.other_institution} (${c.ref_no})` }, uid, true);
      else { if (d.previous_start && d.previous_end) await t.query("INSERT INTO service_periods(employee_id,employer,start_date,end_date,verified,source,note,created_by) VALUES($1,$2,$3,$4,false,'manual',$5,$6)", [emp.id, d.other_institution, d.previous_start, d.previous_end, `External transfer ${c.ref_no} - verify with the releasing institution`, uid]); await E.hist(t, emp.id, 'note', d.other_institution, 'this institution', `External transfer in ${c.ref_no}`, uid, eff); }
      break;
    case 'termination': await M.openSeparation(t, req, emp.id, { kind: 'termination', last_day: eff, reason: `${d.ground} (${c.ref_no})` }, uid, true); break;
    case 'retirement': await M.openSeparation(t, req, emp.id, { kind: 'retirement', last_day: eff, reason: `${d.retirement_basis} (${c.ref_no})` }, uid, true); break;
    case 'long_term_education': await t.query("INSERT INTO trainings(employee_id,title,provider,start_date,end_date,status,note,created_by) VALUES($1,$2,$3,$4,$5,'planned',$6,$7)", [emp.id, `[Long-term] ${d.program}`.slice(0, 200), d.institution, d.start_date || null, d.end_date || null, `Case ${c.ref_no}`, uid]); break;
    case 'short_term_training': await t.query("INSERT INTO trainings(employee_id,title,provider,start_date,end_date,cost,status,note,created_by) VALUES($1,$2,$3,$4,$5,$6,'planned',$7,$8)", [emp.id, d.course, d.provider, d.start_date || null, d.end_date || null, d.cost ?? null, `Case ${c.ref_no}`, uid]); break;
    default: break;   // disciplinary / experience_certificate: nothing is written to the general employee record
  }
  return warn;
}

r.post('/hr-cases/:id/action', perm(), wrap(async (req, res) => {
  const b = req.body, action = String(b.action || ''), note = U.str(b.note, { max: 2000 });
  if (!['submit', 'review', 'return', 'recommend', 'decide', 'complete', 'cancel', 'reopen', 'appeal', 'note'].includes(action)) throw bad('Unknown action');   // there is no forwarding or any other route to another authority
  const out = await tx(async (t) => {
    const c = await load(t, req.params.id, true); mustSee(req, c); const rule = await ruleOf(c.case_type, t), allowed = actionsFor(req, c, rule), spec = WF.T[c.case_type];
    if (!allowed.includes(action)) throw bad(`This action is not allowed now (stage: ${c.stage})`, 403);
    const set = (stage, extra = {}) => { const cols = { stage, updated_at: new Date(), ...extra }, k = Object.keys(cols); return t.query(`UPDATE hr_cases SET ${k.map((x, i) => `${x}=$${i + 2}`)} WHERE id=$1`, [c.id, ...Object.values(cols)]); };
    let to = c.stage, warn = [];
    if (action === 'note') { if (!note) throw bad('Write the note'); await ev(t, c.id, 'note', c.stage, c.stage, note, req.user.id); return { c: await load(t, c.id), warn }; }
    if (action === 'submit') {
      const m = missing(c.case_type, c.data); if (m.length) throw bad('Complete these fields first: ' + m.join(', '));
      const n = Number((await t.query('SELECT count(*) FROM hr_case_documents WHERE case_id=$1', [c.id])).rows[0].count); if (n < spec.docs) throw bad(`Attach the required supporting document(s) first (${n}/${spec.docs})`);
      to = 'submitted'; await set(to, { submitted_at: new Date() });
    } else if (action === 'review') { to = 'under_review'; await set(to, { assigned_reviewer: req.user.id });
    } else if (action === 'return') { if (!note) throw bad('Explain what must be corrected'); to = 'returned'; await set(to);
    } else if (action === 'reopen') { if (!note) throw bad('Give the reason'); to = 'under_review'; await set(to, { decision: null, decided_by: null, decided_at: null });
    } else if (action === 'recommend') {
      for (const k of spec.beforeRecommend || []) if (!has_(c.data, k)) throw bad('Record this first: ' + (Array.isArray(k) ? k.join(' or ') : k));
      if (!note) throw bad('Write the recommendation'); to = 'recommended'; await set(to, { recommendation: note, recommended_by: req.user.id, recommended_at: new Date() });
      if (['recommendation_letter', 'experience_certificate'].includes(c.case_type)) await require('./certificates').autoDraft(t, c.employee_id, req.user.id);   // the Work Experience Certificate is enabled and its draft prepared
    } else if (action === 'decide') {
      const dec = U.oneOf(b.decision, ['approved', 'rejected'], 'Decision'), reason = U.str(b.reason, { req: true, max: 2000, name: 'Reason for the decision' }), eff = U.str(b.effective_date, { max: 10 });
      if (dec === 'approved') { if (!eff || !ISO.test(eff)) throw bad('Enter the effective date'); if (eff < new Date(c.created_at).toISOString().slice(0, 10) && !['retirement', 'termination'].includes(c.case_type)) throw bad('The effective date cannot be before the case was opened'); }
      let data = c.data;
      if (c.case_type === 'disciplinary') {
        const code = U.str(b.sanction_code, { max: 40 });
        if (dec === 'approved') { if (!code) throw bad('Choose the sanction, or "no_sanction"'); if (code !== 'no_sanction' && !(await t.query('SELECT 1 FROM discipline_sanctions WHERE code=$1 AND active', [code])).rows[0]) throw bad('This sanction is not in the configured list. HR must add sanctions from the governing rules first'); data = { ...data, sanction_code: code }; }
      }
      if (c.case_type === 'permanent_appointment' && dec === 'approved' && c.data.probation_evaluation_result !== 'satisfactory') throw bad('A permanent appointment cannot be approved without a satisfactory probation evaluation');
      if (c.stage === 'appealed') data = { ...data, appeal_outcome: reason };
      to = dec === 'approved' ? 'approved' : 'rejected';
      await set(to, { decision: dec, decision_reason: reason, decided_by: req.user.id, decided_at: new Date(), effective_date: dec === 'approved' ? eff : null, data });
    } else if (action === 'complete') {
      const fresh = await load(t, c.id); if (!fresh.effective_date) throw bad('The effective date is missing');
      warn = await apply(t, req, fresh); to = 'completed'; await set(to, { completed_at: new Date(), applied: true });
    } else if (action === 'appeal') { if (!note) throw bad('Record the appeal / review request'); to = 'appealed'; await set(to);
    } else if (action === 'cancel') { if (!note) throw bad('Give the reason for cancelling'); to = 'cancelled'; await set(to); }
    await ev(t, c.id, action, c.stage, to, action === 'decide' ? `${b.decision}: ${b.reason}` : note, req.user.id);
    return { c: await load(t, c.id), warn };
  });
  audit(req, action, 'hr_cases', out.c.id, out.c.ref_no);
  if (['approved', 'rejected', 'completed'].includes(out.c.stage) && !out.c.confidential) { const e = (await q('SELECT email,personal_email FROM employees WHERE id=$1', [out.c.employee_id])).rows[0]; enqueue(e?.email || e?.personal_email, `HR case ${out.c.ref_no}: ${out.c.stage}`, `Your HR request ${out.c.ref_no} is now: ${out.c.stage}. Sign in to the HRMS for details.`); }
  res.json({ ...out.c, warnings: out.warn });
}));

// supporting documents (PDF / image / Word; magic-byte checked, SHA-256 stored and re-verified on download)
r.post('/hr-cases/:id/documents', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c); const rule = await ruleOf(c.case_type);
  if (!actionsFor(req, c, rule).some((a) => ['submit', 'review', 'recommend', 'note', 'cancel'].includes(a)) || WF.FINAL.includes(c.stage) && c.stage !== 'completed') throw bad('Documents cannot be added to this case now', 403);
  const f = F.save('cases', req.body, undefined), row = (await q('INSERT INTO hr_case_documents(case_id,doc_kind,title,filename,mime,size_bytes,sha256,storage_name,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,filename,sha256', [c.id, U.str(req.body.doc_kind, { max: 40 }) || 'supporting', U.str(req.body.title, { req: true, max: 200, name: 'Title' }), f.filename, f.mime, f.size, f.sha256, f.storage, req.user.id])).rows[0];
  await q('INSERT INTO hr_case_events(case_id,action,note,by_user) VALUES($1,$2,$3,$4)', [c.id, 'document', row.title, req.user.id]); audit(req, 'upload', 'hr_cases', c.id, row.title); res.status(201).json(row);
}));
r.get('/hr-cases/:id/documents/:docId', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c); const d = U.needRow((await q('SELECT * FROM hr_case_documents WHERE id=$1 AND case_id=$2', [Number(req.params.docId) || 0, c.id])).rows[0], 'Document'), buf = F.read('cases', d.storage_name);
  if (U.sha256(buf) !== d.sha256) throw bad('The stored file failed its integrity check. Tell the system administrator', 500);
  audit(req, 'download', 'hr_cases', c.id, d.title); res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).send(buf);
}));

// official letter / certificate DATA, produced only from a saved, approved record (the screen renders it in Amharic/English; no signature or seal is invented)
r.get('/hr-cases/:id/letter', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c);
  if (c.case_type === 'disciplinary' && !has(req, 'discipline.manage')) throw bad('Not allowed', 403);
  if (!(c.decision === 'approved' && ['approved', 'completed'].includes(c.stage))) throw bad('A letter can only be produced from an approved decision', 409);
  const st = await H.settings(); let service = null;
  if (c.case_type === 'experience_certificate') {
    const ps = (await q('SELECT * FROM service_periods WHERE employee_id=$1 AND verified ORDER BY start_date', [c.employee_id])).rows, emp = (await q('SELECT hire_date,termination_date,status FROM employees WHERE id=$1', [c.employee_id])).rows[0];
    if (!ps.length) throw bad('No verified service period exists. HR must verify the service history first', 409);
    const cur = ps.some((x) => x.is_current_institution) ? [] : [{ start_date: String(emp.hire_date).slice(0, 10), end_date: emp.termination_date ? String(emp.termination_date).slice(0, 10) : null }];
    service = { periods: ps.map((x) => ({ employer: x.employer, job_title: x.job_title, from: String(x.start_date).slice(0, 10), to: x.end_date ? String(x.end_date).slice(0, 10) : null })), total: S.total([...ps, ...cur], H.today()) };
  }
  const e = (await q('SELECT e.full_name,e.employee_no,e.hire_date,pos.title AS job_title,pos.grade,d.name AS department,sp.position_no FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN staff_positions sp ON sp.id=e.staff_position_id WHERE e.id=$1', [c.employee_id])).rows[0];
  audit(req, 'letter', 'hr_cases', c.id, c.ref_no);
  res.json({ ref_no: c.ref_no, case_type: c.case_type, org_name: st.org_name, employee: e, data: c.data, decision_reason: c.decision_reason, effective_date: c.effective_date, directive_ref: c.directive_ref, decided_on: c.decided_at, decided_by: c.decided_by_name, service,
    signature: 'Signature and official seal: to be applied by the authorized signatory (not generated by the system)' });
}));

module.exports = r;
module.exports.helpers = { ref, cleanData, ev, load };
