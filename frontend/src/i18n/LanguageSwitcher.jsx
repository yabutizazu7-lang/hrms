import { useEffect, useRef, useState } from 'react'; import { LANGS, useLang } from './index.js';
// EN ▼ / አማ ▼ button in the top bar with a dropdown (English / አማርኛ). Works with mouse, touch and keyboard (Esc closes).
export default function LanguageSwitcher() {
  const [lang, setLang] = useLang(), [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => {
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }, esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('touchstart', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); document.removeEventListener('keydown', esc); };
  }, []);
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (<div className="langsw noprint" ref={box}>
    <button type="button" className="langbtn" aria-haspopup="listbox" aria-expanded={open} aria-label="Language / ቋንቋ" onClick={() => setOpen(!open)}>{cur.short} <span aria-hidden="true">▼</span></button>
    {open && <ul className="langmenu" role="listbox">{LANGS.map((l) => <li key={l.code} role="option" aria-selected={l.code === lang} className={l.code === lang ? 'sel' : ''} onClick={() => { setLang(l.code); setOpen(false); }} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (setLang(l.code), setOpen(false))} tabIndex={0}>{l.name}</li>)}</ul>}
  </div>);
}
