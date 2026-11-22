// Public front page ("/" for visitors) and the shared brand panel used by the sign-in page.
import { Link } from 'react-router-dom'; import { tx } from '../i18n/index.js'; import LanguageSwitcher from '../i18n/LanguageSwitcher.jsx';

const I = ({ d }) => <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICON = {
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.6-3.6 3.1-5.6 6.2-5.6s5.6 2 6.2 5.6" /><circle cx="17.2" cy="9" r="2.4" /><path d="M16.4 14.6c2.6.1 4.3 1.7 4.8 4.6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
  flow: <><rect x="3" y="4" width="7" height="5" rx="1.2" /><rect x="14" y="4" width="7" height="5" rx="1.2" /><rect x="8.5" y="15" width="7" height="5" rx="1.2" /><path d="M6.5 9v2.5h11V9M12 11.5V15" /></>,
  shirt: <><path d="m8 4-5 3 2.2 4L8 10v10h8V10l2.8 1 2.2-4-5-3c-.6 1.4-2 2.2-4 2.2S8.6 5.4 8 4Z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
};
export const Logo = ({ size = 56 }) => <img src="/kpc-logo.jpg" alt="Kombolcha Polytechnic College" width={size} height={size} className="kpc-logo" />;

const FEATURES = [['people', 'Employee records', 'Complete profiles, service history, documents and the permanent staff position number of every employee.'], ['calendar', 'Leave and attendance', 'Leave requests with balances and approval, return-to-work records, and a shared leave calendar.'], ['search', 'Recruitment', 'Vacancies, a public application page, screening, interviews and appointment.'], ['flow', 'HR procedures', 'Permanent appointment, promotion, transfer, retirement, termination and discipline through an authorized, recorded workflow.'], ['shirt', 'Uniform management', 'Entitlements, stock, issue and acknowledgment of work clothing and equipment.'], ['target', 'Annual HR plan', 'Objectives, activities, budget, progress reports and the year-end evaluation.'], ['lock', 'Audit and security', 'Every sign-in, view and change is recorded, and confidential records are restricted.']];
const SELF = ['See your profile and permanent staff position number', 'Request leave, training, transfer or resignation', 'Track the status of every request you submitted', 'Receive your official letters and certificates', 'Confirm the uniform and equipment you received'];
const SAFE = [['Role-based access', 'Each person sees only what their role requires.'], ['Every action recorded', 'The audit trail cannot be edited or deleted.'], ['Confidential cases protected', 'Disciplinary and termination files are visible only to authorized officers.'], ['Identity numbers masked', 'Fayda numbers are hidden in ordinary screens and reports.']];

export function BrandPanel({ compact }) {
  return <div className={'brand-panel' + (compact ? ' compact' : '')}><Logo size={compact ? 84 : 110} /><h1>{tx('Kombolcha Polytechnic College')}</h1><p className="brand-sub">{tx('Human Resource Management System')}</p>
    {!compact && <ul className="brand-points">{[tx('Staff records and leave in one place'), tx('Authorized, recorded HR procedures'), tx('English and Amharic')].map((x) => <li key={x}><I d={ICON.check} />{x}</li>)}</ul>}</div>;
}

export default function Home({ user }) {
  return (<div className="landing">
    <header className="lp-top"><div className="lp-wrap lp-bar"><Link to="/" className="lp-brand"><Logo size={42} /><span><b>{tx('Kombolcha Polytechnic College')}</b><small>{tx('Human Resource Management System')}</small></span></Link>
      <nav className="lp-nav"><a href="#features">{tx('What the system covers')}</a><a href="#employees">{tx('For employees')}</a><a href="#security">{tx('Security')}</a><Link to="/p/jobs">{tx('Careers')}</Link><LanguageSwitcher /><Link to={user ? '/' : '/login'} className="lp-btn lp-btn-gold">{user ? tx('Open system') : tx('Staff sign-in')}</Link></nav></div></header>
    <section className="lp-hero"><div className="lp-wrap lp-hero-grid"><div><span className="lp-kicker">{tx('Kombolcha Polytechnic College')}</span><h1>{tx('Human Resource Management System')}</h1>
      <p className="lp-lead">{tx('One secure place for staff records, leave, recruitment and every HR procedure of the College.')}</p>
      <div className="lp-cta"><Link to="/login" className="lp-btn lp-btn-gold">{tx('Staff sign-in')}</Link><Link to="/p/jobs" className="lp-btn lp-btn-line">{tx('Open positions')}</Link></div></div>
      <div className="lp-hero-art" aria-hidden="true"><div className="lp-seal"><Logo size={210} /></div></div></div></section>
    <section id="features" className="lp-sec"><div className="lp-wrap"><h2>{tx('What the system covers')}</h2><p className="lp-sub">{tx('Everything the Human Resource team and every employee need, working from the same records.')}</p>
      <div className="lp-grid">{FEATURES.map(([ic, t, d]) => <article key={t} className="lp-card"><span className="lp-ic"><I d={ICON[ic]} /></span><h3>{tx(t)}</h3><p>{tx(d)}</p></article>)}</div></div></section>
    <section id="employees" className="lp-sec lp-alt"><div className="lp-wrap lp-two"><div><h2>{tx('For every employee')}</h2><p className="lp-sub">{tx('Sign in with your College account to use your own self-service area.')}</p><Link to="/login" className="lp-btn lp-btn-blue">{tx('Staff sign-in')}</Link></div>
      <ul className="lp-checks">{SELF.map((x) => <li key={x}><I d={ICON.check} />{tx(x)}</li>)}</ul></div></section>
    <section id="security" className="lp-sec"><div className="lp-wrap"><h2>{tx('Security and confidentiality')}</h2><div className="lp-grid lp-grid4">{SAFE.map(([t, d]) => <article key={t} className="lp-card lp-plain"><h3>{tx(t)}</h3><p>{tx(d)}</p></article>)}</div></div></section>
    <section className="lp-band"><div className="lp-wrap lp-bandrow"><div><h2>{tx('Looking for a job at the College?')}</h2><p>{tx('Browse our open positions and apply online in a few minutes.')}</p></div><Link to="/p/jobs" className="lp-btn lp-btn-gold">{tx('Open positions')}</Link></div></section>
    <footer className="lp-foot"><div className="lp-wrap"><span>© {new Date().getFullYear()} {tx('Kombolcha Polytechnic College')}</span><span>{tx('Authorised personnel only. All activity is recorded.')}</span></div></footer></div>);
}
