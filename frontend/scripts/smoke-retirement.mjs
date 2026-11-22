// UI smoke test for the Retirement page: renders it in a simulated browser (jsdom) against a RUNNING backend and checks that real data appears,
// in English and in Amharic, with no React errors. Usage: API=http://127.0.0.1:PORT USERS="hrm:pw,emp:pw" node scripts/smoke-render.mjs
import { JSDOM } from 'jsdom'; import { createServer } from 'vite'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), API = process.env.API;
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) try { globalThis[k] = dom.window[k]; } catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true }); }
globalThis.IS_REACT_ACT_ENVIRONMENT = true; const realFetch = fetch; globalThis.fetch = (u, o) => realFetch(String(u).startsWith('/') ? API + u : u, o);
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React, { MemoryRouter } = await import('react-router-dom');
const I = await vite.ssrLoadModule('/src/i18n/index.js'), D = await vite.ssrLoadModule('/src/pages/Directive.jsx'), Dash = await vite.ssrLoadModule('/src/pages/Dashboard.jsx');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }; const errors = [], missingT = new Set(); for (const m of ['log', 'warn', 'info']) { const o = console[m]; console[m] = (...a) => { const t = a.map(String).join(' '); if (/missing translation/i.test(t)) missingT.add(t); else if (m === 'log') o(...a); }; } const ce = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 200)); };
const login = async (u, pw) => { const r = await realFetch(API + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${u}@hrms.test`, password: pw }) }); const d = await r.json(); localStorage.setItem('token', d.token); const me = await (await realFetch(API + '/api/me', { headers: { Authorization: 'Bearer ' + d.token } })).json(); return { ...me.user, permissions: me.permissions, perms: me.permissions }; };
const render = async (El, props, wait = 900, after) => { const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host); await act(async () => { r.render(React.createElement(MemoryRouter, null, React.createElement(El, props))); }); await act(async () => { await new Promise((x) => setTimeout(x, wait)); }); if (after) { await act(async () => { after(host); }); await act(async () => { await new Promise((x) => setTimeout(x, wait)); }); } const html = host.innerHTML, text = host.textContent; await act(async () => r.unmount()); host.remove(); return { html, text }; };
const users = Object.fromEntries((process.env.USERS || '').split(',').map((x) => x.split(':')));

for (const lang of ['en', 'am']) {
  await I.setLang(lang); const hrm = await login('hrm', users.hrm);
  const a = await render(D.Retirement, { user: hrm }, 1800); ok(!/undefined|\[object Object\]/.test(a.text), `${lang}: no raw values on the page`);
  ok(/\b60\b/.test(a.text) && /(Eligible for retirement|ለጡረታ ብቁ)/.test(a.text) && /(Approaching retirement|ወደ ጡረታ እየቀረበ)/.test(a.text), `${lang}: statistics and status categories shown`);
  ok(/(Retirement eligibility date|የጡረታ ብቁነት ቀን)/.test(a.text) && /(Date of birth|የትውልድ ቀን)/.test(a.text) && /EMP-|[A-Z]{2,4}-\d+/.test(a.text), `${lang}: dashboard columns and real employees`);
  ok(/(Retirement rule in force|የሚሠራ የጡረታ ደንብ)/.test(a.text) && /(Retirement forecast|ትንበያ)/.test(a.text), `${lang}: the existing rule and forecast sections are still there`);
  const o = await render(D.Retirement, { user: hrm }, 2500, (h) => { const x = [...h.querySelectorAll('button')].find((y) => /^(Open|ክፍት)$/.test(y.textContent.trim())); if (x) x.click(); }); if (process.env.DEBUG) console.log(lang, 'OPEN>>', o.text.includes('Employment information') || o.text.includes('የሥራ መረጃ'), o.text.length, o.text.slice(-300)); ok(/(Employment information|የሥራ መረጃ)/.test(o.text) && /(Retirement process|የጡረታ ሂደት)/.test(o.text), `${lang}: employee retirement details open`);
  const dd = await render(Dash.default, { user: hrm }, 1500); ok(/(Eligible for retirement|ለጡረታ ብቁ)/.test(dd.text), `${lang}: HR dashboard shows retirement alerts`);
}
console.log(`\nsmoke (retirement): ${pass} passed, ${fail} failed`); console.log(errors.length ? 'React errors: ' + errors.join(' | ') : 'No React errors'); if (missingT.size) console.log('Missing translations:', [...missingT].join(' | ')); await vite.close(); process.exit(fail ? 1 : 0);
