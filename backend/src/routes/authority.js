// Approval authorities for HR cases: the selectable options (HR "የሰው ሀብት" and the institutional ones), and the HR officers designated BY NAME to decide for HR.
// Nobody is made a decision-maker automatically: the HR Manager role holds the permission; any other HR officer needs a written designation (reference required).
const express = require('express'), { q, tx } = require('../db'), { perm, permsFor, audit, wrap, bad } = require('../mw'), U = require('../util'), { enqueue } = require('../notify');
const r = express.Router(), HR = 'cases.decide_hr';

r.get('/approval-authorities', perm('cases.manage', 'config.manage', 'cases.view'), wrap(async (req, res) => res.json((await q("SELECT a.*,(SELECT count(*)::int FROM case_approval_rules r WHERE r.approver_permission=a.permission) AS used_by_types FROM approval_authorities a ORDER BY a.sort,a.permission")).rows)));
// The authority options are fixed: the HR department decides every HR case. No other authority can be added or switched on (no conflicting approval authority).

const LIST = "SELECT d.id,d.user_id,u.name,u.email,u.role,d.source_ref,d.note,d.granted_at,gu.name AS granted_by_name,d.revoked_at,ru.name AS revoked_by_name FROM authority_delegates d JOIN users u ON u.id=d.user_id LEFT JOIN users gu ON gu.id=d.granted_by LEFT JOIN users ru ON ru.id=d.revoked_by";
r.get('/approval-delegates', perm('cases.authorize', 'config.manage'), wrap(async (req, res) => res.json((await q(`${LIST} ORDER BY (d.revoked_at IS NULL) DESC,d.granted_at DESC`)).rows)));
r.get('/approval-delegates/candidates', perm('cases.authorize'), wrap(async (req, res) => {   // active HR staff (they can already work on cases) who do not decide for HR yet
  const us = (await q("SELECT id,name,email,role FROM users WHERE active AND NOT EXISTS (SELECT 1 FROM authority_delegates d WHERE d.user_id=users.id AND d.revoked_at IS NULL) ORDER BY name")).rows, out = [];
  for (const u of us) { const p = await permsFor(u.role); if (u.role !== 'super_admin' && p.includes('cases.manage') && !p.includes(HR)) out.push(u); } res.json(out);
}));
r.post('/approval-delegates', perm('cases.authorize'), wrap(async (req, res) => {
  const b = req.body, uid = U.int(b.user_id, 'Officer'), ref = U.str(b.source_ref, { req: true, max: 300, name: 'Reference of the official designation' }), u = U.needRow((await q('SELECT id,name,email,role,active FROM users WHERE id=$1', [uid])).rows[0], 'Officer');
  if (u.id === req.user.id) throw bad('You cannot designate yourself'); if (!u.active) throw bad('This account is not active');
  if ((await q('SELECT 1 FROM authority_delegates WHERE user_id=$1 AND revoked_at IS NULL', [uid])).rows[0]) throw bad('This officer is already designated');
  const p = await permsFor(u.role); if (!p.includes('cases.manage') || u.role === 'super_admin') throw bad('Only HR staff who work on HR cases can be designated'); if (p.includes(HR)) throw bad('This role already holds the HR authority');
  const row = (await q('INSERT INTO authority_delegates(user_id,source_ref,note,granted_by) VALUES($1,$2,$3,$4) RETURNING id', [uid, ref, U.str(b.note, { max: 500 }), req.user.id])).rows[0];
  audit(req, 'designate', 'authority_delegates', row.id, `${u.email}: ${ref}`);
  enqueue(u.email, 'You are authorized to decide HR cases / የሰው ሀብት ጉዳዮችን ለመወሰን ተፈቅዶልዎታል', `You were designated to decide HR cases for the HR authority (reference: ${ref}).\n\nለሰው ሀብት ሥልጣን ጉዳዮችን እንዲወስኑ ተመድበዋል (ማጣቀሻ: ${ref})።`);
  res.status(201).json((await q(`${LIST} WHERE d.id=$1`, [row.id])).rows[0]);
}));
r.post('/approval-delegates/:id/revoke', perm('cases.authorize'), wrap(async (req, res) => {
  const row = U.needRow((await q('UPDATE authority_delegates SET revoked_at=now(),revoked_by=$2 WHERE id=$1 AND revoked_at IS NULL RETURNING id,user_id', [Number(req.params.id) || 0, req.user.id])).rows[0], 'Designation');
  audit(req, 'revoke', 'authority_delegates', row.id); res.json({ ok: true });
}));
module.exports = { router: r };
