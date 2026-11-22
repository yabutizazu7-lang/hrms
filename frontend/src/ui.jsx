import { useCallback, useEffect, useState } from 'react';
import { tx, tm, tv, locale } from './i18n/index.js'; import api from './api'; import Dropdown, { DropdownField } from './Dropdown.jsx';
export { Dropdown };

export const TZ = 'Africa/Addis_Ababa';
export const dt = (d) => (d ? new Date(d).toLocaleString(locale(), { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const dOnly = (d) => (d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString(locale(), { timeZone: TZ, dateStyle: 'medium' }) : '—');
const pad = (n) => String(n).padStart(2, '0');
export const toInput = (v) => { if (!v) return ''; const d = new Date(v); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromInput = (v) => (v ? new Date(v).toISOString() : null);
export const nowInput = () => toInput(new Date());
export const hoursAgo = (d) => (Date.now() - new Date(d).getTime()) / 36e5;

// useLoad(fn, deps): { data, err, loading, reload }
export function useLoad(fn, deps = []) {
  const [s, setS] = useState({ data: null, err: '', loading: true });
  const run = useCallback(() => fn().then((data) => setS({ data, err: '', loading: false })).catch((e) => setS((p) => ({ ...p, err: e.message, loading: false }))), deps); // eslint-disable-line
  useEffect(() => { setS((p) => ({ ...p, loading: true })); run(); }, [run]);
  return { ...s, reload: run };
}
// Dropdown data (stations, offense types, officers, units), loaded once per session
let lookupCache = null;
export const resetLookups = () => { lookupCache = null; };
export function useLookups() {
  const [d, setD] = useState({ departments: [], positions: [], leave_types: [], roles: [] });
  useEffect(() => { (lookupCache ||= api('/lookups').catch((e) => { lookupCache = null; throw e; })).then(setD).catch(() => {}); }, []);
  return d;
}
export const Pill = ({ s }) => (s ? <span className={'pill st-' + s}>{tv(s)}</span> : null);
export const Prio = ({ p }) => <span><i className={'prio ' + p} />{tv(p)}</span>;
export const Msg = ({ err, ok }) => <>{err && <p className="err" role="alert">{tm(err)}</p>}{ok && <p className="ok" role="status">{tm(ok)}</p>}</>;
export const Loading = () => <p className="muted">{tx('Loading…')}</p>;

// opts: ['a','b'] (translated with tv) or [{v,l}] (label shown as is) or [[v,l]]
const norm = (o) => (typeof o === 'string' ? { v: o, l: tv(o) } : Array.isArray(o) ? { v: o[0], l: o[1] } : o);
export function Field({ label, type = 'text', value, onChange, options, required, wide, hint, ...rest }) {
  const cls = wide ? 'wide' : undefined;
  if (type === 'dropdown') return <DropdownField label={label} value={value} onChange={onChange} options={(options || []).map(norm)} required={required} wide={wide} hint={hint} {...rest} />;
  if (type === 'checkbox') return <label className={'check ' + (cls || '')}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} {...rest} />{tx(label)}</label>;
  return (<label className={cls}>{tx(label)}{required && ' *'}
    {type === 'select' ? <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} {...rest}>{!required && <option value="">—</option>}{required && (value === '' || value == null) && <option value="">—</option>}{(options || []).map(norm).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
      : type === 'textarea' ? <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} {...rest} />
      : <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} step={type === 'number' ? 'any' : undefined} {...rest} />}
    {hint && <span className="muted">{tx(hint)}</span>}</label>);
}
export function Modal({ title, onClose, children }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true"><div className="bar"><h3>{tx(title)}</h3><button className="ghost small" onClick={onClose} aria-label={tx('Close')}>✕</button></div>{children}</div></div>;
}
// Debounced search box state
export function useSearch(delay = 300) { const [v, setV] = useState(''), [d, setD] = useState(''); useEffect(() => { const t = setTimeout(() => setD(v), delay); return () => clearTimeout(t); }, [v, delay]); return [v, setV, d]; }
export const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v !== '' && v != null && p.set(k, v)); const s = p.toString(); return s ? '?' + s : ''; };
export const Shield = ({ size = 28 }) => <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true"><circle cx="32" cy="32" r="29" fill="currentColor" opacity=".16"/><g fill="none" stroke="#e0a030" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="32" cy="22" r="7"/><path d="M18 46c0-8 6-13 14-13s14 5 14 13"/><circle cx="16" cy="26" r="4.5"/><circle cx="48" cy="26" r="4.5"/><path d="M8 44c0-5 3-8 8-8M56 44c0-5-3-8-8-8"/></g></svg>;
export const errMsg = (e) => (e && e.message) || 'Something went wrong';

// Downloads a protected file with the user's token (a plain link cannot send the Authorization header)
export async function downloadFile(path, filename) {
  const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Download failed'); }
  const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = filename || 'document'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const readBase64 = (file) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] || ''); f.onerror = () => rej(new Error('The file could not be read')); f.readAsDataURL(file); });
export const money = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
