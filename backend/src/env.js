// Loads backend/.env (from the backend folder, whatever the current directory is) and makes sure JWT_SECRET is usable.
// Development: a missing / short JWT_SECRET is generated and saved into .env automatically.
// Production (NODE_ENV=production): the server refuses to start instead, so a secret is never created by accident.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const file = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: file });
const ok = () => (process.env.JWT_SECRET || '').trim().length >= 32;
if (!ok()) {
  if (process.env.NODE_ENV === 'production') { console.error('Set JWT_SECRET (32+ random characters) in backend/.env'); process.exit(1); }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const line = `JWT_SECRET=${secret}`;
    text = /^\s*JWT_SECRET\s*=.*$/m.test(text) ? text.replace(/^\s*JWT_SECRET\s*=.*$/m, line) : text + (text && !text.endsWith('\n') ? '\n' : '') + line + '\n';
    fs.writeFileSync(file, text.replace(/^\uFEFF/, ''));
    console.log('JWT_SECRET was missing: a new one was generated and saved in backend/.env');
  } catch (e) { console.warn('Could not save JWT_SECRET to .env (' + e.message + '). Using a temporary secret: logins stop working when the server restarts.'); }
  process.env.JWT_SECRET = secret;
}
if (!process.env.DB_NAME) console.warn('DB_NAME is empty in backend/.env (use: DB_NAME=pccs)');
