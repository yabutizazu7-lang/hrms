// Who may decide: the HR Manager designates named HR officers to decide for the HR authority (nobody gets it automatically; a written reference is required).
import { useState } from 'react'; import api from '../api'; import { tx } from '../i18n/index.js'; import { can } from '../auth.js';
import { useLoad, Field, Msg, Loading, dt } from '../ui.jsx';

export function AuthorizedOfficers({ user }) {
  const [tick, setTick] = useState(0), [f, setF] = useState({ user_id: '', source_ref: '', note: '' }), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false), manage = can(user, 'cases.authorize');
  const list = useLoad(() => api('/approval-delegates'), [tick]), cand = useLoad(() => (manage ? api('/approval-delegates/candidates') : Promise.resolve([])), [tick]);
  const add = async (e) => { e.preventDefault(); setErr(''); setOk(''); setBusy(true); try { await api('/approval-delegates', { method: 'POST', body: { ...f, user_id: Number(f.user_id) } }); setF({ user_id: '', source_ref: '', note: '' }); setOk('The officer was designated.'); setTick((t) => t + 1); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const revoke = async (id) => { if (!window.confirm(tx('Withdraw this designation? The officer can no longer decide HR cases.'))) return; setErr(''); try { await api(`/approval-delegates/${id}/revoke`, { method: 'POST', body: {} }); setTick((t) => t + 1); } catch (x) { setErr(x.message); } };
  if (!list.data) return <Loading />;
  const active = list.data.filter((d) => !d.revoked_at), past = list.data.filter((d) => d.revoked_at);
  return (<div className="card"><h4>{tx('Authorized HR officers')}</h4>
    <p className="muted">{tx('The HR Manager decides for the HR authority. Other HR officers can decide only after being designated by name here, with the reference of the official designation. HR staff are never authorized automatically.')}</p><Msg err={err || list.err} ok={ok} />
    {manage && <form className="grid" onSubmit={add}><Field label="Officer" type="dropdown" required value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={(cand.data || []).map((u) => [u.id, `${u.name} (${u.email})`])} /><Field label="Reference of the official designation" required value={f.source_ref} onChange={(v) => setF({ ...f, source_ref: v })} maxLength={300} /><Field wide label="Note" value={f.note} onChange={(v) => setF({ ...f, note: v })} maxLength={500} /><div className="wide"><button disabled={busy || !f.user_id || !f.source_ref.trim()}>{tx('Designate')}</button></div></form>}
    <div className="scroll"><table><thead><tr><th>{tx('Officer')}</th><th>{tx('Reference of the official designation')}</th><th>{tx('Designated by')}</th><th>{tx('Designated on')}</th><th /></tr></thead><tbody>
      {active.map((d) => <tr key={d.id}><td><b>{d.name}</b><br /><small className="muted">{d.email}</small></td><td className="wrap-am">{d.source_ref}</td><td>{d.granted_by_name || '—'}</td><td>{dt(d.granted_at)}</td><td>{manage && <button className="small danger" onClick={() => revoke(d.id)}>{tx('Withdraw')}</button>}</td></tr>)}
      {!active.length && <tr><td colSpan="5" className="muted">{tx('No officer is designated: only the HR Manager decides for the HR authority.')}</td></tr>}</tbody></table></div>
    {past.length > 0 && <details><summary>{tx('Withdrawn designations')} ({past.length})</summary><table><tbody>{past.map((d) => <tr key={d.id}><td>{d.name}</td><td className="wrap-am">{d.source_ref}</td><td>{dt(d.granted_at)} → {dt(d.revoked_at)}</td></tr>)}</tbody></table></details>}
  </div>);
}
