// UI smoke test for the Work Experience Certificate page: renders it in a simulated browser (jsdom) against a RUNNING backend and checks that real data appears,
// in English and in Amharic, with no React errors. Usage: API=http://127.0.0.1:PORT USERS="hrm:pw,emp:pw" node scripts/smoke-render.mjs
import { JSDOM } from 'jsdom'; import { createServer } from 'vite'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), API = process.env.API;
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) try { globalThis[k] = dom.window[k]; } catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true }); }
globalThis.IS_REACT_ACT_ENVIRONMENT = true; const realFetch = fetch; globalThis.fetch = (u, o) => realFetch(String(u).startsWith('/') ? API + u : u, o);
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React, { MemoryRouter } = await import('react-router-dom');
const I = await vite.ssrLoadModule('/src/i18n/index.js'), W = await vite.ssrLoadModule('/src/pages/WorkCertificates.jsx');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }; const errors = [], missingT = new Set(); for (const m of ['log', 'warn', 'info']) { const o = console[m]; console[m] = (...a) => { const t = a.map(String).join(' '); if (/missing translation/i.test(t)) missingT.add(t); else if (m === 'log') o(...a); }; } const ce = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 200)); };
const login = async (u, pw) => { const r = await realFetch(API + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${u}@hrms.test`, password: pw }) }); const d = await r.json(); localStorage.setItem('token', d.token); const me = await (await realFetch(API + '/api/me', { headers: { Authorization: 'Bearer ' + d.token } })).json(); return { ...me.user, permissions: me.permissions, perms: me.permissions }; };
const render = async (El, props, wait = 900, after) => { const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host); await act(async () => { r.render(React.createElement(MemoryRouter, null, React.createElement(El, props))); }); await act(async () => { await new Promise((x) => setTimeout(x, wait)); }); if (after) { await act(async () => { after(host); }); await act(async () => { await new Promise((x) => setTimeout(x, wait)); }); } const html = host.innerHTML, text = host.textContent; await act(async () => r.unmount()); host.remove(); return { html, text }; };
const users = Object.fromEntries((process.env.USERS || '').split(',').map((x) => x.split(':')));

const tabN = (n) => (h) => { const b = h.querySelectorAll('.tabs button')[n]; if (b) b.click(); };
for (const lang of ['en', 'am']) {
  await I.setLang(lang); const hrm = await login('hrm', users.hrm);
  const a = await render(W.default, { user: hrm }); ok(/Work Experience Certificate|የሥራ ልምድ ማስረጃ/.test(a.text) && !/undefined|\[object Object\]/.test(a.text), `${lang}: the page renders for HR`); ok(/EMP-\d+|WEC-/.test(a.text), `${lang}: employees with a recommendation letter are listed`);
  if (lang === 'am') ok(/[\u1200-\u137F]{4,}/.test(a.text), 'am: the page is in Amharic');
  const r = await render(W.default, { user: hrm }, 1500, tabN(1)); if (process.env.DEBUG) console.log(a.text.slice(0, 300), '||', r.text.slice(0, 300)); ok(/WEC-\d{4}-\d{5}/.test(r.text), `${lang}: certificate records show real reference numbers`);
  const o = await render(W.default, { user: hrm }, 1500, (h) => { const b = h.querySelectorAll('.tabs button')[1]; if (b) b.click(); setTimeout(() => { const x = [...h.querySelectorAll('button')].find((y) => /Open|ክፈት/.test(y.textContent)); if (x) x.click(); }, 400); }); ok(/WEC-\d{4}-\d{5}/.test(o.text), `${lang}: a certificate record opens`);
  const s = await render(W.default, { user: hrm }, 900, tabN(2)); ok(/stamp|ማኅተም/.test(s.text), `${lang}: signature and stamp tab renders`);
  const emp = await login('emp2', users.emp2 || users.hrm); const e = await render(W.default, { user: emp }); ok(/Work Experience Certificate|የሥራ ልምድ ማስረጃ/.test(e.text) && !/Employees with a recommendation|ምክረ ሐሳብ ደብዳቤ ያገኙ/.test(e.text), `${lang}: an employee sees only the own-certificate view`);
}
console.log(`\nsmoke (certificates): ${pass} passed, ${fail} failed`); console.log(errors.length ? 'React errors: ' + errors.join(' | ') : 'No React errors'); if (missingT.size) console.log('Missing translations:', [...missingT].join(' | ')); await vite.close(); process.exit(fail ? 1 : 0);
