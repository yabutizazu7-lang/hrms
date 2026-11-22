// Work Experience Certificate (የሥራ ልምድ ማስረጃ).
// Workflow: Recommendation Letter (HR case type 'recommendation_letter') officially issued (stage 'completed')  ->  certificate enabled  ->  HR prepares a DRAFT from the
// employee database  ->  preview  ->  the HR authority (cases.decide_hr) approves and ISSUES it  ->  real PDF, stored with SHA-256, saved in the employee's personnel file.
// Every rule is enforced HERE (not in the browser): eligibility, permissions, one issued certificate per employee, frozen issued records, append-only history.
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), S = require('../service');
const { enqueue } = require('../notify'), E = require('./employees'), PDF = require('../certificate-pdf');
const r = express.Router(), REC = 'recommendation_letter', STATUSES = ['draft', 'issued', 'superseded', 'cancelled'], LANGS = ['am'];   // the certificate is issued in Amharic only
const staff = (req) => req.user.role !== 'super_admin';                                  // HR work is done by HR staff only (the technical owner account has no HR rights)
const isHR = (req) => staff(req) && has(req, 'cases.manage');                              // HR officer / HR manager: prepare, edit, preview
const isAuthority = (req) => staff(req) && has(req, 'cases.decide_hr');                    // the HR authority (HR Manager or an officer designated by name): approve + issue
const NOT_ENABLED = 'The Work Experience Certificate is enabled only after the HR recommendation (ምክረ ሐሳብ) has been given on the employee\'s Recommendation Letter request';
const localToday = async () => new Intl.DateTimeFormat('en-CA', { timeZone: (await H.settings()).timezone || 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const slug = (ref) => `Work-Experience-Certificate-${ref}.pdf`;

// ---- the enabling Recommendation Letter ------------------------------------------------------------------------------------------------------------------------
// the step that enables the certificate: the HR recommendation (ምክረ ሐሳብ) has been GIVEN on the Recommendation Letter request (stage recommended, or later: approved / completed; not rejected).
// The same applies to a Work-experience certificate request (case type experience_certificate).
const ENABLING = "(h.case_type IN ('recommendation_letter','experience_certificate') AND h.stage IN ('recommended','approved','completed') AND COALESCE(h.decision,'')<>'rejected')";
const issuedRecommendation = async (c, empId) => (await c.query(`SELECT h.id,h.ref_no,h.stage,COALESCE(h.completed_at,h.recommended_at,h.decided_at) AS completed_at FROM hr_cases h WHERE h.employee_id=$1 AND ${ENABLING} ORDER BY (h.stage='completed') DESC,h.id DESC LIMIT 1`, [empId])).rows[0] || null;

// ---- the certificate data: read from the employee database, nothing invented ------------------------------------------------------------------------------------
async function buildSnapshot(c, empId, rec, responsibilities, asOf) {
  const e = U.needRow((await c.query('SELECT e.*,pos.title AS pos_title,pos.grade AS pos_grade,d.name AS dept_name FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1', [empId])).rows[0], 'Employee');
  const periods = (await c.query('SELECT * FROM service_periods WHERE employee_id=$1', [empId])).rows, x = S.experience({ hire_date: e.hire_date, termination_date: e.termination_date }, periods, asOf);
  if (x.warnings.some((w) => ['hire_date_missing', 'hire_date_invalid', 'hire_date_future'].includes(w))) throw bad('The employment start date of this employee is missing, not valid or in the future. Correct the employee record first', 409);
  const title = e.pos_title || e.jeg_title; if (!title) throw bad('The job title of this employee is not recorded. Record it in the employee file first', 409);
  const hist = (await c.query("SELECT effective_date,kind,from_value,to_value FROM employee_history WHERE employee_id=$1 AND kind IN ('hired','promotion','transfer') ORDER BY effective_date,id", [empId])).rows, st = await H.settings();
  return {
    organization: { name: st.org_name, name_am: st.org_name_am || null },
    employee: { id: e.id, employee_no: e.employee_no, full_name: e.full_name, name_am: e.full_name_am || null, name_en: e.full_name_en || null },
    job: { title, title_am: e.jeg_title || null, grade: e.job_grade || e.pos_grade || null, department: e.dept_name || null },
    employment: { start_date: H.iso(e.hire_date), end_date: e.termination_date ? H.iso(e.termination_date) : null, status: e.status, as_of: x.as_of, service: { years: x.current.years, months: x.current.months, days: x.current.days } },
    history: hist.map((h) => ({ date: H.iso(h.effective_date), kind: h.kind, from: h.from_value, to: h.to_value })),
    responsibilities: responsibilities || null,
    recommendation: { case_id: rec.id, ref_no: rec.ref_no, issued_on: rec.completed_at ? H.iso(rec.completed_at) : null },
  };
}
// the part of a snapshot that must not change between the review of the draft and the issue (the length of service moves with the date and is recalculated)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);   // jsonb returns keys in its own order
const core = (s) => JSON.stringify(canon({ o: s.organization, e: s.employee, j: s.job, s: s.employment.start_date, n: s.employment.end_date, h: s.history, r: s.recommendation.case_id }));
const respText = (v) => {
  const s = U.str(v, { max: 1200, name: 'Work responsibilities' }); if (!s) return null;
  const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (lines.length > 10) throw bad('Write at most 10 work responsibilities (one per line)'); if (lines.some((l) => l.length > 160)) throw bad('A work responsibility line is too long (160 characters at most)');
  return lines.join('\n');
};
const ev = (t, id, action, from, to, note, uid) => t.query('INSERT INTO work_certificate_events(certificate_id,action,from_status,to_status,note,by_user) VALUES($1,$2,$3,$4,$5,$6)', [id, action, from, to, note || null, uid]);
const nextRef = async (t) => { const y = new Date().getFullYear(); return `WEC-${y}-${U.pad(await U.nextNo(t, 'wec-' + y), 5)}`; };

const SEL = `SELECT w.*,e.full_name,e.employee_no,d.name AS department,gu.name AS generated_by_name,au.name AS approved_by_name_now,cu.name AS cancelled_by_name,hc.ref_no AS recommendation_ref,old.ref_no AS supersedes_ref
  FROM work_certificates w JOIN employees e ON e.id=w.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users gu ON gu.id=w.generated_by LEFT JOIN users au ON au.id=w.approved_by LEFT JOIN users cu ON cu.id=w.cancelled_by
  LEFT JOIN hr_cases hc ON hc.id=w.recommendation_case_id LEFT JOIN work_certificates old ON old.id=w.supersedes_id`;
const load = async (c, id, lock = false) => U.needRow((await c.query(`${SEL} WHERE w.id=$1 ${lock ? 'FOR UPDATE OF w' : ''}`, [Number(id) || 0])).rows[0], 'Certificate');
// who may open a certificate: HR staff any; an employee only their own ISSUED certificate (anything else answers 404: existence is not revealed)
const mustSee = (req, c) => { if (isHR(req)) return; if (c.status === 'issued' && req.user.employee_id && c.employee_id === req.user.employee_id) return; throw bad('Certificate not found', 404); };
const actionsFor = (req, c) => {
  const me = req.user.employee_id, draft = c.status === 'draft', own = !!me && c.employee_id === me;
  return { edit: draft && isHR(req), refresh: draft && isHR(req), issue: draft && isAuthority(req) && !own, cancel: (draft && isHR(req)) || (c.status === 'issued' && isAuthority(req)), reissue: c.status === 'issued' && isAuthority(req) && !own, download: true };
};
const view = (c) => { const { pdf_storage, ...x } = c; return x; };

// ---- signature + stamp images (uploaded by the HR authority; the system never draws them) -------------------------------------------------------------------------
const MAX_IMG = 1024 * 1024;
const assetOf = async (kind, userId, c = { query: q }) => (await c.query(kind === 'stamp' ? "SELECT * FROM certificate_assets WHERE kind='stamp' AND active" : "SELECT * FROM certificate_assets WHERE kind='signature' AND active AND user_id=$1", kind === 'stamp' ? [] : [userId])).rows[0] || null;
const readAsset = (a) => { if (!a) return null; try { const buf = F.read('cert-assets', a.storage_name); return U.sha256(buf) === a.sha256 ? buf : null; } catch { return null; } };
r.get('/work-certificates/assets', perm('cases.manage'), wrap(async (req, res) => {
  const out = {}; for (const kind of ['stamp', 'signature']) { const a = await assetOf(kind, req.user.id), buf = readAsset(a); out[kind] = a && buf ? { id: a.id, filename: a.filename, uploaded_at: a.uploaded_at, data_url: `data:${a.mime};base64,${buf.toString('base64')}` } : null; }
  res.json({ ...out, can_upload: isAuthority(req) });
}));
r.post('/work-certificates/assets', perm('cases.decide_hr'), wrap(async (req, res) => {
  const kind = U.oneOf(req.body.kind, ['signature', 'stamp'], 'Kind'), f = F.save('cert-assets', req.body, ['image/png', 'image/jpeg']);
  if (f.size > MAX_IMG) { F.remove('cert-assets', f.storage); throw bad('The image is larger than 1 MB. Use a smaller PNG or JPEG'); }
  try {
    await tx(async (t) => {
      await t.query(kind === 'stamp' ? "UPDATE certificate_assets SET active=false WHERE kind='stamp' AND active" : "UPDATE certificate_assets SET active=false WHERE kind='signature' AND active AND user_id=$1", kind === 'stamp' ? [] : [req.user.id]);
      await t.query('INSERT INTO certificate_assets(kind,user_id,filename,mime,size_bytes,sha256,storage_name,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [kind, kind === 'signature' ? req.user.id : null, f.filename, f.mime, f.size, f.sha256, f.storage, req.user.id]);
    });
  } catch (e) { F.remove('cert-assets', f.storage); throw e; }
  audit(req, 'upload', 'certificate_assets', kind, f.sha256); res.status(201).json({ ok: true, kind });
}));
r.delete('/work-certificates/assets/:kind', perm('cases.decide_hr'), wrap(async (req, res) => {
  const kind = U.oneOf(req.params.kind, ['signature', 'stamp'], 'Kind');
  await q(kind === 'stamp' ? "UPDATE certificate_assets SET active=false WHERE kind='stamp' AND active" : "UPDATE certificate_assets SET active=false WHERE kind='signature' AND active AND user_id=$1", kind === 'stamp' ? [] : [req.user.id]);
  audit(req, 'remove', 'certificate_assets', kind); res.sendStatus(204);
}));

// ---- employees who received a Recommendation Letter, and where their certificate stands --------------------------------------------------------------------------
r.get('/work-certificates/employees', perm('cases.manage'), wrap(async (req, res) => {
  if (isHR(req)) await backfillDrafts(req.user.id).catch(() => 0);   // recommendation already given -> its draft exists when the page opens
  const p = [], w = ['TRUE'], page = Math.max(1, U.int(req.query.page || 1, 'Page')), size = Math.min(100, Math.max(1, U.int(req.query.page_size || 25, 'Page size')));
  if (req.query.q) w.push(`(e.full_name ILIKE $${p.push('%' + String(req.query.q).slice(0, 60) + '%')} OR e.employee_no ILIKE $${p.length} OR rc.ref_no ILIKE $${p.length})`);
  if (req.query.department_id) w.push(`e.department_id=$${p.push(U.int(req.query.department_id, 'Department'))}`);
  const state = String(req.query.state || '');
  if (state === 'enabled') w.push("rc.ok AND cert.id IS NULL"); else if (state === 'waiting') w.push("NOT rc.ok");
  else if (state === 'draft') w.push("cert.status='draft'"); else if (state === 'issued') w.push("cert.status='issued'"); else if (state) throw bad('State is not valid');
  const from = `FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id
    JOIN LATERAL (SELECT h.id,h.ref_no,h.stage,h.decision,h.completed_at,h.created_at,${ENABLING} AS ok FROM hr_cases h WHERE h.employee_id=e.id AND h.case_type IN ('${REC}','experience_certificate') ORDER BY ${ENABLING} DESC,h.id DESC LIMIT 1) rc ON TRUE
    LEFT JOIN LATERAL (SELECT x.id,x.ref_no,x.status,x.issue_date FROM work_certificates x WHERE x.employee_id=e.id AND x.status IN ('draft','issued') ORDER BY (x.status='issued') DESC,x.id DESC LIMIT 1) cert ON TRUE WHERE ${w.join(' AND ')}`;
  const total = Number((await q(`SELECT count(*) ${from}`, p)).rows[0].count);
  const rows = (await q(`SELECT e.id,e.employee_no,e.full_name,e.status AS employee_status,d.name AS department,pos.title AS job_title,rc.id AS recommendation_id,rc.ref_no AS recommendation_ref,rc.stage AS recommendation_stage,rc.decision AS recommendation_decision,rc.completed_at AS recommendation_issued_at,
    rc.ok AS enabled,cert.id AS certificate_id,cert.ref_no AS certificate_ref,cert.status AS certificate_status,cert.issue_date AS certificate_issue_date ${from} ORDER BY e.full_name LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
  res.json({ total, page, page_size: size, rows });
}));

// ---- certificate records (HR: all, with search and filters; an employee: their own issued certificates) -------------------------------------------------------------
r.get('/work-certificates', perm(), wrap(async (req, res) => {
  const p = [], w = [], page = Math.max(1, U.int(req.query.page || 1, 'Page')), size = Math.min(100, Math.max(1, U.int(req.query.page_size || 25, 'Page size')));
  if (isHR(req)) {
    if (req.query.status) w.push(`w.status=$${p.push(U.oneOf(req.query.status, STATUSES, 'Status'))}`);
    if (req.query.employee_id) w.push(`w.employee_id=$${p.push(U.int(req.query.employee_id, 'Employee'))}`);
    if (req.query.department_id) w.push(`e.department_id=$${p.push(U.int(req.query.department_id, 'Department'))}`);
    if (req.query.q) w.push(`(w.ref_no ILIKE $${p.push('%' + String(req.query.q).slice(0, 60) + '%')} OR e.full_name ILIKE $${p.length} OR e.employee_no ILIKE $${p.length})`);
    for (const [k, op] of [['from', '>='], ['to', '<=']]) if (req.query[k]) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[k]))) throw bad('Date is not valid'); w.push(`COALESCE(w.issue_date,w.generated_at::date)${op}$${p.push(req.query[k])}`); }
  } else w.push(req.user.employee_id ? `(w.employee_id=$${p.push(req.user.employee_id)} AND w.status='issued')` : 'FALSE');
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '', total = Number((await q(`SELECT count(*) FROM work_certificates w JOIN employees e ON e.id=w.employee_id ${where}`, p)).rows[0].count);
  const rows = (await q(`${SEL} ${where} ORDER BY COALESCE(w.issue_date,w.generated_at::date) DESC,w.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
  res.json({ total, page, page_size: size, rows: rows.map((x) => { const { snapshot, ...o } = view(x); return { ...o, job_title: snapshot.job.title, service: snapshot.employment.service }; }) });
}));

// ---- prepare a draft -------------------------------------------------------------------------------------------------------------------------------------------------
r.post('/work-certificates', perm('cases.manage'), wrap(async (req, res) => {
  const b = req.body, empId = U.int(b.employee_id, 'Employee', true), language = U.oneOf(b.language || 'am', LANGS, 'Language'), resp = respText(b.responsibilities);
  const out = await tx(async (t) => {
    const emp = U.needRow((await t.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [empId])).rows[0], 'Employee');   // serialises two people preparing a certificate for the same employee
    if (emp.id === req.user.employee_id) throw bad('You cannot prepare a certificate for yourself', 403);
    const rec = await issuedRecommendation(t, empId); if (!rec) throw bad(NOT_ENABLED, 409);
    const draft = (await t.query("SELECT id,ref_no FROM work_certificates WHERE employee_id=$1 AND status='draft'", [empId])).rows[0]; if (draft) throw bad(`A draft certificate (${draft.ref_no}) already exists for this employee. Open it instead of preparing another one`, 409);
    const issued = (await t.query("SELECT id,ref_no FROM work_certificates WHERE employee_id=$1 AND status='issued'", [empId])).rows[0]; let reason = null;
    if (issued) {
      if (!isAuthority(req)) throw bad(`A Work Experience Certificate (${issued.ref_no}) has already been issued to this employee. Only an authorized HR Manager can allow another one`, 409);
      if (b.reissue !== true) throw bad(`A Work Experience Certificate (${issued.ref_no}) has already been issued to this employee. To prepare another one, confirm the re-issue and give the reason`, 409);
      reason = U.str(b.reissue_reason, { req: true, max: 500, name: 'Reason for issuing another certificate' });
    }
    const snap = await buildSnapshot(t, empId, rec, resp, await localToday());
    const row = (await t.query('INSERT INTO work_certificates(ref_no,employee_id,recommendation_case_id,language,responsibilities,snapshot,generated_by,supersedes_id,reissue_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [await nextRef(t), empId, rec.id, language, resp, snap, req.user.id, issued ? issued.id : null, reason])).rows[0];
    await ev(t, row.id, 'generated', null, 'draft', reason ? 'Another certificate: ' + reason : `Enabled by Recommendation Letter ${rec.ref_no}`, req.user.id);
    return load(t, row.id);
  });
  audit(req, 'create', 'work_certificates', out.id, out.ref_no); res.status(201).json(view(out));
}));

r.get('/work-certificates/:id', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c);
  const events = isHR(req) ? (await q('SELECT v.*,u.name AS by_name FROM work_certificate_events v LEFT JOIN users u ON u.id=v.by_user WHERE v.certificate_id=$1 ORDER BY v.id', [c.id])).rows : [];
  const mineSig = isAuthority(req) ? !!readAsset(await assetOf('signature', req.user.id)) : null, stamp = isHR(req) ? !!readAsset(await assetOf('stamp')) : null;
  res.json({ ...view(c), events, actions: actionsFor(req, c), assets: isHR(req) ? { my_signature: mineSig, stamp } : null });
}));

r.put('/work-certificates/:id', perm('cases.manage'), wrap(async (req, res) => {
  const c = await tx(async (t) => {
    const c = await load(t, req.params.id, true); if (c.status !== 'draft') throw bad('Only a draft can be edited', 409);
    const language = req.body.language === undefined ? c.language : U.oneOf(req.body.language, LANGS, 'Language'), resp = req.body.responsibilities === undefined ? c.responsibilities : respText(req.body.responsibilities);
    await t.query('UPDATE work_certificates SET language=$2,responsibilities=$3,snapshot=jsonb_set(snapshot,\'{responsibilities}\',to_jsonb($3::text)) WHERE id=$1', [c.id, language, resp]);
    await ev(t, c.id, 'edited', 'draft', 'draft', 'language / responsibilities', req.user.id); return load(t, c.id);
  });
  audit(req, 'update', 'work_certificates', c.id, c.ref_no); res.json(view(c));
}));

r.post('/work-certificates/:id/refresh', perm('cases.manage'), wrap(async (req, res) => {
  const c = await tx(async (t) => {
    const c = await load(t, req.params.id, true); if (c.status !== 'draft') throw bad('Only a draft can be refreshed', 409);
    const rec = await issuedRecommendation(t, c.employee_id); if (!rec) throw bad(NOT_ENABLED, 409);
    await t.query('UPDATE work_certificates SET snapshot=$2,recommendation_case_id=$3 WHERE id=$1', [c.id, await buildSnapshot(t, c.employee_id, rec, c.responsibilities, await localToday()), rec.id]);
    await ev(t, c.id, 'refreshed', 'draft', 'draft', 'Employee data read again from the database', req.user.id); return load(t, c.id);
  });
  audit(req, 'refresh', 'work_certificates', c.id, c.ref_no); res.json(view(c));
}));

// ---- approve and issue (HR authority): real PDF, stored, saved in the employee's personnel file -------------------------------------------------------------------
r.post('/work-certificates/:id/issue', perm('cases.decide_hr'), wrap(async (req, res) => {
  let stored = null;
  try {
    const out = await tx(async (t) => {
      const c = await load(t, req.params.id, true); if (c.status !== 'draft') throw bad('Only a draft certificate can be issued', 409);
      if (c.employee_id === req.user.employee_id) throw bad('You cannot approve your own certificate', 403);
      const rec = await issuedRecommendation(t, c.employee_id); if (!rec) throw bad(NOT_ENABLED, 409);
      const today = await localToday(), fresh = await buildSnapshot(t, c.employee_id, rec, c.responsibilities, today);
      if (core(fresh) !== core(c.snapshot)) throw bad('The employee record changed after this draft was prepared. Use "Refresh data", check the preview again and then issue', 409);
      const u = (await t.query('SELECT u.name,u.job_title,r.name AS role_name FROM users u LEFT JOIN roles r ON r.code=u.role WHERE u.id=$1', [req.user.id])).rows[0], title = u.job_title || u.role_name || null;
      const sig = readAsset(await assetOf('signature', req.user.id, t)), stamp = readAsset(await assetOf('stamp', null, t)), ref = c.ref_no;
      const pdf = await PDF.build({ snap: fresh, status: 'issued', issueDate: today, ref, approver: { name: (await H.settings()).hr_manager_name || u.name, title }, signature: sig, stamp, language: 'am', draft: false });
      stored = F.save('emp/' + c.employee_id, { data: pdf.toString('base64'), mime: 'application/pdf', filename: slug(ref) }, ['application/pdf']);
      const doc = (await t.query("INSERT INTO employee_documents(employee_id,doc_type,title,filename,mime,size_bytes,sha256,storage_name,confidential,uploaded_by) VALUES($1,'certificate',$2,$3,'application/pdf',$4,$5,$6,false,$7) RETURNING id", [c.employee_id, `Work Experience Certificate ${ref}`, stored.filename, stored.size, stored.sha256, stored.storage, req.user.id])).rows[0];
      if (c.supersedes_id) { // the earlier certificate is kept in the history, closed
        const old = await load(t, c.supersedes_id, true);
        if (old.status === 'issued') { await t.query("UPDATE work_certificates SET status='superseded' WHERE id=$1", [old.id]); await ev(t, old.id, 'superseded', 'issued', 'superseded', `Replaced by ${ref}`, req.user.id); if (old.document_id) await t.query("UPDATE employee_documents SET title='[SUPERSEDED] '||title WHERE id=$1 AND title NOT LIKE '[%'", [old.document_id]); }
      }
      await t.query("UPDATE work_certificates SET status='issued',language='am',snapshot=$2,issue_date=$3,approved_by=$4,approved_by_name=$5,approved_by_title=$6,approved_at=now(),pdf_storage=$7,pdf_sha256=$8,pdf_size=$9,document_id=$10 WHERE id=$1", [c.id, fresh, today, req.user.id, u.name, title, stored.storage, stored.sha256, stored.size, doc.id]);
      await E.hist(t, c.employee_id, 'note', null, ref, 'Work experience certificate issued', req.user.id, today);
      await ev(t, c.id, 'issued', 'draft', 'issued', `Approved and issued by ${u.name}; signature ${sig ? 'image applied' : 'area left empty'}, stamp ${stamp ? 'image applied' : 'area left empty'}`, req.user.id);
      return load(t, c.id);
    });
    audit(req, 'issue', 'work_certificates', out.id, out.ref_no);
    const e = (await q('SELECT email,personal_email FROM employees WHERE id=$1', [out.employee_id])).rows[0];
    enqueue(e && (e.email || e.personal_email), `Work Experience Certificate ${out.ref_no} issued`, `Your Work Experience Certificate (${out.ref_no}) has been issued by the HR department. Sign in to the HRMS (Work Experience Certificate) to download it.`);
    res.json(view(out));
  } catch (e) { if (stored) F.remove('emp/' + (Number(req.params.id) && (await q('SELECT employee_id FROM work_certificates WHERE id=$1', [Number(req.params.id)])).rows[0]?.employee_id), stored.storage); throw e; }
}));

r.post('/work-certificates/:id/cancel', perm(), wrap(async (req, res) => {
  const reason = U.str(req.body.reason, { req: true, max: 500, name: 'Reason' });
  const c = await tx(async (t) => {
    const c = await load(t, req.params.id, true);
    if (c.status === 'draft') { if (!isHR(req)) throw bad('Certificate not found', 404); } else if (c.status === 'issued') { if (!isAuthority(req)) throw bad('Only the HR authority can cancel an issued certificate', 403); } else throw bad('This certificate is already closed', 409);
    await t.query("UPDATE work_certificates SET status='cancelled',cancelled_by=$2,cancelled_at=now(),cancel_reason=$3 WHERE id=$1", [c.id, req.user.id, reason]);
    if (c.status === 'issued' && c.document_id) await t.query("UPDATE employee_documents SET title='[CANCELLED] '||title WHERE id=$1 AND title NOT LIKE '[%'", [c.document_id]);
    await ev(t, c.id, 'cancelled', c.status, 'cancelled', reason, req.user.id); return load(t, c.id);
  });
  audit(req, 'cancel', 'work_certificates', c.id, c.ref_no); res.json(view(c));
}));

// ---- the PDF: a draft is a watermarked preview, an issued certificate is the stored file (SHA-256 checked on every download) ------------------------------------------
r.get('/work-certificates/:id/pdf', perm(), wrap(async (req, res) => {
  const c = await load({ query: q }, req.params.id); mustSee(req, c);
  const name = `inline; filename="${slug(c.ref_no)}"`, head = { 'Content-Type': 'application/pdf', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (c.status === 'draft') {
    const language = 'am';
    const buf = await PDF.build({ snap: c.snapshot, status: 'draft', issueDate: null, ref: c.ref_no, approver: null, signature: null, stamp: null, language, draft: true });
    audit(req, 'preview', 'work_certificates', c.id, c.ref_no); return res.set({ ...head, 'Content-Disposition': name }).send(buf);
  }
  if (!c.pdf_storage) throw bad('This certificate has no PDF', 404);
  const buf = F.read('emp/' + c.employee_id, c.pdf_storage);
  if (U.sha256(buf) !== c.pdf_sha256) { audit(req, 'integrity_failure', 'work_certificates', c.id); throw bad('The integrity check of this file failed. It may have been altered. Tell the system administrator', 500); }
  audit(req, 'download', 'work_certificates', c.id, c.ref_no);
  res.set({ ...head, 'Content-Disposition': (req.query.download === '1' ? 'attachment' : 'inline') + `; filename="${slug(c.ref_no)}"` }).send(buf);
}));

// called by the HR case workflow right after the recommendation is given: the certificate draft is prepared automatically (HR then previews, edits and the HR authority issues it).
// Best effort and inside a savepoint: if the employee record is incomplete (e.g. no job title) the recommendation still succeeds and HR prepares the draft by hand with the explanation.
async function autoDraft(t, empId, userId) {
  const rec = await issuedRecommendation(t, empId); if (!rec) return null;
  if ((await t.query("SELECT 1 FROM work_certificates WHERE employee_id=$1 AND status IN ('draft','issued')", [empId])).rows[0]) return null;
  await t.query('SAVEPOINT auto_cert');
  try {
    const snap = await buildSnapshot(t, empId, rec, null, await localToday()), row = (await t.query('INSERT INTO work_certificates(ref_no,employee_id,recommendation_case_id,language,responsibilities,snapshot,generated_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [await nextRef(t), empId, rec.id, 'am', null, snap, userId])).rows[0];
    await ev(t, row.id, 'generated', null, 'draft', `Prepared automatically when the recommendation was given (${rec.ref_no})`, userId); await t.query('RELEASE SAVEPOINT auto_cert'); return row.id;
  } catch (e) { await t.query('ROLLBACK TO SAVEPOINT auto_cert'); return null; }
}
// drafts for employees whose recommendation was given BEFORE this rule existed (or while the employee record was incomplete): runs at server start and whenever HR opens the employee list
async function backfillDrafts(userId = null) {
  const rows = (await q(`SELECT DISTINCT e.id FROM employees e JOIN hr_cases h ON h.employee_id=e.id AND ${ENABLING} WHERE NOT EXISTS (SELECT 1 FROM work_certificates w WHERE w.employee_id=e.id AND w.status IN ('draft','issued')) LIMIT 50`)).rows; let n = 0;
  for (const x of rows) if (await tx((t) => autoDraft(t, x.id, userId))) n++; return n;
}
const start = () => setTimeout(() => backfillDrafts().catch((e) => console.error('certificate drafts:', e.message)), 9000).unref();
module.exports = { router: r, autoDraft, backfillDrafts, start };
