// Work experience (derived by the server from the recorded dates as of today; nothing here is calculated or typed in).
import { tx } from '../i18n/index.js'; import { Pill, dOnly } from '../ui.jsx';
const part = (n, one, many) => `${n} ${tx(n === 1 ? one : many)}`;
// "5 years, 7 months, 12 days"
export const dur = (t) => (t ? [part(t.years, 'year', 'years'), part(t.months, 'month', 'months'), part(t.days, 'day', 'days')].join(', ') : '—');
const WARN = {
  hire_date_missing: 'The employment start date is missing: the current service cannot be calculated.',
  hire_date_invalid: 'The employment start date is not a valid date: the current service cannot be calculated.',
  hire_date_future: 'The employment start date is in the future: no service is counted yet.',
  termination_before_hire: 'The end of employment is earlier than the start date: the current service cannot be calculated.',
  previous_dates_invalid: 'A previous employment ends before it starts and is ignored.',
  previous_end_in_future: 'A previous employment ends in the future and is counted only up to today.',
  previous_overlaps_previous: 'Some previous employments overlap: the overlapping days are counted once.',
  previous_overlaps_current: 'A previous employment overlaps the current employment: the overlapping days are counted once.',
};
export const Warnings = ({ list }) => (list && list.length ? <div className="notice warn" role="alert">{list.map((w) => <div key={w}>⚠ {tx(WARN[w] || w)}</div>)}</div> : null);
const Row = ({ k, v, strong }) => <div><small>{tx(k)}</small>{strong ? <b style={{ fontSize: '1.05em' }}>{v}</b> : <b>{v}</b>}</div>;

// the profile section
export function ExperienceCard({ e }) {
  const x = e.experience; if (!x) return null;
  return (<div className="card"><h4>{tx('Work experience')}</h4><Warnings list={x.warnings} />
    <div className="dl"><Row k="Employment start date" v={x.start_date ? dOnly(x.start_date) : '—'} /><Row k="Current service duration" v={x.start_date && !x.warnings.some((w) => /^(hire_date|termination)/.test(w)) ? dur(x.current) : '—'} /><Row k="Previous verified work experience" v={dur(x.previous_verified)} /><Row k="Total verified work experience" v={dur(x.total_verified)} strong />
      {x.previous_unverified > 0 && <Row k="Unverified previous records (not counted)" v={x.previous_unverified} />}</div>
    <p className="muted">{tx('Counted from the start date up to and including today. Only verified previous employment is added and overlapping periods are counted once.')}</p>
    {x.previous && x.previous.length > 0 && <div className="scroll"><table><thead><tr><th>{tx('Previous employment organization')}</th><th>{tx('Job title')}</th><th>{tx('From')}</th><th>{tx('To')}</th><th>{tx('Status')}</th></tr></thead><tbody>{x.previous.map((p) => <tr key={p.id}><td className="wrap-am">{p.employer}</td><td className="wrap-am">{p.job_title || '—'}</td><td>{dOnly(p.start_date)}</td><td>{p.end_date ? dOnly(p.end_date) : tx('to date')}</td><td><Pill s={p.verified ? 'verified' : 'unverified'} /></td></tr>)}</tbody></table></div>}
  </div>);
}
