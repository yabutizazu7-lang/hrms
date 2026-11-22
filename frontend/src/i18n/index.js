// Central i18n (i18next + react-i18next). Two languages: English (en, default) and Amharic (am).
// Keys are the English phrases themselves (natural-language keys); en.json holds the English text, am.json the Amharic.
// Use tx('Some text') anywhere, tx('Hello {{name}}', { name }) with variables, tv(code) for enum values (status, role...),
// and import { useLang } from './i18n' where you need the current language in a component.
import i18n from 'i18next'; import { initReactI18next, useTranslation } from 'react-i18next';
import en from './en.json'; import am from './am.json'; import { matchServerMessage } from './serverMessages.js';

export const LANGS = [{ code: 'en', short: 'EN', name: 'English' }, { code: 'am', short: 'አማ', name: 'አማርኛ' }];
const STORE = 'lang';
const read = () => { try { const v = localStorage.getItem(STORE); return LANGS.some((l) => l.code === v) ? v : 'en'; } catch { return 'en'; } };

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, am: { translation: am } },
  lng: read(), fallbackLng: 'en', supportedLngs: ['en', 'am'],
  keySeparator: false, nsSeparator: false, returnNull: false, interpolation: { escapeValue: false }, react: { useSuspense: false },
});
const sync = (l) => { document.documentElement.lang = l; document.documentElement.classList.toggle('lang-am', l === 'am'); };
sync(i18n.language); i18n.on('languageChanged', sync);

export const getLang = () => (i18n.language === 'am' ? 'am' : 'en');
export const setLang = (l) => { if (!LANGS.some((x) => x.code === l)) return; try { localStorage.setItem(STORE, l); } catch { /* private mode */ } return i18n.changeLanguage(l); };
export const useLang = () => { const { i18n: i } = useTranslation(); return [i.language === 'am' ? 'am' : 'en', setLang]; };
export const locale = () => (getLang() === 'am' ? 'am-ET' : 'en-US'); // for Intl / toLocale*String

const warned = new Set();
// Translate an API message that has variable parts; returns null when it is not a known dynamic message.
function serverTr(msg) {
  const m = matchServerMessage(msg); if (!m) return null;
  const vars = { ...m.vars };
  m.tvNames.forEach((n) => { vars[n] = tv(vars[n]); });
  m.fieldNames.forEach((n) => { vars[n] = i18n.exists(vars[n]) ? i18n.t(vars[n]) : vars[n]; });
  return i18n.exists(m.key) ? i18n.t(m.key, vars) : null;
}
// tx(key, vars): translate a phrase. Unknown phrases fall back to the English text (and warn once in development).
export function tx(key, vars) {
  if (key == null || key === '') return '';
  key = String(key);
  if (i18n.exists(key)) return i18n.t(key, vars);
  if (import.meta.env?.DEV && /[A-Za-z]{3}/.test(key) && !warned.has(key)) { warned.add(key); console.warn('[i18n] missing translation:', key); }
  return vars ? i18n.t(key, { ...vars, defaultValue: key }) : key;
}
// tm(message): translate a message shown to the user (API errors, banners). Known phrases are translated, anything else is shown unchanged.
export function tm(msg) {
  if (msg == null || msg === '') return '';
  msg = String(msg);
  if (i18n.exists(msg)) return i18n.t(msg);
  const sm = serverTr(msg);
  return sm != null ? sm : msg;
}
// tv(value): translate an enum-like value from the database (confirmed, pending, mobile_money, manager ...). Anything unknown is shown unchanged.
export const tv = (v) => { if (v == null || v === '') return v ?? ''; const k = 'value.' + String(v); return i18n.exists(k) ? i18n.t(k) : String(v); };
// bi('አማርኛ (English)'): bilingual print labels keep only the part of the selected language
export const bi = (s) => { const m = /^(.*?)\s*\((.*)\)(.*)$/.exec(s); if (!m) return s; return getLang() === 'am' ? (m[1] + m[3]).trim() : (m[2] + m[3]).trim(); };
export default i18n;
