const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr');
const r = express.Router();
const bands = (s) => (s >= 4.5 ? 'Outstanding' : s >= 3.5 ? 'Exceeds expectations' : s >= 2.5 ? 'Meets expectations' : s >= 1.5 ? 'Needs improvement' : 'Unsatisfactory');

r.get('/appraisal-criteria', perm(), wrap(async (req, res) => res.json((await q('SELECT * FROM appraisal_criteria ORDER BY active DESC,id')).rows)));
r.post('/appraisal-criteria', perm('performance.manage'), wrap(async (req, res) => { const row = (await q('INSERT INTO appraisal_criteria(name,weight) VALUES($1,$2) RETURNING *', [U.str(req.body.name, { req: true, max: 100, name: 'Name' }), U.int(req.body.weight, 'Weight', true)])).rows[0]; audit(req, 'create', 'appraisal_criteria', row.id); res.status(201).json(row); }));
r.put('/appraisal-criteria/:id', perm('performance.manage'), wrap(async (req, res) => { const row = U.needRow((await q('UPDATE appraisal_criteria SET name=$2,weight=$3,active=$4 WHERE id=$1 RETURNING *', [Number(req.params.id) || 0, U.str(req.body.name, { req: true, max: 100, name: 'Name' }), U.int(req.body.weight, 'Weight', true), req.body.active === undefined ? true : !!req.body.active])).rows[0], 'Criterion'); audit(req, 'update', 'appraisal_criteria', row.id); res.json(row); }));
r.get('/appraisal-cycles', perm(), wrap(async (req, res) => res.json((await q("SELECT c.*,(SELECT count(*) FROM appraisals a WHERE a.cycle_id=c.id)::int AS total,(SELECT count(*) FROM appraisals a WHERE a.cycle_id=c.id AND a.status='completed')::int AS completed FROM appraisal_cycles c ORDER BY c.start_date DESC")).rows)));
r.post('/appraisal-cycles', perm('performance.manage'), wrap(async (req, res) => { const b = req.body, s = U.str(b.start_date, { req: true, max: 10, name: 'Start date' }), e = U.str(b.end_date, { req: true, max: 10, name: 'End date' }); if (e < s) throw bad('The end date is before the start date'); const row = (await q('INSERT INTO appraisal_cycles(name,start_date,end_date) VALUES($1,$2,$3) RETURNING *', [U.str(b.name, { req: true, max: 100, name: 'Name' }), s, e])).rows[0]; audit(req, 'create', 'appraisal_cycles', row.id); res.status(201).json(row); }));
r.post('/appraisal-cycles/:id/start', perm('performance.manage'), wrap(async (req, res) => {
  const n = await tx(async (t) => {
    const c = U.needRow((await t.query('SELECT * FROM appraisal_cycles WHERE id=$1 FOR UPDATE', [Number(req.params.id) || 0])).rows[0], 'Cycle'); if (c.status !== 'draft') throw bad('Only a draft cycle can be started');
    const crit = (await t.query('SELECT id,name,weight FROM appraisal_criteria WHERE active ORDER BY id')).rows; if (!crit.length) throw bad('Add appraisal criteria first'); if (crit.reduce((s, x) => s + x.weight, 0) !== 100) throw bad('The weights of the active criteria must add up to 100');
    const emps = (await t.query("SELECT id,manager_id FROM employees WHERE status<>'terminated' AND hire_date<=$1", [c.end_date])).rows; if (!emps.length) throw bad('There are no employees to appraise');
    for (const e of emps) await t.query('INSERT INTO appraisals(cycle_id,employee_id,manager_id,criteria) VALUES($1,$2,$3,$4)', [c.id, e.id, e.manager_id, JSON.stringify(crit)]);
    await t.query("UPDATE appraisal_cycles SET status='open' WHERE id=$1", [c.id]); return emps.length;
  });
  audit(req, 'start', 'appraisal_cycles', req.params.id); res.json({ ok: true, appraisals: n });
}));
r.post('/appraisal-cycles/:id/close', perm('performance.manage'), wrap(async (req, res) => { const row = U.needRow((await q("UPDATE appraisal_cycles SET status='closed' WHERE id=$1 AND status='open' RETURNING *", [Number(req.params.id) || 0])).rows[0], 'Open cycle'); audit(req, 'close', 'appraisal_cycles', row.id); res.json(row); }));

const ASEL = 'SELECT a.*,c.name AS cycle_name,c.status AS cycle_status,e.full_name,e.employee_no,d.name AS department,m.full_name AS manager_name FROM appraisals a JOIN appraisal_cycles c ON c.id=a.cycle_id JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=a.manager_id';
// the employee must not see the manager's scores before the appraisal is completed
const shape = (req, a) => { const own = a.employee_id === req.user.employee_id && !has(req, 'performance.manage') && a.manager_id !== req.user.employee_id; return own && a.status !== 'completed' ? { ...a, manager_scores: null, manager_comment: null, hr_comment: null, final_score: null, rating: null } : a; };
r.get('/appraisals', perm(), wrap(async (req, res) => {
  const p = [], me = req.user.employee_id ?? 0, w = [has(req, 'performance.manage') ? 'TRUE' : `(a.employee_id=$${p.push(me)} OR a.manager_id=$${p.length})`]; if (req.query.cycle_id) w.push(`a.cycle_id=$${p.push(U.int(req.query.cycle_id, 'Cycle'))}`); if (req.query.status) w.push(`a.status=$${p.push(req.query.status)}`);
  res.json((await q(`${ASEL} WHERE ${w.join(' AND ')} ORDER BY c.start_date DESC,e.full_name LIMIT 500`, p)).rows.map((a) => { const s = shape(req, a); return { id: s.id, cycle_id: s.cycle_id, cycle_name: s.cycle_name, cycle_status: s.cycle_status, employee_id: s.employee_id, full_name: s.full_name, employee_no: s.employee_no, department: s.department, manager_name: s.manager_name, status: s.status, final_score: s.final_score, rating: s.rating, is_own: s.employee_id === me, is_manager: s.manager_id === me }; }));
}));
async function load(req, id, c = { query: q }) {
  const a = U.needRow((await c.query(`${ASEL} WHERE a.id=$1`, [Number(id) || 0])).rows[0], 'Appraisal'), me = req.user.employee_id;
  if (!(has(req, 'performance.manage') || a.employee_id === me || a.manager_id === me)) throw bad('Appraisal not found', 404); return a;
}
r.get('/appraisals/:id', perm(), wrap(async (req, res) => { const a = await load(req, req.params.id); audit(req, 'view', 'appraisals', a.id); res.json({ ...shape(req, a), is_own: a.employee_id === req.user.employee_id, is_manager: a.manager_id === req.user.employee_id }); }));
function scores(a, b) { const o = {}; for (const c of a.criteria) { const v = Number(b[c.id]); if (!Number.isInteger(v) || v < 1 || v > 5) throw bad(`Score "${c.name}" with a whole number from 1 to 5`); o[c.id] = v; } return o; }
r.put('/appraisals/:id/self', perm(), wrap(async (req, res) => {
  const out = await tx(async (t) => { const a = await load(req, req.params.id, t); if (a.employee_id !== req.user.employee_id) throw bad('Only the employee can write the self-assessment', 403); if (a.status !== 'self') throw bad('The self-assessment was already submitted'); if (a.cycle_status !== 'open') throw bad('This appraisal cycle is closed');
    return (await t.query('UPDATE appraisals SET self_scores=$2,self_comment=$3,status=$4 WHERE id=$1 RETURNING id,status', [a.id, JSON.stringify(scores(a, req.body.scores || {})), U.str(req.body.comment, { max: 2000 }), a.manager_id ? 'manager' : 'hr'])).rows[0]; });
  audit(req, 'self', 'appraisals', out.id); res.json(out);
}));
r.put('/appraisals/:id/manager', perm('performance.review'), wrap(async (req, res) => {
  const out = await tx(async (t) => { const a = await load(req, req.params.id, t); if (a.manager_id !== req.user.employee_id) throw bad('Only the manager of the employee can score this appraisal', 403); if (a.status !== 'manager') throw bad('This appraisal is not waiting for the manager'); if (a.cycle_status !== 'open') throw bad('This appraisal cycle is closed');
    return (await t.query("UPDATE appraisals SET manager_scores=$2,manager_comment=$3,status='hr' WHERE id=$1 RETURNING id,status", [a.id, JSON.stringify(scores(a, req.body.scores || {})), U.str(req.body.comment, { req: true, max: 2000, name: 'Comment' })])).rows[0]; });
  audit(req, 'manager', 'appraisals', out.id); res.json(out);
}));
r.post('/appraisals/:id/finalize', perm('performance.manage'), wrap(async (req, res) => {
  const out = await tx(async (t) => {
    const a = await load(req, req.params.id, t); if (a.status !== 'hr') throw bad('Only an appraisal that the manager has scored can be finalized'); if (a.employee_id === req.user.employee_id) throw bad('You cannot finalize your own appraisal', 403);
    const src = a.manager_scores || a.self_scores, final = Math.round(a.criteria.reduce((s, c) => s + c.weight * Number(src[c.id]), 0)) / 100;
    return (await t.query("UPDATE appraisals SET status='completed',final_score=$2,rating=$3,hr_comment=$4,completed_at=now() WHERE id=$1 RETURNING id,final_score,rating,status", [a.id, final, bands(final), U.str(req.body.comment, { max: 1000 })])).rows[0];
  });
  audit(req, 'finalize', 'appraisals', out.id, String(out.final_score)); res.json(out);
}));
module.exports = r;
