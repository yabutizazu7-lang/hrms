const { bad } = require('./mw');
// Next number of a yearly sequence, e.g. next(c,'CASE-KBL-2026') -> 1, 2, 3 ... (race-free: UPDATE row lock via upsert)
const nextNo = async (c, key) => (await c.query('INSERT INTO counters(key,value) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET value=counters.value+1 RETURNING value', [key])).rows[0].value;
const pad = (n, w = 5) => String(n).padStart(w, '0');
const year = () => new Date().getFullYear();

const str = (v, { max = 500, req = false, name = 'Value' } = {}) => {
  const s = v == null ? '' : String(v).trim();
  if (req && !s) throw bad(`${name} is required`);
  if (s.length > max) throw bad(`${name} is too long`);
  return s || null;
};
const oneOf = (v, list, name = 'Value', req = true) => {
  if (v == null || v === '') { if (req) throw bad(`${name} is required`); return null; }
  if (!list.includes(v)) throw bad(`${name} is not valid`);
  return v;
};
const int = (v, name = 'Value', req = false) => {
  if (v == null || v === '') { if (req) throw bad(`${name} is required`); return null; }
  const n = Number(v); if (!Number.isInteger(n)) throw bad(`${name} is not valid`); return n;
};
const date = (v, name = 'Date', req = false) => {
  if (v == null || v === '') { if (req) throw bad(`${name} is required`); return null; }
  const d = new Date(v); if (isNaN(d)) throw bad(`${name} is not a valid date`); return d.toISOString();
};
const email = (v, req = false) => {
  const s = str(v, { max: 200 }); if (!s) { if (req) throw bad('Email is required'); return null; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw bad('Enter a valid email address');
  return s.toLowerCase();
};
// Ethiopian numbers: 09xxxxxxxx / 07xxxxxxxx / +2519xxxxxxxx -> +2519xxxxxxxx. Other international numbers are kept if they look valid.
const phone = (v, req = false) => {
  const s = str(v, { max: 30 }); if (!s) { if (req) throw bad('Phone number is required'); return null; }
  const d = s.replace(/[\s-]/g, '');
  let m = /^(?:\+?251|0)([79]\d{8})$/.exec(d); if (m) return '+251' + m[1];
  if (/^\+\d{8,15}$/.test(d)) return d;
  throw bad('Enter a valid phone number (09… or +251…)');
};
const needRow = (r, what = 'Record') => { if (!r) throw bad(`${what} not found`, 404); return r; };
const randomCode = (len = 8) => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = require('crypto').randomBytes(len); for (let i = 0; i < len; i++) s += A[b[i] % A.length]; return s; };
module.exports = { nextNo, pad, year, str, oneOf, int, date, email, phone, needRow, randomCode };
// money(v): non-negative amount with at most 2 decimals
module.exports.money = (v, name = 'Amount', req = false) => {
  if (v == null || v === '') { if (req) throw require('./mw').bad(`${name} is required`); return null; }
  const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e12) throw require('./mw').bad(`${name} is not valid`);
  return Math.round(n * 100) / 100;
};
module.exports.sha256 = (buf) => require('crypto').createHash('sha256').update(buf).digest('hex');
