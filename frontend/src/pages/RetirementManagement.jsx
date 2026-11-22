// Retirement management (ጡረታ): every employee by retirement status, calculated by the server from the date of birth (age 60 = eligible, 59 = approaching).
// The HR Manager reviews the employee, starts the retirement process, approves it in the existing HR case workflow (official retirement date + remarks), and downloads the letter.
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { tx, tv } from '../i18n/index.js'; import api from '../api'; import { can } from '../auth.js';
import { Msg, Field, Modal, useLoad, useSearch, Loading, dOnly, dt, qs, downloadFile, errMsg } from '../ui.jsx';
import { CaseView } from './Directive.jsx';

const LABEL = { active: 'Active employee', approaching: 'Approaching retirement', eligible: 'Eligible for retirement', completed: 'Retirement process completed' };
export const RPill = ({ s }) => <span className={'pill st-rt-' + s}>{tx(LABEL[s] || s)}</span>;
const LANGS = [['am', 'አማርኛ (Amharic)'], ['en', 'English'], ['both', 'አማርኛ + English']];
const svc = (s) => (s ? [s.years && `${s.years} ${tx('years')}`, s.months && `${s.months} ${tx('months')}`].filter(Boolean).join(' ') || `0 ${tx('months')}` : '—');
async function pdfUrl(id) { const r = await fetch(`/api/retirement/letters/${id}/pdf`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }); if (!r.ok) throw new Error('The letter could not be opened'); return URL.createObjectURL(await r.blob()); }
function printPdf(url) { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; f.src = url; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); } setTimeout(() => f.remove(), 60000); }; document.body.appendChild(f); }

function Detail({ id, user, onClose, onChange }) {
  const d = useLoad(() => api('/retirement/employees/' + id), [id]), types = useLoad(() => api('/hr-cases/types')), x = d.data, hr = can(user, 'cases.manage');
  const [remarks, setRemarks] = useState(''), [lang, setLang] = useState('am'), [msg, setMsg] = useState({}), [busy, setBusy] = useState(false), [caseId, setCaseId] = useState(null);
  const run = async (fn, ok) => { setBusy(true); setMsg({}); try { const out = await fn(); setMsg({ ok }); d.reload(); onChange(); return out; } catch (e) { setMsg({ err: errMsg(e) }); } finally { setBusy(false); } };
  useEffect(() => { setMsg({}); }, [id]);
  if (!x) return <Modal title="Retirement details" onClose={onClose}>{d.err ? <Msg err={d.err} /> : <Loading />}</Modal>;
  const a = x.actions, ap = x.approved_case, I = (k, v) => <div><small className="muted">{tx(k)}</small><div>{v ?? '—'}</div></div>;
  return <Modal title="Retirement details" onClose={onClose}>
    <div className="row"><b>{x.full_name}</b><RPill s={x.status} /><span className="muted">{x.employee_no}</span></div><Msg err={msg.err} ok={msg.ok} />
    <div className="card"><h4>{tx('Employment information')}</h4><div className="grid">
      {I('Gender', tv(x.gender))}{I('Date of birth', dOnly(x.date_of_birth))}{I('Current age', <b>{x.age}</b>)}{I('Department', x.department)}{I('Job position', x.job_title)}{I('Employment start date', dOnly(x.hire_date))}{I('Length of service', svc(x.service))}
      {I('Retirement age', `${x.retirement_age} ${tx('years')}`)}{I('Retirement eligibility date', <b>{dOnly(x.retirement_eligibility_date)}</b>)}{x.status === 'approaching' && I('Days until eligible', x.days_to_eligibility)}
      {x.official_retirement_date && I('Official retirement date', <b>{dOnly(x.official_retirement_date)}</b>)}</div>
      <p className="muted">{tx('The age is calculated automatically from the date of birth in the employee record. The employment start date plays no part in it.')}</p></div>
    <div className="card"><h4>{tx('Retirement process')}</h4>
      {x.status === 'active' && <p className="muted">{tx('This employee has not reached the retirement age yet.')}</p>}
      {x.status === 'approaching' && <p className="muted">{tx('This employee is approaching retirement. The process can be started on the eligibility date.')}</p>}
      {a.initiate && <><Field label="Remarks (optional)" type="textarea" wide value={remarks} onChange={setRemarks} /><div className="row"><button disabled={busy} onClick={async () => { const c = await run(() => api(`/retirement/employees/${x.id}/initiate`, { method: 'POST', body: { remarks } }), 'The retirement process was started'); if (c) setCaseId(c.id); }}>{tx('Initiate retirement processing')}</button></div></>}
      {hr && !a.initiate && x.status === 'eligible' && !x.open_case_id && !ap && <p className="muted">{tx('You cannot start the process for this employee.')}</p>}
      {(x.open_case_id || ap) && <div className="row"><span>{tx('Retirement case')}: <b>{x.open_case_ref || ap.ref_no}</b></span><button className="ghost" onClick={() => setCaseId(x.open_case_id || ap.id)}>{tx('Open retirement case')}</button></div>}
      {x.open_case_id && <p className="muted">{tx('In the case: HR reviews and recommends, then the HR Manager approves, records the official retirement date and the decision remarks, and completes it.')}</p>}
      {ap && <div className="grid">{I('Decision', tv(ap.decision))}{I('Approved by', ap.decided_by_name)}{I('Official retirement date', ap.effective_date ? dOnly(ap.effective_date) : '—')}{I('Remarks', (ap.data && ap.data.remarks) || ap.decision_reason)}</div>}
    </div>
    {(a.letter || x.letter) && <div className="card"><h4>{tx('Retirement letter')}</h4>
      {x.letter ? <div className="row"><b>{x.letter.ref_no}</b><small className="muted">{dt(x.letter.issued_at)}</small><button className="ghost" onClick={() => downloadFile(`/retirement/letters/${x.letter.id}/pdf?download=1`, `Retirement-Letter-${x.letter.ref_no}.pdf`).catch((e) => setMsg({ err: errMsg(e) }))}>{tx('Download PDF')}</button><button className="ghost" onClick={async () => { try { printPdf(await pdfUrl(x.letter.id)); } catch (e) { setMsg({ err: errMsg(e) }); } }}>{tx('Print')}</button></div>
        : <><p className="muted">{tx('The letter uses the official retirement date recorded in the approved case. It is saved in the employee file.')}</p><button disabled={busy} onClick={() => run(() => api(`/retirement/employees/${x.id}/letter`, { method: 'POST', body: { language: lang } }), 'The retirement letter was issued')}>{tx('Generate retirement letter')}</button></>}</div>}
    {x.milestones.length > 0 && <div className="card"><h4>{tx('Retirement notifications')}</h4>{x.milestones.map((m) => <div key={m.milestone}><b>{tx(m.milestone === 'eligible' ? 'Eligible for retirement' : 'Approaching retirement')}</b> — {dOnly(m.reached_on)} <small className="muted">{tx('HR Manager notified')}: {m.notified_at ? dt(m.notified_at) : '—'}</small></div>)}</div>}
    {x.events.length > 0 && <div className="card"><h4>{tx('Retirement history')}</h4>{x.events.map((v) => <div key={v.id}><small className="muted">{dt(v.at)} · {v.by_name || '—'}</small> <b>{tv(v.action)}</b>{v.to_stage ? ` → ${tv(v.to_stage)}` : ''}{v.note ? ` — ${v.note}` : ''}</div>)}</div>}
    {caseId && types.data && <CaseView id={caseId} user={user} types={types.data} onClose={() => { setCaseId(null); d.reload(); onChange(); }} reload={() => { d.reload(); onChange(); }} />}
  </Modal>;
}

export default function RetirementManagement({ user, onRule }) {
  const [sp, setSp] = useSearchParams(), [status, setStatus] = useState(sp.get('status') || 'attention'), [dept, setDept] = useState(''), [sort, setSort] = useState({ k: '', dir: 'asc' }), [page, setPage] = useState(1), [sv, setSv, sd] = useSearch(), [sel, setSel] = useState(Number(sp.get('employee')) || null), [k, setK] = useState(0);
  const L = useLoad(() => api('/lookups')), d = useLoad(() => api('/retirement/overview' + qs({ q: sd, department_id: dept, status, sort: sort.k, dir: sort.dir, page })), [sd, dept, status, sort.k, sort.dir, page, k]);
  const pick = (s) => { setStatus(s); setPage(1); setSort({ k: '', dir: 'asc' }); };
  const by = (key) => setSort((s) => ({ k: key, dir: s.k === key && s.dir === 'asc' ? 'desc' : 'asc' })), arrow = (key) => (sort.k === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const o = d.data, st = o && o.stats;
  const close = () => { setSel(null); if (sp.get('employee')) { const n = new URLSearchParams(sp); n.delete('employee'); setSp(n, { replace: true }); } };
  return <div><div className="card"><h4>{tx('Retirement management')}</h4>
    {o && !o.configured && <div className="warnbox">{tx('The retirement age is not configured. Set it in "Retirement rule in force" below.')}</div>}
    {o && o.configured && <p className="muted">{tx('Retirement age')}: <b>{o.retirement_age} {tx('years')}</b> · {tx('Ages are calculated automatically from each employee\'s date of birth, using today\'s date')} ({dOnly(o.today)}).{st.missing_date_of_birth > 0 && <span className="err"> {st.missing_date_of_birth} {tx('employees have no date of birth and cannot be checked.')}</span>}</p>}
    <Msg err={d.err} />
    {st && <div className="rt-stats">{[['approaching', 'Approaching retirement', st.approaching, '59'], ['eligible', 'Eligible for retirement', st.eligible, '60+'], ['completed', 'Retirement process completed', st.completed, ''], ['active', 'Active employee', st.active, '']].map(([s, l, n, h]) => <button key={s} className={status === s ? 'on' : ''} onClick={() => pick(s)}><b>{n}</b><small>{tx(l)}</small></button>)}<button className={status === 'attention' ? 'on' : ''} onClick={() => pick('attention')}><b>{st.approaching + st.eligible}</b><small>{tx('Needs attention (approaching + eligible)')}</small></button><div style={{ padding: '12px 14px' }}><b style={{ fontSize: 26, display: 'block' }}>{st.in_process}</b><small>{tx('Retirement processes in progress')}</small></div></div>}
    <div className="row"><input placeholder={tx('Search by employee name or ID')} value={sv} onChange={(e) => { setSv(e.target.value); setPage(1); }} />
      <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}><option value="">{tx('All departments')}</option>{(L.data ? L.data.departments : []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select value={status} onChange={(e) => pick(e.target.value)}><option value="attention">{tx('Approaching and eligible')}</option>{Object.entries(LABEL).map(([s, l]) => <option key={s} value={s}>{tx(l)}</option>)}<option value="all">{tx('All')}</option></select></div>
    {d.loading && !o ? <Loading /> : o && o.configured && <><table><thead><tr><th className="sortable" onClick={() => by('name')}>{tx('Employee')}{arrow('name')}</th><th>{tx('ID')}</th><th>{tx('Gender')}</th><th>{tx('Date of birth')}</th><th className="sortable" onClick={() => by('age')}>{tx('Age')}{arrow('age')}</th><th className="sortable" onClick={() => by('department')}>{tx('Department')}{arrow('department')}</th><th>{tx('Job position')}</th><th>{tx('Employment start date')}</th><th className="sortable" onClick={() => by('retirement_date')}>{tx('Retirement eligibility date')}{arrow('retirement_date')}</th><th>{tx('Status')}</th><th /></tr></thead><tbody>
      {o.rows.map((r) => <tr key={r.id}><td><b>{r.full_name}</b></td><td>{r.employee_no}</td><td>{tv(r.sex)}</td><td>{dOnly(r.date_of_birth)}</td><td><b>{r.age}</b></td><td>{r.department || '—'}</td><td>{r.job_title || '—'}</td><td>{dOnly(r.hire_date)}</td><td>{dOnly(r.retirement_eligibility_date)}{r.official_retirement_date && <><br /><small className="muted">{tx('Official')}: {dOnly(r.official_retirement_date)}</small></>}</td><td><RPill s={r.status} />{r.open_case_ref && <><br /><small className="muted">{r.open_case_ref}</small></>}</td><td><button className="ghost small" onClick={() => setSel(r.id)}>{tx('Open')}</button></td></tr>)}
      {!o.rows.length && <tr><td colSpan="11" className="muted">{tx('Nothing to show yet.')}</td></tr>}</tbody></table>
      {o.total > o.page_size && <div className="row"><button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tx('Previous')}</button><span className="muted">{page} / {Math.ceil(o.total / o.page_size)}</span><button className="ghost" disabled={page * o.page_size >= o.total} onClick={() => setPage(page + 1)}>{tx('Next')}</button></div>}</>}
  </div>{sel && <Detail id={sel} user={user} onClose={close} onChange={() => { setK((x) => x + 1); if (onRule) onRule(); }} />}</div>;
}

// compact retirement record on the employee profile (HR only): status, eligibility date, process / letter
export function RetirementCard({ e, user }) {
  const d = useLoad(() => (can(user, 'cases.manage') || can(user, 'cases.view') ? api('/retirement/employees/' + e.id).catch(() => null) : Promise.resolve(null)), [e.id]), x = d.data, [open, setOpen] = useState(false);
  if (!x) return null;
  return <div className="card"><h4>{tx('Retirement')}</h4><div className="row"><RPill s={x.status} /><span>{tx('Age')}: <b>{x.age}</b></span><span>{tx('Retirement eligibility date')}: <b>{dOnly(x.retirement_eligibility_date)}</b></span></div>
    {x.official_retirement_date && <p>{tx('Official retirement date')}: <b>{dOnly(x.official_retirement_date)}</b></p>}{x.letter && <p><small className="muted">{tx('Retirement letter')}: {x.letter.ref_no}</small></p>}
    <button className="ghost small" onClick={() => setOpen(true)}>{tx('Retirement details')}</button>{open && <Detail id={e.id} user={user} onClose={() => { setOpen(false); d.reload(); }} onChange={d.reload} />}</div>;
}
