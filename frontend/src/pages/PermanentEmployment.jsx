// Probation completion and permanent employment (the six-month rule). All dates and numbers come from the server; nothing is calculated here.
import { useState } from 'react'; import { Link, useLocation } from 'react-router-dom'; import api from '../api'; import { tx, tv } from '../i18n/index.js'; import { can } from '../auth.js';
import { useLoad, useLookups, useSearch, qs, Field, Modal, Msg, Loading, dt, dOnly } from '../ui.jsx';
const today = () => new Date().toISOString().slice(0, 10);
const Info = ({ rows }) => <div className="dl">{rows.filter((r) => r && r[1] !== undefined).map(([k, v]) => <div key={k}><small>{tx(k)}</small><b>{v || '—'}</b></div>)}</div>;
const ACTIONS = ['extend_probation', 'start_separation', 'other'];

// "Confirm Permanent Employment" / "Not approved" buttons with their forms (only for people with employment.confirm)
export function PermanentActions({ id, due, state, user, done }) {
  const [m, setM] = useState(null), [f, setF] = useState({}), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!can(user, 'employment.confirm') || (state !== 'awaiting_decision' && state !== 'not_approved')) return null;
  const open = (k) => { setErr(''); setF(k === 'confirm' ? { effective_date: today(), remarks: '' } : { reason: '', next_action: 'extend_probation', next_review_date: '', remarks: '' }); setM(k); };
  const send = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { await api(`/employees/${id}/permanent/${m}`, { method: 'POST', body: f }); setM(null); done && done(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (<>
    <button className="small" onClick={() => open('confirm')}>{tx('Confirm Permanent Employment')}</button>{state === 'awaiting_decision' && <button className="small ghost" onClick={() => open('decline')}>{tx('Not approved')}</button>}
    {m === 'confirm' && <Modal title={tx('Confirm Permanent Employment')} onClose={() => setM(null)}><form className="grid" onSubmit={send}><Msg err={err} />
      <Field label="Effective date" type="date" required value={f.effective_date} onChange={set('effective_date')} min={due} max={today()} /><Field wide label="Remarks" type="textarea" value={f.remarks} onChange={set('remarks')} maxLength={500} />
      <div className="wide"><button disabled={busy}>{tx('Confirm Permanent Employment')}</button></div></form></Modal>}
    {m === 'decline' && <Modal title={tx('Permanent employment is not approved')} onClose={() => setM(null)}><form className="grid" onSubmit={send}><Msg err={err} />
      <Field wide label="Reason" type="textarea" required value={f.reason} onChange={set('reason')} maxLength={500} /><Field label="Next action" type="select" required value={f.next_action} onChange={set('next_action')} options={ACTIONS.map((a) => [a, tv(a)])} />
      {f.next_action === 'extend_probation' && <Field label="New review date" type="date" required value={f.next_review_date} onChange={set('next_review_date')} min={today()} />}<Field wide label="Remarks" type="textarea" value={f.remarks} onChange={set('remarks')} maxLength={500} />
      <div className="wide"><button disabled={busy}>{tx('Save decision')}</button></div></form></Modal>}
  </>);
}

// the section on an employee's profile
export function PermanentCard({ e, user, reload }) {
  const p = e.probation; if (!p || p.state === 'not_applicable') return null;
  const ld = p.last_decision, hr = can(user, 'hr.view_all');
  return (<div className="card"><div className="bar"><h4>{tx('Permanent employment')}</h4><span className="row"><PermanentActions id={e.id} due={p.completion_date} state={p.state} user={user} done={reload} /></span></div>
    <Info rows={[['Employment Start Date', dOnly(p.start_date)], ['Current employment type', tv(p.employment_type)],
      p.completion_date ? ['Six-Month Completion Date', dOnly(p.completion_date)] : null, p.completion_date ? ['Remaining days', p.eligible ? tx('Completed') : `${p.remaining_days} ${tx('days')}`] : null,
      p.completion_date ? ['Eligible for Permanent Employment', p.eligible ? tx('Yes') : tx('Not yet')] : null, ['Status', tv(p.state)],
      ld ? ['Approval date', dt(ld.decided_at)] : null, ld && ld.effective_date ? ['Effective date', dOnly(ld.effective_date)] : null, ld ? ['Approved by', ld.decided_by_name] : null]} />
    {hr && p.reviews && p.reviews.length > 0 && <div className="scroll"><table><thead><tr><th>{tx('Six-Month Completion Date')}</th><th>{tx('Decision')}</th><th>{tx('Decided')}</th><th>{tx('Approved by')}</th><th>{tx('Reason')}</th><th>{tx('Next action')}</th><th>{tx('Remarks')}</th></tr></thead>
      <tbody>{p.reviews.map((r) => <tr key={r.id}><td>{dOnly(r.due_date)}</td><td>{tv(r.status === 'pending' ? 'awaiting_decision' : r.status)}</td><td>{r.decided_at ? dt(r.decided_at) : '—'}</td><td>{r.decided_by_name || '—'}</td><td>{r.reason || '—'}</td><td>{r.next_action ? tv(r.next_action) + (r.next_review_date ? ` → ${dOnly(r.next_review_date)}` : '') : '—'}</td><td>{r.remarks || '—'}</td></tr>)}</tbody></table></div>}
  </div>);
}

const VIEWS = [['all', 'All'], ['approaching', 'Approaching six months'], ['awaiting', 'Pending Approval'], ['confirmed', 'Confirmed permanent'], ['not_approved', 'Not approved']];
export function PermanentEmployment({ user }) {
  const L = useLookups(), loc = useLocation(), [q, setQ, dq] = useSearch(), [tick, setTick] = useState(0), [msg, setMsg] = useState('');
  const [f, setF] = useState({ view: new URLSearchParams(loc.search).get('view') || 'all', department_id: '', from: '', to: '' });
  const sum = useLoad(() => api('/permanent-employment/summary'), [tick]), list = useLoad(() => api('/permanent-employment' + qs({ ...f, q: dq })), [JSON.stringify(f), dq, tick]);
  const S = ({ label, v, view, tone }) => <button className={'card stat statbtn ' + (tone || '')} onClick={() => setF({ ...f, view })}><small>{tx(label)}</small><b>{v ?? '—'}</b></button>;
  const check = async () => { setMsg(''); try { const r = await api('/permanent-employment/check', { method: 'POST', body: {} }); setMsg(`${tx('Check completed.')} ${r.raised} ${tx('new reviews')}`); setTick((t) => t + 1); } catch (x) { setMsg(x.message); } };
  return (<div><div className="bar"><h2>{tx('Probation and permanent employment')}</h2>{can(user, 'employment.confirm') && <button className="ghost" onClick={check}>{tx('Check now')}</button>}</div>
    <p className="muted">{tx('An employee on probation becomes eligible for permanent employment when the probation period is completed. HR then confirms or records a decision; nothing changes automatically.')}{sum.data && ` ${tx('Probation period (months)')}: ${sum.data.probation_months}.`}</p><Msg err={list.err || sum.err} ok={msg} />
    <div className="stats">{sum.data ? <><S label="Approaching six months" v={sum.data.approaching} view="approaching" /><S label="Pending Approval" v={sum.data.awaiting_review} view="awaiting" tone={sum.data.awaiting_review ? 'warn' : ''} /><S label="Confirmed permanent" v={sum.data.confirmed} view="confirmed" /><S label="Decisions pending" v={sum.data.decision_pending} view="not_approved" /></> : <Loading />}</div>
    <div className="tabs">{VIEWS.map(([k, l]) => <button key={k} className={f.view === k ? 'on' : ''} onClick={() => setF({ ...f, view: k })}>{tx(l)}</button>)}</div>
    <div className="toolbar"><label>{tx('Search')}<input type="search" placeholder={tx('Name, employee no. or e-mail…')} value={q} onChange={(e) => setQ(e.target.value)} /></label><Field label="Department" type="select" value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} options={L.departments.map((d) => [d.id, d.name])} /><Field label="Employed from" type="date" value={f.from} onChange={(v) => setF({ ...f, from: v })} /><Field label="Employed to" type="date" value={f.to} onChange={(v) => setF({ ...f, to: v })} /></div>
    <div className="scroll"><table><thead><tr><th>{tx('No.')}</th><th>{tx('Name')}</th><th>{tx('Department')}</th><th>{tx('Employment Start Date')}</th><th>{tx('Type')}</th><th>{tx('Six-Month Completion Date')}</th><th>{tx('Remaining days')}</th><th>{tx('Status')}</th><th>{tx('Effective date')}</th><th /></tr></thead><tbody>
      {(list.data || []).map((x) => <tr key={x.id}><td>{x.employee_no}</td><td><Link to={`/employees/${x.id}`}><b>{x.full_name}</b></Link></td><td>{x.department || '—'}</td><td>{dOnly(x.start_date)}</td><td>{tv(x.employment_type)}</td><td>{x.completion_date ? dOnly(x.completion_date) : '—'}</td><td>{x.completion_date ? (x.eligible ? tx('Completed') : x.remaining_days) : '—'}</td><td><span className={'pill st-' + x.state}>{tv(x.state)}</span></td><td>{x.last_decision && x.last_decision.effective_date ? dOnly(x.last_decision.effective_date) : '—'}</td><td className="row"><PermanentActions id={x.id} due={x.completion_date} state={x.state} user={user} done={() => setTick((t) => t + 1)} /></td></tr>)}
      {list.data && !list.data.length && <tr><td colSpan="10" className="muted">{tx('Nothing to show yet.')}</td></tr>}</tbody></table></div></div>);
}
