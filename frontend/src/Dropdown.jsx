// Accessible single-select dropdown (WAI-ARIA "select-only combobox": a button + a listbox).
// Mouse, touch and keyboard: Enter / Space / Arrow keys open; Up / Down / Home / End / PageUp / PageDown move; Enter or Space selects; Escape closes;
// Tab selects the highlighted option and moves on; typing selects by first letters (works with Ethiopic text). The selected option is marked with a check
// and aria-selected. On small screens the list becomes a bottom sheet with large touch targets. A hidden native input carries `required` so ordinary form validation works.
import { useEffect, useId, useMemo, useRef, useState } from 'react'; import { tx } from './i18n/index.js';
const item = (o) => (Array.isArray(o) ? { v: o[0], l: o[1] } : o && typeof o === 'object' ? o : { v: o, l: o });
const Chevron = () => <svg className="dd-chev" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Check = () => <svg className="dd-check" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default function Dropdown({ value, onChange, options, placeholder = '—', ariaLabel, labelledBy, required, disabled, name, className = '', onInvalid }) {
  const uid = useId().replace(/:/g, ''), listId = `dd-list-${uid}`, optId = (i) => `dd-opt-${uid}-${i}`;
  const items = useMemo(() => (options || []).map(item), [options]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), root = useRef(null), btn = useRef(null), list = useRef(null), typed = useRef({ s: '', t: 0 });
  const sel = items.findIndex((o) => String(o.v) === String(value ?? '')), shown = sel >= 0 ? items[sel].l : placeholder, last = items.length - 1;
  const openAt = (i) => { setActive(Math.max(0, Math.min(last, i < 0 ? (sel >= 0 ? sel : 0) : i))); setOpen(true); };
  const close = (focus = true) => { setOpen(false); if (focus && btn.current) btn.current.focus(); };
  const pick = (i, focus = true) => { const o = items[i]; if (o && String(o.v) !== String(value ?? '')) onChange(o.v); close(focus); };
  useEffect(() => {   // a click or touch outside closes the list
    if (!open) return undefined; const away = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('touchstart', away); return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open]);
  useEffect(() => { if (open && active >= 0 && list.current) { const el = list.current.children[active]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } }, [open, active]);
  const find = (ch) => {   // first letters typed within 600 ms; one letter repeated moves on to the next option that starts with it
    const now = Date.now(), t = typed.current; t.s = now - t.t > 600 ? ch : t.s + ch; t.t = now; const needle = t.s.toLocaleLowerCase(), from = t.s.length === 1 ? active + 1 : Math.max(active, 0);
    for (let k = 0; k < items.length; k++) { const i = (from + k) % items.length; if (String(items[i].l).toLocaleLowerCase().startsWith(needle)) return i; } return -1;
  };
  const onKey = (e) => {
    if (disabled || e.ctrlKey || e.metaKey) return; const k = e.key, printable = k.length === 1 && k !== ' ';
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openAt(sel); } else if (k === 'Home') { e.preventDefault(); openAt(0); } else if (k === 'End') { e.preventDefault(); openAt(last); }
      else if (printable) { const i = find(k); if (i >= 0) { e.preventDefault(); openAt(i); } }
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(last, a + 1)); } else if (k === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); } else if (k === 'End') { e.preventDefault(); setActive(last); }
    else if (k === 'PageDown') { e.preventDefault(); setActive((a) => Math.min(last, a + 10)); } else if (k === 'PageUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 10)); }
    else if (k === 'Enter' || (k === ' ' && Date.now() - typed.current.t > 600)) { e.preventDefault(); pick(active); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === 'Tab') { if (active >= 0) pick(active, false); else setOpen(false); }
    else if (printable || k === ' ') { const i = find(k); if (i >= 0) { e.preventDefault(); setActive(i); } }
  };
  return (<div ref={root} className={`dd${open ? ' open' : ''}${disabled ? ' disabled' : ''} ${className}`.trim()}>
    <button type="button" ref={btn} className="dd-btn" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
      aria-label={labelledBy ? undefined : ariaLabel} aria-labelledby={labelledBy} aria-required={required || undefined} disabled={disabled} data-empty={sel < 0 || undefined}
      onClick={() => (open ? close(false) : openAt(sel))} onKeyDown={onKey}><span className="dd-val">{shown}</span><Chevron /></button>
    {(name || required) && <input className="dd-native" tabIndex={-1} aria-hidden="true" name={name} value={value ?? ''} required={required} onChange={() => {}} onInvalid={(e) => { if (btn.current) btn.current.focus(); if (onInvalid) onInvalid(e); }} />}
    {open && <><div className="dd-backdrop" onClick={() => close(false)} />
      <ul id={listId} ref={list} role="listbox" className="dd-list" aria-label={ariaLabel}>{items.map((o, i) => <li key={`${o.v}-${i}`} id={optId(i)} role="option" aria-selected={i === sel} className={`dd-opt${i === active ? ' active' : ''}${i === sel ? ' selected' : ''}`}
        onMouseMove={() => active !== i && setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}><span>{o.l}</span>{i === sel && <Check />}</li>)}</ul></>}
  </div>);
}

// a labelled dropdown in the same shape as <Field type="select"> (label above, required star, wide)
export function DropdownField({ label, value, onChange, options, required, wide, hint, disabled, placeholder }) {
  const id = `ddl-${useId().replace(/:/g, '')}`;
  return (<div className={`dd-field${wide ? ' wide' : ''}`}><span id={id} className="dd-label">{tx(label)}{required && ' *'}</span><Dropdown labelledBy={id} value={value} onChange={onChange} options={options} required={required} disabled={disabled} placeholder={placeholder} />{hint && <small className="muted">{tx(hint)}</small>}</div>);
}
