// Secure file storage shared by personnel documents and CVs: type allow-list + magic-byte check, size limit, random names outside the web root, SHA-256.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { bad } = require('./mw'), U = require('./util');
const ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')), MAX = (Number(process.env.MAX_UPLOAD_MB) || 8) * 1024 * 1024;
const MAGIC = { 'application/pdf': (b) => b.slice(0, 4).toString() === '%PDF', 'image/png': (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'image/jpeg': (b) => b.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) };
const safeName = (n) => String(n || 'document').replace(/[\\/]/g, '_').replace(/[^\w.\- ()\u1200-\u137F]/g, '_').slice(0, 150) || 'document';
// save(dir, {data, mime, filename}, allowed?) -> { storage, sha256, size, mime, filename }
function save(dir, f, allowed = Object.keys(MAGIC)) {
  if (!f || typeof f.data !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(f.data)) throw bad('The file could not be read');
  const buf = Buffer.from(f.data, 'base64'); if (!buf.length) throw bad('The file is empty'); if (buf.length > MAX) throw bad(`The file is larger than ${MAX / 1048576} MB`);
  const mime = String(f.mime || ''); if (!allowed.includes(mime)) throw bad('Only PDF, PNG, JPEG and Word (.docx) files are accepted'); if (!MAGIC[mime](buf)) throw bad('The file content does not match its type');
  const name = crypto.randomBytes(16).toString('hex') + '.bin', d = path.join(ROOT, dir); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name), buf, { mode: 0o640 });
  return { storage: name, sha256: U.sha256(buf), size: buf.length, mime, filename: safeName(f.filename) };
}
const read = (dir, name) => { const p = path.join(ROOT, dir, name); if (!fs.existsSync(p)) throw bad('The stored file is missing. Tell the system administrator', 500); return fs.readFileSync(p); };
const remove = (dir, name) => fs.rmSync(path.join(ROOT, dir, name), { force: true });
module.exports = { save, read, remove, MAGIC, ROOT };
