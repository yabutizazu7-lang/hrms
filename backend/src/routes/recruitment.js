const express = require('express'), fs = require('fs'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad, limit } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), { enqueue } = require('../notify'), E = require('./employees');
const r = express.Router();
const TYPES = ['permanent', 'contract', 'probation', 'intern', 'part_time'], CV_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const FLOW = { applied: ['screening', 'rejected', 'withdrawn'], screening: ['interview', 'rejected', 'withdrawn'], interview: ['offer', 'rejected', 'withdrawn'], offer: ['rejected', 'withdrawn'] };

// ---------------------------------------------------------------- vacancies
const vBody = (b) => ({ title: U.str(b.title, { req: true, max: 150, name: 'Title' }), position_id: U.int(b.position_id, 'Position'), department_id: U.int(b.department_id, 'Department'), headcount: U.int(b.headcount ?? 1, 'Number of posts'), description: U.str(b.description, { max: 6000 }), requirements: U.str(b.requirements, { max: 4000 }), employment_type: U.oneOf(b.employment_type || 'permanent', TYPES, 'Employment type'), location: U.str(b.location, { max: 120 }), deadline: U.str(b.deadline, { max: 10 }) });
r.get('/vacancies', perm('recruitment.manage'), wrap(async (req, res) => res.json((await q(`SELECT v.*,d.name AS department_name,(SELECT count(*) FROM applicants a WHERE a.vacancy_id=v.id)::int AS applicants,(SELECT count(*) FROM applicants a WHERE a.vacancy_id=v.id AND a.stage='hired')::int AS hired FROM vacancies v LEFT JOIN departments d ON d.id=v.department_id ORDER BY v.created_at DESC`)).rows)));
r.post('/vacancies', perm('recruitment.manage'), wrap(async (req, res) => {
  const b = vBody(req.body), row = await tx(async (t) => { const c = Object.keys(b); return (await t.query(`INSERT INTO vacancies(ref_no,${c},created_by) VALUES($1,${c.map((_, i) => '$' + (i + 2))},$${c.length + 2}) RETURNING *`, [`VAC-${U.year()}-${U.pad(await U.nextNo(t, 'vacancy:' + U.year()), 4)}`, ...Object.values(b), req.user.id])).rows[0]; });
  audit(req, 'create', 'vacancies', row.id, row.ref_no); res.status(201).json(row);
}));
r.put('/vacancies/:id', perm('recruitment.manage'), wrap(async (req, res) => { const b = vBody(req.body), c = Object.keys(b), row = U.needRow((await q(`UPDATE vacancies SET ${c.map((k, i) => `${k}=$${i + 2}`)} WHERE id=$1 AND status IN('draft','open') RETURNING *`, [Number(req.params.id) || 0, ...Object.values(b)])).rows[0], 'Editable vacancy'); audit(req, 'update', 'vacancies', row.id); res.json(row); }));
r.post('/vacancies/:id/publish', perm('recruitment.manage'), wrap(async (req, res) => {
  const v = U.needRow((await q('SELECT * FROM vacancies WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Vacancy'); if (v.status !== 'draft') throw bad('Only a draft vacancy can be published');
  if (!v.description) throw bad('Write the job description before publishing'); if (!v.deadline || String(v.deadline).slice(0, 10) < H.today()) throw bad('Set an application deadline that is today or later');
  const row = (await q("UPDATE vacancies SET status='open',posted_at=now() WHERE id=$1 RETURNING *", [v.id])).rows[0]; audit(req, 'publish', 'vacancies', v.id); res.json(row);
}));
r.post('/vacancies/:id/close', perm('recruitment.manage'), wrap(async (req, res) => { const row = U.needRow((await q("UPDATE vacancies SET status='closed' WHERE id=$1 AND status='open' RETURNING *", [Number(req.params.id) || 0])).rows[0], 'Open vacancy'); audit(req, 'close', 'vacancies', row.id); res.json(row); }));

// ---------------------------------------------------------------- public careers site
const OPEN = "v.status='open' AND (v.deadline IS NULL OR v.deadline>=CURRENT_DATE)";
r.get('/public/vacancies', wrap(async (req, res) => res.json((await q(`SELECT v.id,v.ref_no,v.title,v.employment_type,v.location,v.deadline,v.posted_at,d.name AS department FROM vacancies v LEFT JOIN departments d ON d.id=v.department_id WHERE ${OPEN} ORDER BY v.posted_at DESC`)).rows)));
r.get('/public/vacancies/:id', wrap(async (req, res) => res.json(U.needRow((await q(`SELECT v.id,v.ref_no,v.title,v.description,v.requirements,v.employment_type,v.location,v.deadline,v.headcount,d.name AS department FROM vacancies v LEFT JOIN departments d ON d.id=v.department_id WHERE v.id=$1 AND ${OPEN}`, [Number(req.params.id) || 0])).rows[0], 'Vacancy'))));
r.post('/public/apply', limit(6, 60 * 60 * 1000), wrap(async (req, res) => {
  const b = req.body || {}; if (b.website) return res.status(201).json({ tracking_code: 'AP-' + U.randomCode(8) });
  const email = U.email(b.email), phone = U.phone(b.phone); if (!email && !phone) throw bad('Leave a phone number or an e-mail address so we can contact you');
  const v = U.needRow((await q(`SELECT v.id,v.title FROM vacancies v WHERE v.id=$1 AND ${OPEN}`, [U.int(b.vacancy_id, 'Vacancy', true)])).rows[0], 'Vacancy'), code = 'AP-' + U.randomCode(8);
  if (email && (await q("SELECT 1 FROM applicants WHERE vacancy_id=$1 AND lower(email)=$2 AND stage NOT IN('rejected','withdrawn')", [v.id, email])).rows[0]) throw bad('You have already applied for this vacancy', 409);
  if (!b.cv) throw bad('Attach your CV (PDF or Word)'); const f = F.save('cv', b.cv, CV_TYPES);
  try {
    const row = (await q(`INSERT INTO applicants(vacancy_id,tracking_code,full_name,email,phone,sex,education,experience_years,cover_note,cv_filename,cv_mime,cv_size,cv_sha256,cv_storage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [v.id, code, U.str(b.full_name, { req: true, max: 150, name: 'Your name' }), email, phone, U.oneOf(b.sex || null, ['male', 'female'], 'Sex', false), U.str(b.education, { max: 200 }), U.int(b.experience_years, 'Years of experience'), U.str(b.cover_note, { max: 3000 }), f.filename, f.mime, f.size, f.sha256, f.storage])).rows[0];
    if (email) await enqueue(email, `Application received: ${v.title}`, `Thank you for applying for "${v.title}".\nTracking code: ${code}\nFollow it at ${process.env.PUBLIC_URL || ''}/p/track?code=${code}`);
    audit({ ip: req.ip }, 'public_apply', 'applicants', row.id); res.status(201).json({ tracking_code: code });
  } catch (x) { F.remove('cv', f.storage); throw x; }
}));
const PUBLIC_STAGE = { applied: 'received', screening: 'in_review', interview: 'in_review', offer: 'in_review', hired: 'selected', rejected: 'not_selected', withdrawn: 'withdrawn' };
r.get('/public/applications/:code', limit(40, 60 * 60 * 1000), wrap(async (req, res) => {
  const a = U.needRow((await q('SELECT a.tracking_code,a.stage,a.created_at,v.title FROM applicants a JOIN vacancies v ON v.id=a.vacancy_id WHERE a.tracking_code=$1', [String(req.params.code).toUpperCase().trim()])).rows[0], 'No application with this code');
  res.json({ tracking_code: a.tracking_code, vacancy: a.title, status: PUBLIC_STAGE[a.stage], applied_at: a.created_at }); // the applicant never sees internal stages or notes
}));

// ---------------------------------------------------------------- applicants (HR)
r.get('/applicants', perm('recruitment.manage'), wrap(async (req, res) => {
  const p = [], w = [], f = req.query; if (f.vacancy_id) w.push(`a.vacancy_id=$${p.push(U.int(f.vacancy_id, 'Vacancy'))}`); if (f.stage) w.push(`a.stage=$${p.push(f.stage)}`); if (f.q) w.push(`(a.full_name ILIKE $${p.push('%' + f.q + '%')} OR a.email ILIKE $${p.length} OR a.tracking_code ILIKE $${p.length})`);
  res.json((await q(`SELECT a.id,a.tracking_code,a.full_name,a.email,a.phone,a.education,a.experience_years,a.stage,a.created_at,v.title AS vacancy,v.ref_no,(SELECT round(avg(rating),1) FROM applicant_notes n WHERE n.applicant_id=a.id AND rating IS NOT NULL)::float AS avg_rating FROM applicants a JOIN vacancies v ON v.id=a.vacancy_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT 400`, p)).rows);
}));
r.get('/applicants/:id', perm('recruitment.manage'), wrap(async (req, res) => {
  const a = U.needRow((await q('SELECT a.*,v.title AS vacancy,v.department_id,v.position_id,v.employment_type AS vacancy_type FROM applicants a JOIN vacancies v ON v.id=a.vacancy_id WHERE a.id=$1', [Number(req.params.id) || 0])).rows[0], 'Applicant');
  const notes = (await q('SELECT n.*,u.name AS user_name FROM applicant_notes n LEFT JOIN users u ON u.id=n.user_id WHERE n.applicant_id=$1 ORDER BY n.at DESC', [a.id])).rows; delete a.cv_storage; audit(req, 'view', 'applicants', a.id); res.json({ ...a, notes, next_stages: FLOW[a.stage] ? [{ applied: 'screening', screening: 'interview', interview: 'offer', offer: null }[a.stage], 'rejected'].filter(Boolean) : [] });
}));
r.get('/applicants/:id/cv', perm('recruitment.manage'), wrap(async (req, res) => {
  const a = U.needRow((await q('SELECT * FROM applicants WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Applicant'), buf = F.read('cv', a.cv_storage); if (U.sha256(buf) !== a.cv_sha256) throw bad('The integrity check of this file failed. It may have been altered', 500);
  audit(req, 'download_cv', 'applicants', a.id); res.set({ 'Content-Type': a.cv_mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.cv_filename)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(buf);
}));
r.post('/applicants/:id/stage', perm('recruitment.manage'), wrap(async (req, res) => {
  const to = U.oneOf(req.body.stage, ['screening', 'interview', 'offer', 'rejected', 'withdrawn'], 'Stage'), note = U.str(req.body.note, { max: 2000 }), rating = U.int(req.body.rating, 'Rating');
  if (rating != null && (rating < 1 || rating > 5)) throw bad('Rating must be between 1 and 5'); if (to === 'rejected' && !note) throw bad('Write the reason for rejecting the applicant');
  const out = await tx(async (t) => {
    const a = U.needRow((await t.query('SELECT a.*,v.title FROM applicants a JOIN vacancies v ON v.id=a.vacancy_id WHERE a.id=$1 FOR UPDATE OF a', [Number(req.params.id) || 0])).rows[0], 'Applicant');
    if (!(FLOW[a.stage] || []).includes(to)) throw bad(`An applicant in "${a.stage}" cannot move to "${to}"`); if (to === 'offer' && !(await t.query("SELECT 1 FROM applicant_notes WHERE applicant_id=$1 AND stage='interview' AND rating IS NOT NULL", [a.id])).rows[0]) throw bad('Record an interview rating before making an offer');
    const u = (await t.query('UPDATE applicants SET stage=$2,rejection_reason=CASE WHEN $2=\'rejected\' THEN $3 ELSE rejection_reason END WHERE id=$1 RETURNING *', [a.id, to, note])).rows[0];
    await t.query('INSERT INTO applicant_notes(applicant_id,user_id,stage,rating,body) VALUES($1,$2,$3,$4,$5)', [a.id, req.user.id, a.stage, rating, note || `Moved to ${to}`]);
    if (a.email && ['offer', 'rejected'].includes(to)) await enqueue(a.email, `Your application: ${a.title}`, to === 'offer' ? `We are pleased to inform you that we would like to make you an offer for "${a.title}". HR will contact you.` : `Thank you for your interest in "${a.title}". After careful consideration we will not continue with your application.`);
    return u;
  });
  audit(req, 'stage', 'applicants', out.id, out.stage); res.json(out);
}));
r.post('/applicants/:id/note', perm('recruitment.manage'), wrap(async (req, res) => {
  const a = U.needRow((await q('SELECT id,stage FROM applicants WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Applicant'), rating = U.int(req.body.rating, 'Rating'); if (rating != null && (rating < 1 || rating > 5)) throw bad('Rating must be between 1 and 5');
  await q('INSERT INTO applicant_notes(applicant_id,user_id,stage,rating,body) VALUES($1,$2,$3,$4,$5)', [a.id, req.user.id, a.stage, rating, U.str(req.body.body, { req: true, max: 2000, name: 'Note' })]); res.status(201).json({ ok: true });
}));
// offer accepted: the applicant becomes an employee
r.post('/applicants/:id/hire', perm('recruitment.manage'), wrap(async (req, res) => {
  if (!has(req, 'employees.manage')) throw bad('You need permission to register employees', 403);
  const out = await tx(async (t) => {
    const a = U.needRow((await t.query('SELECT a.*,v.id AS vid,v.headcount,v.department_id,v.position_id,v.employment_type FROM applicants a JOIN vacancies v ON v.id=a.vacancy_id WHERE a.id=$1 FOR UPDATE OF a', [Number(req.params.id) || 0])).rows[0], 'Applicant'); if (a.stage !== 'offer') throw bad('Only an applicant who received an offer can be hired');
    const parts = a.full_name.trim().split(/\s+/); if (parts.length < 2) throw bad("The applicant's full name needs at least a first and a father's name. Correct it before hiring"); if (!a.sex) throw bad('Set the sex of the applicant before hiring');
    const b = req.body, emp = await E.createEmployee(t, req, { first_name: parts[0], father_name: parts[1], grandfather_name: parts.slice(2).join(' ') || null, sex: a.sex, phone: a.phone, email: b.work_email || a.email, hire_date: b.hire_date, department_id: b.department_id ?? a.department_id, position_id: b.position_id ?? a.position_id, manager_id: b.manager_id, employment_type: b.employment_type || a.employment_type,
      probation_end: b.probation_end, contract_end: b.contract_end, ...(b.basic_salary ? { basic_salary: b.basic_salary } : {}) }, true);   // a hired applicant also starts as Probationary (Trial Period)
    const buf = F.read('cv', a.cv_storage); const f = F.save('emp/' + emp.id, { data: buf.toString('base64'), mime: a.cv_mime, filename: a.cv_filename });
    await t.query("INSERT INTO employee_documents(employee_id,doc_type,title,filename,mime,size_bytes,sha256,storage_name,uploaded_by) VALUES($1,'cv','CV from recruitment',$2,$3,$4,$5,$6,$7)", [emp.id, f.filename, f.mime, f.size, f.sha256, f.storage, req.user.id]);
    await t.query("UPDATE applicants SET stage='hired',employee_id=$2 WHERE id=$1", [a.id, emp.id]); await t.query("INSERT INTO applicant_notes(applicant_id,user_id,stage,body) VALUES($1,$2,'offer',$3)", [a.id, req.user.id, `Hired as ${emp.employee_no}`]);
    const hired = Number((await t.query("SELECT count(*) FROM applicants WHERE vacancy_id=$1 AND stage='hired'", [a.vid])).rows[0].count); if (hired >= a.headcount) await t.query("UPDATE vacancies SET status='filled' WHERE id=$1", [a.vid]);
    return emp;
  });
  audit(req, 'hire', 'applicants', req.params.id, out.employee_no); res.status(201).json(out);
}));
module.exports = r;
