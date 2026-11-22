// E-mail queue. Mails are stored in PostgreSQL (notifications) and sent in the background with retries,
// so a slow or failing mail server never blocks a request. Without a password the system runs in TEST MODE: nothing is sent,
// the mail is printed to the server log and shown as "simulated" in the E-mail Log.
const nodemailer = require('nodemailer'), { q } = require('./db');
// Credentials: GMAIL_USER / GMAIL_APP_PASSWORD (as in the original system); SMTP_USER / SMTP_PASS also work for other providers.
const USER = () => process.env.GMAIL_USER || process.env.SMTP_USER, PASS = () => process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
const live = () => !!(USER() && PASS());
// 587 (STARTTLS) works on more networks than 465 (SSL). If one port is reset / times out, the other is tried automatically.
const mk = (port) => nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user: USER(), pass: PASS() }, connectionTimeout: 15000 });
const NET = ['ECONNECTION', 'ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'ECONNREFUSED', 'EDNS'];
async function send(msg) {
  const first = Number(process.env.SMTP_PORT) || 587, other = first === 587 ? 465 : 587;
  try { return await mk(first).sendMail(msg); }
  catch (e) { if (!NET.includes(e.code)) throw e; return mk(other).sendMail(msg); }
}
const enqueue = (to, subject, body) => to ? q('INSERT INTO notifications(to_email,subject,body) VALUES($1,$2,$3) RETURNING id', [to, subject, body]).then((r) => r.rows[0].id).catch(console.error) : null;
let busy = false;
async function flush() {
  if (busy) return; busy = true;
  try {
    const rows = (await q("SELECT * FROM notifications WHERE status='queued' AND next_try_at<=now() ORDER BY id LIMIT 20")).rows;
    for (const n of rows) {
      if (!live()) { console.log(`[mail simulated] to=${n.to_email} subject="${n.subject}"\n${n.body}\n`); await q("UPDATE notifications SET status='simulated',sent_at=now(),attempts=attempts+1 WHERE id=$1", [n.id]); continue; }
      try {
        await send({ from: process.env.SMTP_FROM || USER(), to: n.to_email, subject: n.subject, text: n.body });
        await q("UPDATE notifications SET status='sent',sent_at=now(),attempts=attempts+1,error=NULL WHERE id=$1", [n.id]);
      } catch (e) {
        const a = n.attempts + 1; // retry after 1, 4, 9, 16 minutes, then give up
        await q(`UPDATE notifications SET attempts=$2,error=$3,status=$4,next_try_at=now()+($5||' minutes')::interval WHERE id=$1`, [n.id, a, String(e.message).slice(0, 300), a >= 5 ? 'failed' : 'queued', String(a * a)]);
      }
    }
  } catch (e) { console.error('mail worker:', e.message); } finally { busy = false; }
}
const start = () => { setInterval(flush, 20000).unref(); setTimeout(flush, 2000).unref(); };
module.exports = { enqueue, flush, start, live };
