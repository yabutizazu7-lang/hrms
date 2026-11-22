// Employee-register import for HR (permission import.manage): preview (dry run, writes nothing) -> apply (one transaction) -> report / undo.
// The workbook is held only in a temporary file (mode 600) for the length of one request and then deleted; reports contain row numbers and issues, never names or ID numbers.
const express = require('express'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { q } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), R = require('../import-register');
const r = express.Router(), MAX = (Number(process.env.MAX_UPLOAD_MB) || 8) * 1024 * 1024;

async function withFile(req, fn) {
  const b64 = String(req.body.file_base64 || ''); if (!b64) throw bad('Choose the register file');
  const buf = Buffer.from(b64, 'base64'); if (!buf.length || buf.length > MAX) throw bad('The file is empty or too large');
  if (buf.subarray(0, 2).toString() !== 'PK') throw bad('The file must be an Excel .xlsx workbook');
  const tmp = path.join(os.tmpdir(), 'register-' + crypto.randomUUID() + '.xlsx'); fs.writeFileSync(tmp, buf, { mode: 0o600 });
  try { return await fn(tmp); } finally { fs.unlink(tmp, () => {}); }
}
const opts = (req) => { const withSalary = !!req.body.with_salary; if (withSalary && !has(req, 'salary.manage')) throw bad('You do not have permission to set salaries', 403); return { withSalary, createOrg: !!req.body.create_org }; };
const shape = (o) => {
  const tally = {}; for (const x of o.p) for (const i of x.issues) { const k = i.replace(/ - verify$/, ''); tally[k] = (tally[k] || 0) + 1; }
  return { summary: o.sum, departments_to_create: o.missingDept.size, positions_to_create: o.missingPos.size, issue_counts: tally, rows: o.p.map((x) => ({ source_row: x.r.no, action: x.action, issues: x.issues })) };
};

r.post('/register-import/preview', perm('import.manage'), wrap(async (req, res) => {
  const o = opts(req), out = await withFile(req, (f) => R.runRegister({ file: f, apply: false, ...o }));
  audit(req, 'register_preview', 'employees', null, JSON.stringify(out.sum)); res.json(shape(out));
}));
r.post('/register-import/apply', perm('import.manage'), wrap(async (req, res) => {
  if (req.body.confirm !== true) throw bad('Confirm the import first');
  const o = opts(req), name = String(req.body.file_name || 'register.xlsx').replace(/[^\w.\- ]/g, '_').slice(0, 120);
  const out = await withFile(req, (f) => R.runRegister({ file: f, apply: true, userId: req.user.id, sourceName: name, ...o }));
  audit(req, 'register_apply', 'employees', out.sum.batch_id, JSON.stringify(out.sum)); res.status(201).json(shape(out));
}));
r.get('/register-import/batches', perm('import.manage'), wrap(async (req, res) => res.json((await q("SELECT b.id,b.source_file,b.mode,b.inserted,b.updated,b.skipped,b.failed,b.rolled_back_at,b.at,u.name AS by_name FROM import_batches b LEFT JOIN users u ON u.id=b.by_user ORDER BY b.id DESC LIMIT 50")).rows)));
r.get('/register-import/batches/:id', perm('import.manage'), wrap(async (req, res) => {
  const id = Number(req.params.id) || 0, b = U.needRow((await q('SELECT * FROM import_batches WHERE id=$1', [id])).rows[0], 'Import');
  audit(req, 'download', 'import_batches', id, 'error report');
  res.json({ batch: b, rows: (await q('SELECT source_row,action,issues FROM import_rows WHERE batch_id=$1 ORDER BY source_row', [id])).rows });
}));
r.post('/register-import/batches/:id/rollback', perm('import.manage'), wrap(async (req, res) => {
  if (req.body.confirm !== true) throw bad('Confirm the undo first');
  let out; try { out = await R.rollbackBatch(req.params.id); } catch (e) { throw bad(e.message); }
  audit(req, 'register_rollback', 'import_batches', Number(req.params.id), out.text); res.json(out);
}));
module.exports = { router: r };
