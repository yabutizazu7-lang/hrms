// Staff positions + identifiers, service history, uniforms & equipment (Directive 173/2018), annual HR plan, workflow configuration.
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), IDS = require('../ids'), PM = require('../ppe-map'), S = require('../service'), E = require('./employees');
const r = express.Router(), ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (v, name, req = false) => { const s = U.str(v, { max: 10, req, name }); if (s && (!ISO.test(s) || isNaN(new Date(s)))) throw bad(`${name} is not a valid date`); return s; };
const page = (req) => ({ page: Math.max(1, U.int(req.query.page || 1, 'Page')), size: Math.min(200, Math.max(1, U.int(req.query.page_size || 50, 'Page size'))) });

// ============================================================ staff positions (ቋሚ የሰራተኛ መደብ ቁጥር)
r.get('/staff-positions', perm('positions.manage', 'hr.view_all'), wrap(async (req, res) => {
  const { page: pg, size } = page(req), p = [], w = [];
  if (req.query.q) w.push(`(sp.position_no ILIKE $${p.push('%' + String(req.query.q).slice(0, 40) + '%')} OR sp.job_title ILIKE $${p.length})`);
  if (req.query.department_id) w.push(`sp.department_id=$${p.push(U.int(req.query.department_id, 'Department'))}`);
  if (req.query.occupancy === 'vacant') w.push('(SELECT count(*) FROM employees x WHERE x.staff_position_id=sp.id AND x.status<>\'terminated\') < sp.capacity'); if (req.query.occupancy === 'occupied') w.push('EXISTS (SELECT 1 FROM employees x WHERE x.staff_position_id=sp.id AND x.status<>\'terminated\')');
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '', total = Number((await q(`SELECT count(*) FROM staff_positions sp ${where}`, p)).rows[0].count);
  const rows = (await q(`SELECT sp.*,d.name AS department,(SELECT count(*) FROM employees x WHERE x.staff_position_id=sp.id AND x.status<>'terminated')::int AS occupied,
    (SELECT string_agg(x.full_name,', ') FROM employees x WHERE x.staff_position_id=sp.id AND x.status<>'terminated') AS holder FROM staff_positions sp LEFT JOIN departments d ON d.id=sp.department_id ${where} ORDER BY sp.position_no LIMIT ${size} OFFSET ${(pg - 1) * size}`, p)).rows;
  res.json({ total, page: pg, page_size: size, rows });
}));
const spBody = (b) => ({ position_no: IDS.normPositionNo(b.position_no), position_id: U.int(b.position_id, 'Position'), job_title: U.str(b.job_title, { max: 200 }), department_id: U.int(b.department_id, 'Department'), grade: U.str(b.grade, { max: 20 }),
  capacity: U.int(b.capacity ?? 1, 'Capacity') || 1, capacity_authority: U.str(b.capacity_authority, { max: 300 }), status: U.oneOf(b.status || 'active', ['active', 'frozen', 'abolished'], 'Status'), note: U.str(b.note, { max: 500 }) });
r.post('/staff-positions', perm('positions.manage'), wrap(async (req, res) => {
  const o = spBody(req.body); if (o.capacity > 1 && !o.capacity_authority) throw bad('A capacity above 1 needs the reference of the decision that permits it');
  const c = Object.keys(o), row = (await q(`INSERT INTO staff_positions(${c},created_by) VALUES(${c.map((_, i) => '$' + (i + 1))},$${c.length + 1}) RETURNING *`, [...Object.values(o), req.user.id])).rows[0]; audit(req, 'create', 'staff_positions', row.id, row.position_no); res.status(201).json(row);
}));
r.put('/staff-positions/:id', perm('positions.manage'), wrap(async (req, res) => {
  const o = spBody(req.body); if (o.capacity > 1 && !o.capacity_authority) throw bad('A capacity above 1 needs the reference of the decision that permits it'); const c = Object.keys(o);
  const row = U.needRow((await q(`UPDATE staff_positions SET ${c.map((k, i) => `${k}=$${i + 2}`)},verified=COALESCE($${c.length + 2},verified) WHERE id=$1 RETURNING *`, [Number(req.params.id) || 0, ...Object.values(o), req.body.verified === undefined ? null : !!req.body.verified])).rows[0], 'Staff position'); audit(req, 'update', 'staff_positions', row.id, row.position_no); res.json(row);
}));

// ============================================================ identifiers of one employee (internal ID is read-only; the other two are set here)
r.put('/employees/:id/identifiers', perm('positions.manage', 'fayda.view'), wrap(async (req, res) => {
  const b = req.body, id = Number(req.params.id) || 0, flags = [];
  const out = await tx(async (t) => {
    const cur = U.needRow((await t.query('SELECT * FROM employees WHERE id=$1 FOR UPDATE', [id])).rows[0], 'Employee'), sets = {}, change = [];
    if (id === req.user.employee_id && req.user.role !== 'super_admin') throw bad('You cannot change your own identifiers', 403);
    if (b.staff_position_id !== undefined) {
      if (!has(req, 'positions.manage')) throw bad('You do not have permission to assign staff positions', 403);
      const sp = b.staff_position_id === null || b.staff_position_id === '' ? null : U.int(b.staff_position_id, 'Staff position'); if (sp) U.needRow((await t.query('SELECT 1 FROM staff_positions WHERE id=$1', [sp])).rows[0], 'Staff position');
      sets.staff_position_id = sp; change.push('staff position');
    }
    if (b.fayda_fan !== undefined) {
      if (!(has(req, 'fayda.view') && has(req, 'employees.manage'))) throw bad('You do not have permission to change Fayda numbers', 403);
      const fan = IDS.normFan(b.fayda_fan); sets.fayda_fan = fan; change.push('Fayda number');
      if (!fan) sets.fayda_status = 'not_collected';
      else if (!IDS.fanWellFormed(fan)) { sets.fayda_status = 'pending_verification'; flags.push('The Fayda number does not have 16 digits'); }
      else if ((await t.query('SELECT 1 FROM employees WHERE fayda_fan=$1 AND id<>$2', [fan, id])).rows[0]) { sets.fayda_status = 'pending_verification'; flags.push('Another employee has the same Fayda number'); }
      else sets.fayda_status = b.fayda_verified ? 'verified' : 'pending_verification';
    }
    if (b.identifiers_verified !== undefined) sets.identifiers_verified = !!b.identifiers_verified;
    const k = Object.keys(sets); if (!k.length) throw bad('Nothing to change');
    await t.query(`UPDATE employees SET ${k.map((x, i) => `${x}=$${i + 2}`)},updated_at=now() WHERE id=$1`, [id, ...Object.values(sets)]);
    for (const f of flags) await t.query('INSERT INTO verification_flags(employee_id,field,issue) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, 'fayda_fan', f]);
    await E.hist(t, id, 'note', null, null, 'Identifiers updated: ' + change.join(', '), req.user.id);   // values are NOT written to history
    return (await t.query('SELECT id,employee_no,staff_position_id,fayda_status,identifiers_verified FROM employees WHERE id=$1', [id])).rows[0];
  });
  audit(req, 'identifiers', 'employees', id, Object.keys(b).filter((x) => x !== 'fayda_fan').join(',')); res.json({ ...out, warnings: flags });
}));
r.get('/employees/:id/fayda', perm('fayda.view'), wrap(async (req, res) => {   // the only place a full Fayda number is revealed, and every reveal is audited
  const e = U.needRow((await q('SELECT id,employee_no,fayda_fan,fayda_status FROM employees WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Employee'); audit(req, 'reveal_fayda', 'employees', e.id, e.employee_no); res.json(e);
}));
r.get('/verification-flags', perm('positions.manage', 'employees.manage'), wrap(async (req, res) => res.json((await q(`SELECT v.*,e.employee_no,e.full_name FROM verification_flags v JOIN employees e ON e.id=v.employee_id WHERE NOT v.resolved ORDER BY v.id LIMIT 500`)).rows)));
r.post('/verification-flags/:id/resolve', perm('positions.manage', 'employees.manage'), wrap(async (req, res) => { const f = U.needRow((await q('UPDATE verification_flags SET resolved=true,resolved_by=$2,resolved_at=now() WHERE id=$1 RETURNING id', [Number(req.params.id) || 0, req.user.id])).rows[0], 'Flag'); audit(req, 'resolve', 'verification_flags', f.id); res.json({ ok: true }); }));

// ============================================================ module 3: service history and experience
const canService = (req, empId) => has(req, 'service.manage') || has(req, 'hr.view_all') || empId === req.user.employee_id;
r.get('/employees/:id/service', perm(), wrap(async (req, res) => {
  const id = Number(req.params.id) || 0; if (!canService(req, id)) throw bad('Employee not found', 404);
  const e = U.needRow((await q('SELECT id,hire_date,termination_date FROM employees WHERE id=$1', [id])).rows[0], 'Employee'), ps = (await q('SELECT * FROM service_periods WHERE employee_id=$1 ORDER BY start_date', [id])).rows, asOf = H.today();
  const x = S.experience(e, ps, asOf);   // the one shared calculation (profile, lists, reports and this tab all use it)
  res.json({ periods: ps, current_institution_from: e.hire_date ? String(e.hire_date).slice(0, 10) : null, experience: x, verified_total: x.total_verified, claimed_total: x.claimed_total, note: 'Overlapping periods are counted once. Only verified periods count towards the verified total.' });
}));
const spBody2 = (b) => { const o = { employer: U.str(b.employer, { req: true, max: 200, name: 'Employer' }), department: U.str(b.department, { max: 150 }), job_title: U.str(b.job_title, { max: 150 }), grade: U.str(b.grade, { max: 20 }), employment_type: U.str(b.employment_type, { max: 40 }), start_date: day(b.start_date, 'Start date', true), end_date: day(b.end_date, 'End date'), interruption_note: U.str(b.interruption_note, { max: 500 }), note: U.str(b.note, { max: 500 }) }; if (o.end_date && o.end_date < o.start_date) throw bad('The end date is before the start date'); if (!o.end_date && !b.is_current_institution) throw bad('Enter the end date (only the current institution can be open-ended)'); if (o.start_date > H.today()) throw bad('The start date cannot be in the future'); if (o.end_date && o.end_date > H.today()) throw bad('The end date cannot be in the future'); o.is_current_institution = !!b.is_current_institution; return o; };
r.post('/employees/:id/service', perm('service.manage'), wrap(async (req, res) => {
  const o = spBody2(req.body), c = Object.keys(o), id = Number(req.params.id) || 0; const emp = U.needRow((await q('SELECT id,hire_date,termination_date FROM employees WHERE id=$1', [id])).rows[0], 'Employee');
  if ((await q('SELECT 1 FROM service_periods WHERE employee_id=$1 AND lower(employer)=lower($2) AND start_date=$3 AND end_date IS NOT DISTINCT FROM $4', [id, o.employer, o.start_date, o.end_date])).rows[0]) throw bad('This service period is already recorded');
  const row = (await q(`INSERT INTO service_periods(employee_id,${c},created_by) VALUES($1,${c.map((_, i) => '$' + (i + 2))},$${c.length + 2}) RETURNING *`, [id, ...Object.values(o), req.user.id])).rows[0]; audit(req, 'create', 'service_periods', row.id); res.status(201).json({ ...row, warnings: S.experience(emp, (await q('SELECT * FROM service_periods WHERE employee_id=$1', [id])).rows, H.today()).warnings });
}));
r.post('/service/:id/verify', perm('service.manage'), wrap(async (req, res) => {   // verifying is a separate act from entering; the person who entered it can not verify it
  const cur = U.needRow((await q('SELECT * FROM service_periods WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Service period'); if (cur.created_by === req.user.id) throw bad('Another HR user must verify what you entered', 403);
  const row = (await q('UPDATE service_periods SET verified=true,verified_by=$2,verified_at=now() WHERE id=$1 RETURNING *', [cur.id, req.user.id])).rows[0]; audit(req, 'verify', 'service_periods', cur.id); res.json(row);
}));
r.delete('/service/:id', perm('service.manage'), wrap(async (req, res) => { const cur = U.needRow((await q('SELECT * FROM service_periods WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Service period'); if (cur.verified) throw bad('A verified service period is permanent', 409); await q('DELETE FROM service_periods WHERE id=$1', [cur.id]); audit(req, 'delete', 'service_periods', cur.id); res.sendStatus(204); }));

// ============================================================ module 6 helper: retirement eligibility (config-driven, never built-in)
r.get('/employees/:id/retirement-assessment', perm('cases.manage', 'cases.view'), wrap(async (req, res) => {
  const e = U.needRow((await q('SELECT id,date_of_birth,hire_date,termination_date,status FROM employees WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Employee'), st = await H.settings(true), age = Number(st.retirement_age_years), minSvc = Number(st.retirement_min_service_years);
  const configured = Number.isFinite(age) && age > 0 && st.retirement_age_years !== '';
  const svc = S.experience(e, (await q('SELECT * FROM service_periods WHERE employee_id=$1', [e.id])).rows, H.today()).total_verified;
  if (!configured) return res.json({ status: 'configuration_required', message: 'The retirement age has not been configured. An authorized HR decision citing the governing law must be entered in the settings (retirement_age_years) first. The system does not guess it.', verified_service: svc, date_of_birth_recorded: !!e.date_of_birth });
  if (!e.date_of_birth) return res.json({ status: 'missing_data', message: 'Date of birth is not recorded', verified_service: svc });
  const dob = String(e.date_of_birth).slice(0, 10), exp = `${Number(dob.slice(0, 4)) + age}${dob.slice(4)}`, okSvc = !Number.isFinite(minSvc) || st.retirement_min_service_years === '' || svc.years >= minSvc;
  res.json({ status: H.today() >= exp && okSvc ? 'eligible_subject_to_confirmation' : 'not_yet_eligible', retirement_age_years: age, age_source: st.retirement_age_source || null, expected_retirement_date: exp, verified_service: svc, service_requirement_met: okSvc, note: 'Based on the configured parameters only; the authorized decision still decides.' });
}));

// ============================================================ dedicated lists for Permanent Employment and Retirement screens
// employees on probation, with the days left and any open appointment case
r.get('/probation', perm('cases.manage', 'cases.view'), wrap(async (req, res) => {
  const rows = (await q(`SELECT e.id,e.employee_no,e.full_name,e.hire_date,e.probation_end,d.name AS department,pos.title AS job_title,sp.position_no,
      (e.probation_end - CURRENT_DATE) AS days_left,
      (SELECT c.id FROM hr_cases c WHERE c.employee_id=e.id AND c.case_type='permanent_appointment' AND c.stage NOT IN ('completed','rejected','cancelled') ORDER BY c.id DESC LIMIT 1) AS open_case_id,
      (SELECT c.ref_no FROM hr_cases c WHERE c.employee_id=e.id AND c.case_type='permanent_appointment' AND c.stage NOT IN ('completed','rejected','cancelled') ORDER BY c.id DESC LIMIT 1) AS open_case_ref
    FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN staff_positions sp ON sp.id=e.staff_position_id
    WHERE e.employment_type='probation' AND e.status<>'terminated' ORDER BY e.probation_end NULLS LAST,e.full_name LIMIT 500`)).rows;
  res.json({ rows, note: 'The probation length is not built in; probation_end is entered per employee.' });
}));
// retirement forecast from the HR-configured age only (no age is built in)
r.get('/retirement/forecast', perm('cases.manage', 'cases.view'), wrap(async (req, res) => {
  const st = await H.settings(true), age = Number(st.retirement_age_years), minSvc = Number(st.retirement_min_service_years), horizon = Math.min(120, Math.max(1, U.int(req.query.months || 24, 'Months')));
  if (st.retirement_age_years === '' || !Number.isFinite(age) || age <= 0) return res.json({ status: 'configuration_required', message: 'The retirement age has not been configured. An authorized HR decision citing the governing law must be entered in Settings (retirement_age_years). The system does not guess it.', rows: [] });
  const today = H.today(), until = new Date(); until.setUTCMonth(until.getUTCMonth() + horizon); const lim = until.toISOString().slice(0, 10);
  const emps = (await q(`SELECT e.id,e.employee_no,e.full_name,e.date_of_birth,e.hire_date,e.termination_date,d.name AS department,pos.title AS job_title,
      (SELECT c.id FROM hr_cases c WHERE c.employee_id=e.id AND c.case_type='retirement' AND c.stage NOT IN ('completed','rejected','cancelled') ORDER BY c.id DESC LIMIT 1) AS open_case_id
    FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions pos ON pos.id=e.position_id WHERE e.status='active' AND e.date_of_birth IS NOT NULL`)).rows;
  const rows = []; let missingDob = Number((await q("SELECT count(*) FROM employees WHERE status='active' AND date_of_birth IS NULL")).rows[0].count);
  for (const e of emps) {
    const dob = String(e.date_of_birth).slice(0, 10), exp = `${Number(dob.slice(0, 4)) + age}${dob.slice(4)}`; if (exp > lim) continue;
    const svc = S.experience(e, (await q('SELECT start_date,end_date,verified,is_current_institution FROM service_periods WHERE employee_id=$1', [e.id])).rows, today).total_verified, okSvc = st.retirement_min_service_years === '' || !Number.isFinite(minSvc) || svc.years >= minSvc;
    rows.push({ id: e.id, employee_no: e.employee_no, full_name: e.full_name, department: e.department, job_title: e.job_title, expected_retirement_date: exp, already_reached: exp <= today, service_years: svc.years, service_requirement_met: okSvc, open_case_id: e.open_case_id });
  }
  rows.sort((a, b) => a.expected_retirement_date.localeCompare(b.expected_retirement_date));
  res.json({ status: 'ok', retirement_age_years: age, age_source: st.retirement_age_source || null, horizon_months: horizon, employees_without_date_of_birth: missingDob, rows, note: 'Forecast only. Eligibility is decided by the authorized decision; service counts verified periods plus the current institution.' });
}));

// ============================================================ module 9: uniforms and work equipment
const fiscalYear = (d = H.today()) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return m >= 7 ? y : y - 1; };   // placeholder: a July-June year is only a display default; HR may pass fiscal_year explicitly
r.get('/ppe/items', perm('ppe.manage', 'reports.view'), wrap(async (req, res) => res.json((await q("SELECT i.*,COALESCE((SELECT sum(qty) FROM ppe_stock_moves m WHERE m.item_id=i.id),0)::int AS stock FROM ppe_items i ORDER BY i.category NULLS LAST,i.code,i.name_en")).rows)));
const price = (v) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw bad('Value is out of range'); return n; };
const PPE_CATS = ['fabric', 'clothing', 'protective_clothing', 'ceremonial', 'footwear', 'protective_equipment', 'fire_fighting', 'tools'];
r.post('/ppe/items', perm('ppe.manage'), wrap(async (req, res) => { const b = req.body, row = (await q('INSERT INTO ppe_items(code,name_am,name_en,kind,unit,immediate_eligibility,category,note,unit_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [U.str(b.code, { req: true, max: 30, name: 'Code' }), U.str(b.name_am, { max: 150 }), U.str(b.name_en, { req: true, max: 150, name: 'Name' }), U.oneOf(b.kind, ['clothing', 'footwear', 'equipment'], 'Kind'), U.oneOf(b.unit || 'piece', ['piece', 'pair', 'metre'], 'Unit'), !!b.immediate_eligibility, b.category ? U.oneOf(b.category, PPE_CATS, 'Category') : null, U.str(b.note, { max: 500 }), price(b.unit_price)])).rows[0]; audit(req, 'create', 'ppe_items', row.id); res.status(201).json(row); }));
r.post('/ppe/items/:id/price', perm('ppe.manage'), wrap(async (req, res) => { const row = U.needRow((await q('UPDATE ppe_items SET unit_price=$2 WHERE id=$1 RETURNING id,unit_price', [Number(req.params.id) || 0, price(req.body.unit_price)])).rows[0], 'Item'); audit(req, 'update', 'ppe_items', row.id, 'unit_price=' + row.unit_price); res.json(row); }));
r.get('/ppe/entitlements', perm('ppe.manage'), wrap(async (req, res) => res.json((await q('SELECT n.*,i.name_en,i.name_am,i.kind FROM ppe_entitlements n JOIN ppe_items i ON i.id=n.item_id ORDER BY n.group_no NULLS LAST,n.job_title_pattern,i.category NULLS LAST,i.code')).rows)));
r.post('/ppe/entitlements', perm('ppe.manage'), wrap(async (req, res) => { const b = req.body, row = (await q('INSERT INTO ppe_entitlements(job_title_pattern,item_id,quantity,per_months,source_ref,verified) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [U.str(b.job_title_pattern, { req: true, max: 150, name: 'Job title' }), U.int(b.item_id, 'Item', true), U.int(b.quantity, 'Quantity', true), U.int(b.per_months, 'Period'), U.str(b.source_ref, { req: true, max: 300, name: 'Source (directive article / annex page)' }), !!b.verified])).rows[0]; audit(req, 'create', 'ppe_entitlements', row.id); res.status(201).json(row); }));
r.put('/ppe/entitlements/:id', perm('ppe.manage'), wrap(async (req, res) => { const row = U.needRow((await q('UPDATE ppe_entitlements SET quantity=COALESCE($2,quantity),per_months=$3,verified=COALESCE($4,verified),active=COALESCE($5,active),source_ref=COALESCE($6,source_ref) WHERE id=$1 RETURNING *', [Number(req.params.id) || 0, U.int(req.body.quantity, 'Quantity'), U.int(req.body.per_months, 'Period'), req.body.verified === undefined ? null : !!req.body.verified, req.body.active === undefined ? null : !!req.body.active, U.str(req.body.source_ref, { max: 300 })])).rows[0], 'Entitlement'); audit(req, 'update', 'ppe_entitlements', row.id); res.json(row); }));
// bulk load of the annex table (all-or-nothing). Rows arrive unverified; a row that HR already verified is never overwritten.
r.post('/ppe/entitlements/import', perm('ppe.manage'), wrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []; if (!rows.length) throw bad('There are no rows to import'); if (rows.length > 500) throw bad('Import at most 500 rows at a time');
  const out = await tx(async (t) => {
    const items = Object.fromEntries((await t.query('SELECT id,code FROM ppe_items')).rows.map((i) => [i.code.toLowerCase(), i.id])), errors = []; let added = 0, updated = 0, kept = 0;
    for (const [i, r0] of rows.entries()) {
      const n = i + 1, title = String(r0.job_title_pattern || '').trim(), code = String(r0.item_code || '').trim().toLowerCase(), qty = Number(r0.quantity), per = r0.per_months === '' || r0.per_months == null ? null : Number(r0.per_months), src = String(r0.source_ref || '').trim();
      if (!title || title.length > 150) errors.push(`Row ${n}: job title is missing or too long`); else if (!items[code]) errors.push(`Row ${n}: unknown item code "${String(r0.item_code || '').slice(0, 30)}"`); else if (!Number.isInteger(qty) || qty <= 0) errors.push(`Row ${n}: quantity must be a whole number above zero`); else if (per !== null && (!Number.isInteger(per) || per <= 0)) errors.push(`Row ${n}: period must be a whole number of months`); else if (!src) errors.push(`Row ${n}: the source (directive article / annex page) is required`);
      else {
        const cur = (await t.query('SELECT id,verified FROM ppe_entitlements WHERE job_title_pattern=$1 AND item_id=$2', [title, items[code]])).rows[0];
        if (!cur) { await t.query('INSERT INTO ppe_entitlements(job_title_pattern,item_id,quantity,per_months,source_ref,verified) VALUES($1,$2,$3,$4,$5,false)', [title, items[code], qty, per, src.slice(0, 300)]); added++; }
        else if (cur.verified) kept++; else { await t.query('UPDATE ppe_entitlements SET quantity=$2,per_months=$3,source_ref=$4 WHERE id=$1', [cur.id, qty, per, src.slice(0, 300)]); updated++; }
      }
    }
    if (errors.length) { const e = bad('The import was refused: ' + errors.slice(0, 5).join('; ') + (errors.length > 5 ? ` (and ${errors.length - 5} more)` : '')); e.status = 400; throw e; }
    return { added, updated, kept_verified: kept };
  });
  audit(req, 'import', 'ppe_entitlements', null, JSON.stringify(out)); res.status(201).json(out);
}));
// who is eligible for what, for the chosen budget year (job categories come from the entitlements HR entered)
r.get('/ppe/eligible-employees', perm('ppe.manage'), wrap(async (req, res) => {
  await PM.autoMap({ query: q });
  const fy = U.int(req.query.fiscal_year || fiscalYear(), 'Fiscal year'), st = await H.settings(true), wait = Number(st.ppe_wait_months);
  const rows = (await q(`SELECT e.id,e.employee_no,e.full_name,d.name AS department,COALESCE(pos.title,e.jeg_title) AS job_title,e.hire_date,
      count(DISTINCT n.id)::int AS approved_items, COALESCE(sum(n.quantity),0)::int AS approved_qty,
      COALESCE((SELECT sum(x.quantity) FROM ppe_issues x WHERE x.employee_id=e.id AND x.fiscal_year=$1 AND x.returned_on IS NULL),0)::int AS issued_qty,
      bool_or(i.immediate_eligibility) AS has_immediate
    FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id JOIN ppe_entitlements n ON n.active AND (COALESCE(pos.title,e.jeg_title) ILIKE n.job_title_pattern OR EXISTS (SELECT 1 FROM ppe_title_map m WHERE m.active AND m.college_title=COALESCE(pos.title,e.jeg_title) AND m.annex_pattern=n.job_title_pattern)) JOIN ppe_items i ON i.id=n.item_id AND (i.applies_to_sex IS NULL OR i.applies_to_sex=e.sex)
    LEFT JOIN departments d ON d.id=e.department_id WHERE e.status<>'terminated' GROUP BY e.id,d.name,pos.title,e.jeg_title ORDER BY d.name NULLS LAST,e.full_name LIMIT 1000`, [fy])).rows, today = H.today();
  res.json({ fiscal_year: fy, wait_months: wait, rows: rows.map((r) => { const months = (new Date(today) - new Date(String(r.hire_date).slice(0, 10))) / (30.4375 * 86400000); return { ...r, remaining_qty: Math.max(0, r.approved_qty - r.issued_qty), waiting_period_complete: r.has_immediate || !Number.isFinite(wait) || months >= wait }; }) });
}));
r.post('/ppe/stock', perm('ppe.manage'), wrap(async (req, res) => {
  const b = req.body, mt = U.oneOf(b.move_type, ['receive', 'adjust', 'return'], 'Movement'), n = U.int(b.qty, 'Quantity', true); if (mt !== 'adjust' && n <= 0) throw bad('Quantity must be positive'); if (n === 0) throw bad('Quantity cannot be zero');
  const row = (await q('INSERT INTO ppe_stock_moves(item_id,move_type,qty,ref,note,by_user) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [U.int(b.item_id, 'Item', true), mt, n, U.str(b.ref, { max: 100 }), U.str(b.note, { max: 300 }), req.user.id])).rows[0]; audit(req, 'stock', 'ppe_stock_moves', row.id, `${mt} ${n}`); res.status(201).json(row);
}));
// what an employee may receive now: entitlement by job title, waiting period, and what was already issued this budget year
async function eligibility(c, empId, fy) {
  const st = await H.settings(true), wait = Number(st.ppe_wait_months), e = U.needRow((await c.query("SELECT e.id,e.full_name,e.employee_no,e.sex,e.hire_date,e.status,e.employment_type,COALESCE(pos.title,e.jeg_title) AS title,(SELECT max(h.effective_date) FROM employee_history h WHERE h.employee_id=e.id AND h.kind IN ('transfer','promotion','hired')) AS assigned_from FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id WHERE e.id=$1", [empId])).rows[0], 'Employee');
  await PM.ensureTitle(c, e.title);   // a title that is safely the same occupation as one of the directive is linked automatically
  // How much of an entitlement is still available:
  //  - per_months set  -> counted over the last N months ("one every 3 years" = 36 months)
  //  - per_months null -> counted inside the budget year (an unissued quantity does not carry over, Art. 7(10))
  //  - first_issue_quantity -> the allowance for a year in which the employee has never been issued this item in an EARLIER year ("first year two, then one each year")
  const rows = (await c.query(`SELECT n.*,i.name_en,i.name_am,i.category,i.immediate_eligibility,
      COALESCE((SELECT sum(x.quantity) FROM ppe_issues x WHERE x.employee_id=$1 AND x.item_id=n.item_id AND x.returned_on IS NULL AND (CASE WHEN n.per_months IS NOT NULL THEN x.issued_on > (CURRENT_DATE - (n.per_months || ' months')::interval) ELSE x.fiscal_year=$3 END)),0)::int AS issued,
      NOT EXISTS (SELECT 1 FROM ppe_issues x WHERE x.employee_id=$1 AND x.item_id=n.item_id AND x.fiscal_year < $3) AS first_period
    FROM ppe_entitlements n JOIN ppe_items i ON i.id=n.item_id WHERE n.active AND (i.applies_to_sex IS NULL OR i.applies_to_sex=$4) AND ($2 ILIKE n.job_title_pattern OR EXISTS (SELECT 1 FROM ppe_title_map m WHERE m.active AND m.college_title=$2 AND m.annex_pattern=n.job_title_pattern)) ORDER BY i.category NULLS LAST,i.name_am`, [empId, e.title || '', fy, e.sex])).rows;
  const since = String(e.assigned_from || e.hire_date).slice(0, 10), months = (new Date(H.today()) - new Date(since)) / (30.4375 * 86400000);
  return { employee: e, job_title: e.title, has_mapping: rows.length > 0, wait_months: wait, since, months_in_position: Math.floor(months), items: rows.map((n) => { const waitOk = n.immediate || n.immediate_eligibility || !Number.isFinite(wait) || months >= wait, cap = n.per_months == null && n.first_issue_quantity && n.first_period ? n.first_issue_quantity : n.quantity, left = Math.max(0, cap - n.issued); return { ...n, cap, remaining: left, eligible: e.status !== 'terminated' && waitOk && left > 0, wait_ok: waitOk, reason: e.status === 'terminated' ? 'former employee' : !waitOk ? `waiting period (${wait} months) not yet completed` : left === 0 ? (n.per_months != null ? `the approved quantity was already issued within the last ${n.per_months} months` : 'full quantity already issued this budget year (an unissued quantity does not carry over)') : null }; }) };
}
// ---- job-title mapping: which of the college's job titles are the occupations the directive gives entitlements to (HR only)
const mapView = async (c) => {
  const rows = await PM.plan(c), E = (st) => rows.filter((r) => st.includes(r.status)), sum = (l) => l.reduce((a, r) => a + r.employees, 0);
  const items = (await c.query("SELECT job_title_pattern AS pattern, count(*)::int AS items, COALESCE(sum(quantity),0)::int AS quantity FROM ppe_entitlements WHERE active GROUP BY 1")).rows, by = Object.fromEntries(items.map((x) => [x.pattern, x]));
  const out = rows.map((r) => ({ ...r, status: ['direct', 'mapped', 'automatic'].includes(r.status) ? 'matched' : r.status, items: (r.matches || []).reduce((a, m) => a + ((by[m.pattern] || {}).items || 0), 0) }));
  return { summary: { employees: sum(rows), matched: sum(E(['direct', 'mapped', 'automatic'])), review: sum(E(['review', 'ambiguous'])), titles: rows.length, titles_matched: E(['direct', 'mapped', 'automatic']).length, titles_review: E(['review', 'ambiguous']).length }, rows: out };
};
r.get('/ppe/title-map', perm('ppe.manage'), wrap(async (req, res) => res.json({ ...(await mapView({ query: q })), annex: await PM.annexTitles({ query: q }), runs: (await q('SELECT r.*,u.name AS by_name FROM ppe_mapping_runs r LEFT JOIN users u ON u.id=r.run_by ORDER BY r.id DESC LIMIT 10')).rows })));
r.post('/ppe/title-map/run', perm('ppe.manage'), wrap(async (req, res) => {   // links every safe match, records the numbers; running it again changes nothing
  const out = await tx(async (t) => { const added = await PM.autoMap(t, req.user.id), v = await mapView(t); await t.query('INSERT INTO ppe_mapping_runs(run_by,employees,matched,review,titles,titles_matched,titles_review,links_added) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [req.user.id, v.summary.employees, v.summary.matched, v.summary.review, v.summary.titles, v.summary.titles_matched, v.summary.titles_review, added]); return { ...v, links_added: added }; });
  audit(req, 'ppe_title_map_run', 'ppe_title_map', null, `matched ${out.summary.matched}/${out.summary.employees}, links added ${out.links_added}`); res.json({ summary: out.summary, links_added: out.links_added });
}));
r.post('/ppe/title-map', perm('ppe.manage'), wrap(async (req, res) => {   // HR confirms that a college title is the same occupation as one in the directive
  const b = req.body, title = U.str(b.college_title, { req: true, max: 300, name: 'Job title' }), pat = U.str(b.annex_pattern, { req: true, max: 300, name: 'Occupation in the directive' }), note = U.str(b.note, { req: true, max: 300, name: 'Reason' });
  U.needRow((await q("SELECT 1 FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id WHERE COALESCE(pos.title,e.jeg_title)=$1 LIMIT 1", [title])).rows[0], 'Job title');
  const g = U.needRow((await q('SELECT min(group_no) AS g FROM ppe_entitlements WHERE active AND job_title_pattern=$1 HAVING count(*)>0', [pat])).rows[0], 'Occupation in the directive');
  const row = (await q("INSERT INTO ppe_title_map(college_title,annex_pattern,group_no,basis,note,created_by) VALUES($1,$2,$3,'hr_confirmed',$4,$5) ON CONFLICT (college_title,annex_pattern) DO UPDATE SET active=TRUE,basis='hr_confirmed',note=EXCLUDED.note,created_by=EXCLUDED.created_by,deactivated_at=NULL,deactivated_by=NULL RETURNING *", [title, pat, g.g, note, req.user.id])).rows[0];
  audit(req, 'confirm', 'ppe_title_map', row.id, `${title} -> ${pat}`); res.status(201).json(row);
}));
r.delete('/ppe/title-map/:id', perm('ppe.manage'), wrap(async (req, res) => {   // switched off, never deleted; the automatic process does not bring it back
  const row = U.needRow((await q('UPDATE ppe_title_map SET active=FALSE,deactivated_by=$2,deactivated_at=now() WHERE id=$1 AND active RETURNING id', [Number(req.params.id) || 0, req.user.id])).rows[0], 'Mapping'); audit(req, 'update', 'ppe_title_map', row.id, 'switched off'); res.json({ ok: true });
}));
r.get('/ppe/title-map/report', perm('ppe.manage'), wrap(async (req, res) => {   // employee-level lists for HR: matched (with their entitlement) and to be reviewed
  await PM.autoMap({ query: q }); const v = await mapView({ query: q }), byTitle = Object.fromEntries(v.rows.map((r) => [r.title, r]));
  const emps = (await q("SELECT e.id,e.employee_no,e.full_name,e.sex,d.name AS department,COALESCE(pos.title,e.jeg_title) AS job_title FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN departments d ON d.id=e.department_id WHERE e.status<>'terminated' ORDER BY e.employee_no")).rows;
  const ent = (await q("SELECT n.job_title_pattern AS pattern, i.applies_to_sex AS sx, count(*)::int AS items FROM ppe_entitlements n JOIN ppe_items i ON i.id=n.item_id WHERE n.active GROUP BY 1,2")).rows, itemsFor = (pats, sex) => ent.filter((x) => pats.includes(x.pattern) && (!x.sx || x.sx === sex)).reduce((a, x) => a + x.items, 0);
  const matched = [], review = []; for (const e of emps) { const t = byTitle[e.job_title]; if (t && t.status === 'matched') matched.push({ ...e, annex_title: t.matches.map((m) => m.pattern).join(' ; '), group_no: t.matches[0] ? t.matches[0].group_no ?? null : null, basis: t.matches[0] ? t.matches[0].basis : null, items: itemsFor(t.matches.length ? t.matches.map((m) => m.pattern) : [e.job_title], e.sex) }); else review.push({ ...e, reason: !e.job_title ? 'no job title' : t && t.status === 'ambiguous' ? 'matches occupations of different groups' : 'no occupation of this title in Directive 173/2018', suggestions: t && t.suggestions ? t.suggestions.map((s) => s.pattern).join(' ; ') : '' }); }
  audit(req, 'download', 'ppe_title_map', null, 'mapping report'); res.json({ summary: v.summary, matched, review });
}));
r.get('/ppe/eligibility/:empId', perm('ppe.manage'), wrap(async (req, res) => res.json(await eligibility({ query: q }, Number(req.params.empId) || 0, U.int(req.query.fiscal_year || fiscalYear(), 'Fiscal year')))));
r.post('/ppe/issues', perm('ppe.manage'), wrap(async (req, res) => {
  const b = req.body, empId = U.int(b.employee_id, 'Employee', true), itemId = U.int(b.item_id, 'Item', true), qty = U.int(b.quantity, 'Quantity', true), fy = U.int(b.fiscal_year || fiscalYear(), 'Fiscal year');
  if (qty <= 0) throw bad('Quantity must be positive');
  const row = await tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock($1,$2)', [7001, empId]);
    const el = await eligibility(t, empId, fy), it = el.items.find((x) => x.item_id === itemId), repl = !!b.replacement;
    if (!it) throw bad(el.has_mapping ? 'This item is not approved for the employee\'s job title (no entitlement is configured)' : 'No entitlement exists for this job title in Directive 173/2018 - HR must review the job title', 409);   // never an exception: an item outside the entitlement is not issued
    if (el.employee.status === 'terminated') throw bad('Former employees cannot be issued items', 409);
    let xr = null, xf = null;
    if (!repl) {
      const early = !it.wait_ok, over = qty > it.remaining;
      if (early || over) {   // beyond the authorized quantity or before the waiting period: only with an exception the HR Manager authorizes and documents
        if (!b.exception) throw bad(early ? `The waiting period (${el.wait_months} months) has not been completed` : `Only ${it.remaining} more may be issued this budget year`, 409);
        if (!has(req, 'ppe.exception')) throw bad('Only the HR Manager can authorize an issue beyond the entitlement', 403);
        xr = U.str(b.exception_reason, { req: true, max: 300, name: 'Reason for the exception' }); xf = U.str(b.exception_ref, { req: true, max: 200, name: 'Reference of the authorization' });
      }
    } else if (!U.str(b.replacement_reason, { max: 300 })) throw bad('A replacement needs a reason');
    const stock = Number((await t.query('SELECT COALESCE(sum(qty),0) AS s FROM ppe_stock_moves WHERE item_id=$1', [itemId])).rows[0].s); if (stock < qty) throw bad(`Not enough stock (${stock} available)`, 409);
    const iss = (await t.query('INSERT INTO ppe_issues(employee_id,item_id,quantity,fiscal_year,issued_on,issued_by,entitlement_id,replacement,replacement_reason,condition_note,job_title_at_issue,authorized_quantity,exception_reason,exception_ref,exception_by) VALUES($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *', [empId, itemId, qty, fy, day(b.issued_on, 'Issue date'), req.user.id, it.id, repl, U.str(b.replacement_reason, { max: 300 }), U.str(b.condition_note, { max: 300 }), el.job_title, it.cap, xr, xf, xr ? req.user.id : null])).rows[0];
    await t.query("INSERT INTO ppe_stock_moves(item_id,move_type,qty,ref,by_user) VALUES($1,'issue',$2,$3,$4)", [itemId, -qty, 'issue #' + iss.id, req.user.id]); return iss;
  });
  audit(req, row.exception_reason ? 'issue_exception' : 'issue', 'ppe_issues', row.id, `emp ${empId} item ${itemId} x${qty}${row.exception_reason ? ' EXCEPTION ' + row.exception_ref : ''}`); res.status(201).json(row);
}));
r.get('/ppe/issues', perm('ppe.manage'), wrap(async (req, res) => {
  const p = [], w = []; if (req.query.employee_id) w.push(`s.employee_id=$${p.push(U.int(req.query.employee_id, 'Employee'))}`); if (req.query.fiscal_year) w.push(`s.fiscal_year=$${p.push(U.int(req.query.fiscal_year, 'Fiscal year'))}`);
  res.json((await q(`SELECT s.*,e.full_name,e.employee_no,d.name AS department,i.name_en,i.name_am,u.name AS issued_by_name FROM ppe_issues s JOIN employees e ON e.id=s.employee_id JOIN ppe_items i ON i.id=s.item_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users u ON u.id=s.issued_by ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY s.issued_on DESC,s.id DESC LIMIT 500`, p)).rows);
}));
r.get('/ppe/mine', perm(), wrap(async (req, res) => res.json(req.user.employee_id ? (await q('SELECT s.id,s.quantity,s.fiscal_year,s.issued_on,s.acknowledged_at,s.returned_on,i.name_en,i.name_am FROM ppe_issues s JOIN ppe_items i ON i.id=s.item_id WHERE s.employee_id=$1 ORDER BY s.issued_on DESC', [req.user.employee_id])).rows : [])));
r.post('/ppe/issues/:id/acknowledge', perm(), wrap(async (req, res) => {   // only the employee who received the item can acknowledge it
  const row = U.needRow((await q('UPDATE ppe_issues SET acknowledged_at=now(),acknowledged_by=$2 WHERE id=$1 AND employee_id=$3 AND acknowledged_at IS NULL RETURNING id', [Number(req.params.id) || 0, req.user.id, req.user.employee_id ?? 0])).rows[0], 'Issue awaiting your acknowledgment'); audit(req, 'acknowledge', 'ppe_issues', row.id); res.json({ ok: true });
}));
r.post('/ppe/issues/:id/return', perm('ppe.manage'), wrap(async (req, res) => {
  const row = await tx(async (t) => { const cur = U.needRow((await t.query('SELECT * FROM ppe_issues WHERE id=$1 FOR UPDATE', [Number(req.params.id) || 0])).rows[0], 'Issue'); if (cur.returned_on) throw bad('Already returned', 409);
    const u = (await t.query('UPDATE ppe_issues SET returned_on=COALESCE($2,CURRENT_DATE),return_condition=$3 WHERE id=$1 RETURNING *', [cur.id, day(req.body.returned_on, 'Return date'), U.str(req.body.return_condition, { max: 300 })])).rows[0];
    if (req.body.restock) await t.query("INSERT INTO ppe_stock_moves(item_id,move_type,qty,ref,by_user) VALUES($1,'return',$2,$3,$4)", [cur.item_id, cur.quantity, 'return #' + cur.id, req.user.id]); return u; });
  audit(req, 'return', 'ppe_issues', row.id); res.json(row);
}));
r.get('/ppe/report', perm('ppe.manage'), wrap(async (req, res) => {
  const fy = U.int(req.query.fiscal_year || fiscalYear(), 'Fiscal year');
  res.json({ fiscal_year: fy, stock: (await q("SELECT i.id,i.name_en,i.name_am,i.unit_price,COALESCE(sum(m.qty),0)::int AS balance,(i.unit_price*COALESCE(sum(m.qty),0))::numeric(14,2) AS value FROM ppe_items i LEFT JOIN ppe_stock_moves m ON m.item_id=i.id GROUP BY i.id ORDER BY i.name_en")).rows,
    by_department: (await q('SELECT d.name AS department,i.name_en,i.unit_price,sum(s.quantity)::int AS issued,(i.unit_price*sum(s.quantity))::numeric(14,2) AS cost,count(DISTINCT s.employee_id)::int AS employees FROM ppe_issues s JOIN employees e ON e.id=s.employee_id JOIN ppe_items i ON i.id=s.item_id LEFT JOIN departments d ON d.id=e.department_id WHERE s.fiscal_year=$1 GROUP BY d.name,i.name_en,i.unit_price ORDER BY d.name,i.name_en', [fy])).rows,
    unacknowledged: Number((await q('SELECT count(*) FROM ppe_issues WHERE fiscal_year=$1 AND acknowledged_at IS NULL', [fy])).rows[0].count) });
}));

// ============================================================ module 11: continuous annual HR plan
const PCAT = ['recruitment', 'training', 'succession', 'promotion_transfer', 'retirement_forecast', 'leave_coverage', 'other'];
r.get('/hr-plans', perm('plans.manage', 'plans.approve', 'reports.view'), wrap(async (req, res) => res.json((await q('SELECT p.*,(SELECT count(*) FROM hr_plan_items i WHERE i.plan_id=p.id)::int AS items FROM hr_plans p ORDER BY fiscal_year DESC,id DESC')).rows)));
r.get('/hr-plans/:id', perm('plans.manage', 'plans.approve', 'reports.view'), wrap(async (req, res) => {
  const p = U.needRow((await q('SELECT * FROM hr_plans WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Plan');
  const items = (await q(`SELECT i.*,d.name AS department,e.full_name AS responsible,COALESCE((SELECT sum(achieved) FROM hr_plan_progress g WHERE g.item_id=i.id),0) AS achieved_total FROM hr_plan_items i LEFT JOIN departments d ON d.id=i.responsible_department_id LEFT JOIN employees e ON e.id=i.responsible_employee_id WHERE i.plan_id=$1 ORDER BY i.id`, [p.id])).rows;
  const prog = (await q('SELECT g.*,u.name AS by_name FROM hr_plan_progress g JOIN hr_plan_items i ON i.id=g.item_id LEFT JOIN users u ON u.id=g.reported_by WHERE i.plan_id=$1 ORDER BY g.period,g.id', [p.id])).rows;
  res.json({ ...p, items: items.map((i) => ({ ...i, pct: i.target > 0 ? Math.min(100, Math.round((Number(i.achieved_total) / Number(i.target)) * 100)) : null })), progress: prog });
}));
r.post('/hr-plans', perm('plans.manage'), wrap(async (req, res) => { const b = req.body, row = (await q('INSERT INTO hr_plans(fiscal_year,title,objectives,institutional_goals,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [U.int(b.fiscal_year, 'Fiscal year', true), U.str(b.title, { req: true, max: 200, name: 'Title' }), U.str(b.objectives, { max: 4000 }), U.str(b.institutional_goals, { max: 4000 }), req.user.id])).rows[0]; audit(req, 'create', 'hr_plans', row.id); res.status(201).json(row); }));
const editable = async (id) => { const p = U.needRow((await q('SELECT * FROM hr_plans WHERE id=$1', [Number(id) || 0])).rows[0], 'Plan'); if (!['draft', 'review'].includes(p.status)) throw bad('An approved plan can no longer be changed (use progress reports)', 409); return p; };
r.put('/hr-plans/:id', perm('plans.manage'), wrap(async (req, res) => { const p = await editable(req.params.id); const b = req.body, row = (await q('UPDATE hr_plans SET title=COALESCE($2,title),objectives=COALESCE($3,objectives),institutional_goals=COALESCE($4,institutional_goals) WHERE id=$1 RETURNING *', [p.id, U.str(b.title, { max: 200 }), U.str(b.objectives, { max: 4000 }), U.str(b.institutional_goals, { max: 4000 })])).rows[0]; audit(req, 'update', 'hr_plans', p.id); res.json(row); }));
r.post('/hr-plans/:id/items', perm('plans.manage'), wrap(async (req, res) => {
  const p = await editable(req.params.id), b = req.body, o = [p.id, U.oneOf(b.category, PCAT, 'Category'), U.str(b.description, { req: true, max: 1000, name: 'Description' }), U.int(b.responsible_department_id, 'Department'), U.int(b.responsible_employee_id, 'Employee'), day(b.planned_start, 'Start'), day(b.planned_end, 'End'), U.str(b.indicator, { max: 300 }), b.target === '' || b.target == null ? null : Number(b.target), U.money(b.budget, 'Budget')];
  if (o[5] && o[6] && o[6] < o[5]) throw bad('The end date is before the start date'); if (o[8] != null && !(o[8] >= 0)) throw bad('Target must be a number');
  const row = (await q('INSERT INTO hr_plan_items(plan_id,category,description,responsible_department_id,responsible_employee_id,planned_start,planned_end,indicator,target,budget) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', o)).rows[0]; audit(req, 'create', 'hr_plan_items', row.id); res.status(201).json(row);
}));
r.delete('/hr-plans/:id/items/:itemId', perm('plans.manage'), wrap(async (req, res) => { const p = await editable(req.params.id); await q('DELETE FROM hr_plan_items WHERE id=$1 AND plan_id=$2', [Number(req.params.itemId) || 0, p.id]); audit(req, 'delete', 'hr_plan_items', req.params.itemId); res.sendStatus(204); }));
const FLOW = { submit_review: ['draft', 'review', 'plans.manage'], approve: ['review', 'approved', 'plans.approve'], start: ['approved', 'implementing', 'plans.manage'], evaluate: ['implementing', 'evaluated', 'plans.manage'], reject: ['review', 'draft', 'plans.approve'] };
r.post('/hr-plans/:id/:step', perm('plans.manage', 'plans.approve'), wrap(async (req, res, next) => {
  const f = FLOW[req.params.step]; if (!f) return next();   // 'progress' is handled by the route below if (!has(req, f[2])) throw bad('You do not have permission for this step', 403);
  const row = await tx(async (t) => {
    const p = U.needRow((await t.query('SELECT * FROM hr_plans WHERE id=$1 FOR UPDATE', [Number(req.params.id) || 0])).rows[0], 'Plan'); if (p.status !== f[0]) throw bad(`The plan is ${p.status}; this step needs ${f[0]}`, 409);
    if (req.params.step === 'submit_review' && !(await t.query('SELECT 1 FROM hr_plan_items WHERE plan_id=$1', [p.id])).rows[0]) throw bad('Add at least one activity first');
    if (req.params.step === 'approve') { if (p.created_by === req.user.id) throw bad('The person who prepared the plan cannot approve it', 403); return (await t.query("UPDATE hr_plans SET status='approved',approved_by=$2,approved_at=now(),approved_budget=$3 WHERE id=$1 RETURNING *", [p.id, req.user.id, U.money(req.body.approved_budget, 'Approved budget')])).rows[0]; }
    if (req.params.step === 'evaluate') { const ev = U.str(req.body.year_end_evaluation, { req: true, max: 4000, name: 'Year-end evaluation' }), pct = req.body.achievement_pct; if (pct == null || !(Number(pct) >= 0 && Number(pct) <= 100)) throw bad('Achievement must be 0-100'); return (await t.query("UPDATE hr_plans SET status='evaluated',year_end_evaluation=$2,achievement_pct=$3 WHERE id=$1 RETURNING *", [p.id, ev, Number(pct)])).rows[0]; }
    return (await t.query('UPDATE hr_plans SET status=$2 WHERE id=$1 RETURNING *', [p.id, f[1]])).rows[0];
  });
  audit(req, req.params.step, 'hr_plans', row.id); res.json(row);
}));
r.post('/hr-plans/:id/progress', perm('plans.manage'), wrap(async (req, res) => {   // monthly / quarterly update; allowed while the plan is being implemented
  const p = U.needRow((await q('SELECT * FROM hr_plans WHERE id=$1', [Number(req.params.id) || 0])).rows[0], 'Plan'); if (!['approved', 'implementing'].includes(p.status)) throw bad('Progress can be reported once the plan is approved', 409);
  const b = req.body, it = U.needRow((await q('SELECT id FROM hr_plan_items WHERE id=$1 AND plan_id=$2', [U.int(b.item_id, 'Activity', true), p.id])).rows[0], 'Activity'), period = U.str(b.period, { req: true, max: 20, name: 'Period' }); if (!/^\d{4}-(Q[1-4]|M(0[1-9]|1[0-2]))$/.test(period)) throw bad('Period must look like 2019-Q1 or 2019-M03');
  const row = (await q('INSERT INTO hr_plan_progress(item_id,period,achieved,note,challenges,corrective_action,evidence,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (item_id,period) DO UPDATE SET achieved=$3,note=$4,challenges=$5,corrective_action=$6,evidence=$7,reported_by=$8,at=now() RETURNING *', [it.id, period, b.achieved === '' || b.achieved == null ? null : Number(b.achieved), U.str(b.note, { max: 1000 }), U.str(b.challenges, { max: 1000 }), U.str(b.corrective_action, { max: 1000 }), U.str(b.evidence, { max: 500 }), req.user.id])).rows[0];
  if (p.status === 'approved') await q("UPDATE hr_plans SET status='implementing' WHERE id=$1", [p.id]); audit(req, 'progress', 'hr_plan_progress', row.id, period); res.json(row);
}));

// ============================================================ workflow configuration (approval authority, discipline sanctions)
r.get('/case-rules', perm('cases.manage', 'config.manage'), wrap(async (req, res) => res.json({ rules: (await q('SELECT * FROM case_approval_rules ORDER BY case_type')).rows, authorities: (await q('SELECT permission,name_en,name_am,is_hr,active FROM approval_authorities ORDER BY sort')).rows, sanctions: (await q('SELECT * FROM discipline_sanctions ORDER BY code')).rows })));
r.put('/case-rules/:type', perm('config.manage', 'cases.authorize'), wrap(async (req, res) => {   // the deciding authority is fixed: the HR department. Only whether a recommendation step is required can still be set
  const b = req.body, type = String(req.params.type); U.needRow((await q('SELECT 1 FROM case_approval_rules WHERE case_type=$1', [type])).rows[0], 'Case type');
  if (b.approver_permission !== undefined && b.approver_permission !== 'cases.decide_hr') throw bad('These cases are decided exclusively by the HR department');
  if (b.verified === false) throw bad('The HR authority is confirmed and cannot be withdrawn');
  const row = (await q('UPDATE case_approval_rules SET requires_recommendation=COALESCE($2,requires_recommendation) WHERE case_type=$1 RETURNING *', [type, b.requires_recommendation === undefined ? null : !!b.requires_recommendation])).rows[0];
  audit(req, 'update', 'case_approval_rules', row.case_type, `recommendation_required=${row.requires_recommendation}`); res.json(row);
}));
r.post('/discipline-sanctions', perm('config.manage'), wrap(async (req, res) => { const b = req.body, row = (await q('INSERT INTO discipline_sanctions(code,name,source_ref) VALUES($1,$2,$3) RETURNING *', [U.str(b.code, { req: true, max: 40, name: 'Code' }), U.str(b.name, { req: true, max: 200, name: 'Name' }), U.str(b.source_ref, { req: true, max: 300, name: 'Source (the rule that provides this sanction)' })])).rows[0]; audit(req, 'create', 'discipline_sanctions', row.id); res.status(201).json(row); }));
module.exports = r;
