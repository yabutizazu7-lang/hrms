// Work Experience Certificate – የሥራ ልምድ ማስረጃ
// HR: employees whose Recommendation Letter was issued, prepare / preview / approve & issue, certificate records, signature & stamp.
// Employee: their own issued certificate(s). Every rule is enforced by the server; the buttons only follow what the server reports.
import { useState, useEffect } from 'react';
import { tx, tv } from '../i18n/index.js'; import api from '../api'; import { can } from '../auth.js';
import { Pill, Msg, Field, Modal, useLoad, useSearch, Loading, dOnly, dt, qs, downloadFile, readBase64, errMsg } from '../ui.jsx';

const slug = (c) => `Work-Experience-Certificate-${c.ref_no}.pdf`;
const svc = (s) => (s ? [s.years && `${s.years} ${tx('years')}`, s.months && `${s.months} ${tx('months')}`, s.days && `${s.days} ${tx('days')}`].filter(Boolean).join(' ') || `0 ${tx('months')}` : '—');
const Tabs = ({ tabs, tab, setTab }) => <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{tx(l)}</button>)}</div>;
const Pager = ({ page, size, total, set }) => total > size ? <div className="row"><button className="ghost" disabled={page <= 1} onClick={() => set(page - 1)}>{tx('Previous')}</button><span className="muted">{page} / {Math.ceil(total / size)}</span><button className="ghost" disabled={page * size >= total} onClick={() => set(page + 1)}>{tx('Next')}</button></div> : null;
const LANGS = [['am', 'አማርኛ (Amharic)'], ['en', 'English'], ['both', 'አማርኛ + English']];

// the PDF is fetched with the user's token and shown in a frame (a plain link cannot send the Authorization header)
async function pdfUrl(id, lang) { const r = await fetch(`/api/work-certificates/${id}/pdf${lang ? '?lang=' + lang : ''}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Preview failed'); return URL.createObjectURL(await r.blob()); }
function printPdf(url) { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; f.src = url; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); } setTimeout(() => f.remove(), 60000); }; document.body.appendChild(f); }

function Certificate({ id, user, onClose, onChange }) {
  const d = useLoad(() => api('/work-certificates/' + id), [id]), c = d.data, [resp, setResp] = useState(''), [lang, setLang] = useState('am'), [url, setUrl] = useState(''), [msg, setMsg] = useState({}), [busy, setBusy] = useState(false), [reason, setReason] = useState(''), [mode, setMode] = useState('');
  useEffect(() => { if (c) { setResp(c.responsibilities || ''); setLang('am'); } }, [c && c.id, c && c.updated_at]); // eslint-disable-line
  useEffect(() => { if (!c) return undefined; let u = ''; setUrl(''); pdfUrl(c.id, c.status === 'draft' ? lang : '').then((x) => { u = x; setUrl(x); }).catch((e) => setMsg({ err: errMsg(e) })); return () => u && URL.revokeObjectURL(u); }, [c && c.id, c && c.updated_at, c && c.status, c && c.status === 'draft' ? lang : '']); // eslint-disable-line
  const run = async (fn, ok) => { setBusy(true); setMsg({}); try { await fn(); setMsg({ ok }); setMode(''); setReason(''); d.reload(); onChange(); } catch (e) { setMsg({ err: errMsg(e) }); } setBusy(false); };
  if (!c) return <Modal title="Work Experience Certificate" onClose={onClose}>{d.err ? <Msg err={d.err} /> : <Loading />}</Modal>;
  const a = c.actions, s = c.snapshot, draft = c.status === 'draft';
  return <Modal title="Work Experience Certificate" onClose={onClose}>
    <div className="row"><b>{c.ref_no}</b><Pill s={c.status} /><span className="muted">{c.full_name} · {c.employee_no}</span></div><Msg err={msg.err} ok={msg.ok} />
    <div className="card"><div className="grid">
      <div><small className="muted">{tx('Job title')}</small><div>{s.job.title_am || s.job.title}{s.job.title_am && s.job.title && s.job.title_am !== s.job.title ? ` / ${s.job.title}` : ''}</div></div>
      <div><small className="muted">{tx('Department')}</small><div>{s.job.department || '—'}</div></div>
      <div><small className="muted">{tx('Employment start date')}</small><div>{dOnly(s.employment.start_date)}</div></div>
      <div><small className="muted">{tx('Employment end date')}</small><div>{s.employment.end_date ? dOnly(s.employment.end_date) : tx('Still employed')}</div></div>
      <div><small className="muted">{tx('Total service')}</small><div><b>{svc(s.employment.service)}</b></div></div>
      <div><small className="muted">{tx('Recommendation letter')}</small><div>{c.recommendation_ref}</div></div>
      {c.issue_date && <div><small className="muted">{tx('Issue date')}</small><div>{dOnly(c.issue_date)}</div></div>}
      {c.approved_by_name && <div><small className="muted">{tx('Approved by')}</small><div>{c.approved_by_name}{c.approved_by_title ? ` · ${c.approved_by_title}` : ''}</div></div>}
      {c.supersedes_ref && <div><small className="muted">{tx('Replaces')}</small><div>{c.supersedes_ref} — {c.reissue_reason}</div></div>}
      {c.cancel_reason && <div className="wide"><small className="muted">{tx('Cancelled')}</small><div>{c.cancel_reason}</div></div>}
    </div></div>
    {a.edit && <div className="card"><h4>{tx('Edit draft')}</h4><div className="grid">
      <Field label="Work responsibilities (one per line)" type="textarea" wide value={resp} onChange={setResp} hint="Typed by HR: the employee record has no responsibilities, so nothing is invented. Leave empty to omit the section." /></div>
      <div className="row"><button disabled={busy} onClick={() => run(() => api('/work-certificates/' + c.id, { method: 'PUT', body: { language: lang, responsibilities: resp } }), 'Draft saved')}>{tx('Save draft')}</button>
        <button className="ghost" disabled={busy} onClick={() => run(() => api(`/work-certificates/${c.id}/refresh`, { method: 'POST', body: {} }), 'Data read again from the database')}>{tx('Refresh data')}</button></div></div>}
    <div className="card"><h4>{draft ? tx('Preview (draft, not valid until issued)') : tx('Certificate')}</h4>
      {url ? <iframe title="certificate" src={url} style={{ width: '100%', height: 560, border: '1px solid #d5dde2', borderRadius: 6 }} /> : <Loading />}
      <div className="row"><button className="ghost" disabled={!url} onClick={() => downloadFile(`/work-certificates/${c.id}/pdf${draft ? '?lang=' + lang : '?download=1'}`, slug(c)).catch((e) => setMsg({ err: errMsg(e) }))}>{tx('Download PDF')}</button>
        <button className="ghost" disabled={!url} onClick={() => printPdf(url)}>{tx('Print')}</button></div></div>
    {(a.issue || a.cancel || a.reissue) && <div className="card"><h4>{tx('Actions')}</h4>
      {a.issue && c.assets && <p className="muted">{c.assets.my_signature ? tx('Your signature image will be placed on the certificate.') : tx('You have not uploaded a signature image: the signature area stays empty for a handwritten signature.')} {c.assets.stamp ? tx('The official stamp image will be placed on the certificate.') : tx('No stamp image is uploaded: the stamp area stays empty for the official stamp.')}</p>}
      {mode === 'issue' && <p className="ok">{tx('Issuing makes the certificate official: it is saved as a PDF in the employee file and can no longer be edited. Continue?')}</p>}
      {mode === 'cancel' && <Field label="Reason" type="textarea" wide required value={reason} onChange={setReason} />}
      <div className="row">
        {a.issue && (mode === 'issue' ? <><button disabled={busy} onClick={() => run(() => api(`/work-certificates/${c.id}/issue`, { method: 'POST', body: {} }), 'Certificate approved and issued')}>{tx('Yes, approve and issue')}</button><button className="ghost" onClick={() => setMode('')}>{tx('Back')}</button></> : <button disabled={busy || !!mode} onClick={() => setMode('issue')}>{tx('Approve and issue')}</button>)}
        {a.cancel && (mode === 'cancel' ? <><button className="danger" disabled={busy || reason.trim().length < 3} onClick={() => run(() => api(`/work-certificates/${c.id}/cancel`, { method: 'POST', body: { reason } }), 'Certificate cancelled')}>{tx('Confirm cancel')}</button><button className="ghost" onClick={() => setMode('')}>{tx('Back')}</button></> : <button className="ghost" disabled={busy || !!mode} onClick={() => setMode('cancel')}>{draft ? tx('Discard draft') : tx('Cancel certificate')}</button>)}
      </div></div>}
    {c.events.length > 0 && <div className="card"><h4>{tx('History')}</h4>{c.events.map((v) => <div key={v.id}><small className="muted">{dt(v.at)} · {v.by_name || '—'}</small> <b>{tv(v.action)}</b>{v.note ? ` — ${v.note}` : ''}</div>)}</div>}
  </Modal>;
}

function Prepare({ emp, user, onClose, onDone }) {
  const [lang, setLang] = useState('am'), [resp, setResp] = useState(''), [again, setAgain] = useState(false), [reason, setReason] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), issued = emp.certificate_status === 'issued';
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const c = await api('/work-certificates', { method: 'POST', body: { employee_id: emp.id, language: lang, responsibilities: resp, ...(issued ? { reissue: true, reissue_reason: reason } : {}) } }); onDone(c.id); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return <Modal title="Prepare Work Experience Certificate" onClose={onClose}><form onSubmit={go}><Msg err={err} />
    <p><b>{emp.full_name}</b> · {emp.employee_no} · {emp.department || '—'}<br /><small className="muted">{tx('Recommendation letter')}: {emp.recommendation_ref}</small></p>
    {issued && <><p className="err">{tx('A certificate has already been issued to this employee. Another one needs the HR Manager and a reason; the old one is kept in the history.')}</p><Field label="Reason for issuing another certificate" type="textarea" wide required value={reason} onChange={(v) => { setReason(v); setAgain(true); }} /></>}
    <div className="grid"><Field label="Work responsibilities (one per line)" type="textarea" wide value={resp} onChange={setResp} hint="Typed by HR: the employee record has no responsibilities, so nothing is invented. Leave empty to omit the section." /></div>
    <p className="muted">{tx('Name, ID, position, department, start/end dates and length of service are read from the employee record.')}</p>
    <div className="row"><button disabled={busy || (issued && !again)}>{tx('Generate draft')}</button><button type="button" className="ghost" onClick={onClose}>{tx('Cancel')}</button></div></form></Modal>;
}

function Employees({ user, open }) {
  const [state, setState] = useState(''), [page, setPage] = useState(1), [sv, setSv, sd] = useSearch(), [prep, setPrep] = useState(null), d = useLoad(() => api('/work-certificates/employees' + qs({ q: sd, state, page })), [sd, state, page]);
  return <><div className="row"><input placeholder={tx('Search name, ID or letter number')} value={sv} onChange={(e) => { setSv(e.target.value); setPage(1); }} />
    <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">{tx('All')}</option>{[['enabled', 'Ready for a certificate'], ['waiting', 'Recommendation not yet given'], ['draft', 'Draft prepared'], ['issued', 'Certificate issued']].map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></div>
    <Msg err={d.err} />{d.loading && !d.data ? <Loading /> : d.data && <div className="card"><table><thead><tr><th>{tx('Employee')}</th><th>{tx('Department')}</th><th>{tx('Recommendation letter')}</th><th>{tx('Certificate')}</th><th /></tr></thead><tbody>
      {d.data.rows.map((e) => <tr key={e.id}><td><b>{e.full_name}</b><br /><small className="muted">{e.employee_no}</small></td><td>{e.department || '—'}</td>
        <td>{e.recommendation_ref}<br /><Pill s={e.recommendation_stage} /></td>
        <td>{e.certificate_status ? <><Pill s={e.certificate_status} /><br /><small className="muted">{e.certificate_ref}{e.certificate_issue_date ? ' · ' + dOnly(e.certificate_issue_date) : ''}</small></> : <span className="muted">{e.enabled ? tx('Ready') : tx('Not enabled')}</span>}</td>
        <td>{e.certificate_id ? <button className="ghost small" onClick={() => open(e.certificate_id)}>{tx('Open')}</button> : null}{e.certificate_status === 'issued' && <><button className="ghost small" onClick={() => downloadFile(`/work-certificates/${e.certificate_id}/pdf?download=1`, `Work-Experience-Certificate-${e.certificate_ref}.pdf`).catch(() => {})}>{tx('Download PDF')}</button><button className="ghost small" onClick={async () => { try { printPdf(await pdfUrl(e.certificate_id)); } catch { /* shown when opened */ } }}>{tx('Print')}</button></>}{e.enabled && !e.certificate_id && <button className="small" onClick={() => setPrep(e)}>{tx('Prepare certificate')}</button>}{e.certificate_status === 'issued' && can(user, 'cases.decide_hr') && <button className="ghost small" onClick={() => setPrep(e)}>{tx('Issue another')}</button>}</td></tr>)}
      {!d.data.rows.length && <tr><td colSpan="5" className="muted">{tx('Nothing to show yet.')}</td></tr>}</tbody></table><Pager page={page} size={d.data.page_size} total={d.data.total} set={setPage} /></div>}
    {prep && <Prepare emp={prep} user={user} onClose={() => setPrep(null)} onDone={(id) => { setPrep(null); d.reload(); open(id); }} />}</>;
}

function Records({ user, open, reloadKey }) {
  const [f, setF] = useState({ status: '', from: '', to: '' }), [page, setPage] = useState(1), [sv, setSv, sd] = useSearch(), hr = can(user, 'cases.manage'), d = useLoad(() => api('/work-certificates' + qs({ q: sd, ...f, page })), [sd, f.status, f.from, f.to, page, reloadKey]);
  return <>{hr && <div className="row"><input placeholder={tx('Search name, ID or certificate number')} value={sv} onChange={(e) => { setSv(e.target.value); setPage(1); }} />
    <select value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }}><option value="">{tx('All statuses')}</option>{['draft', 'issued', 'superseded', 'cancelled'].map((s) => <option key={s} value={s}>{tv(s)}</option>)}</select>
    <label>{tx('From')} <input type="date" value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setPage(1); }} /></label><label>{tx('To')} <input type="date" value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setPage(1); }} /></label></div>}
    <Msg err={d.err} />{d.loading && !d.data ? <Loading /> : d.data && <div className="card"><table><thead><tr><th>{tx('Reference')}</th><th>{tx('Employee')}</th><th>{tx('Job title')}</th><th>{tx('Total service')}</th><th>{tx('Status')}</th><th>{tx('Issue date')}</th><th>{tx('Approved by')}</th><th /></tr></thead><tbody>
      {d.data.rows.map((c) => <tr key={c.id}><td>{c.ref_no}</td><td><b>{c.full_name}</b><br /><small className="muted">{c.employee_no}</small></td><td>{c.job_title}</td><td>{svc(c.service)}</td><td><Pill s={c.status} /></td><td>{c.issue_date ? dOnly(c.issue_date) : '—'}</td><td>{c.approved_by_name || '—'}</td>
        <td><button className="ghost small" onClick={() => open(c.id)}>{tx('Open')}</button>{c.status !== 'draft' && <><button className="ghost small" onClick={() => downloadFile(`/work-certificates/${c.id}/pdf?download=1`, slug(c)).catch(() => {})}>{tx('Download PDF')}</button><button className="ghost small" onClick={async () => { try { printPdf(await pdfUrl(c.id)); } catch { /* shown when opened */ } }}>{tx('Print')}</button></>}</td></tr>)}
      {!d.data.rows.length && <tr><td colSpan="8" className="muted">{tx('Nothing to show yet.')}</td></tr>}</tbody></table><Pager page={page} size={d.data.page_size} total={d.data.total} set={setPage} /></div>}</>;
}

function Assets({ user }) {
  const d = useLoad(() => api('/work-certificates/assets')), [msg, setMsg] = useState({}), auth = can(user, 'cases.decide_hr');
  const up = async (kind, file) => { if (!file) return; try { await api('/work-certificates/assets', { method: 'POST', body: { kind, filename: file.name, mime: file.type, data: await readBase64(file) } }); setMsg({ ok: 'Saved' }); d.reload(); } catch (e) { setMsg({ err: errMsg(e) }); } };
  const rm = async (kind) => { try { await api('/work-certificates/assets/' + kind, { method: 'DELETE' }); d.reload(); } catch (e) { setMsg({ err: errMsg(e) }); } };
  const box = (kind, label) => <div className="card"><h4>{tx(label)}</h4>{d.data[kind] ? <img alt={label} src={d.data[kind].data_url} style={{ maxWidth: 220, maxHeight: 120, background: '#fff', border: '1px solid #d5dde2' }} /> : <p className="muted">{tx('Not uploaded: the area stays empty on the certificate.')}</p>}
    {auth && <div className="row"><input type="file" accept="image/png,image/jpeg" onChange={(e) => { up(kind, e.target.files[0]); e.target.value = ''; }} />{d.data[kind] && <button className="ghost small" onClick={() => rm(kind)}>{tx('Remove')}</button>}</div>}</div>;
  return <><p className="muted">{tx('Images are uploaded by the HR Manager (PNG or JPEG, 1 MB at most). The system never draws a signature or stamp itself.')}</p><Msg err={d.err || msg.err} ok={msg.ok} />{d.data && <div className="grid">{box('signature', 'My signature (HR Manager)')}{box('stamp', 'Official organization stamp')}</div>}</>;
}

export default function WorkCertificates({ user }) {
  const hr = can(user, 'cases.manage'), [tab, setTab] = useState(hr ? 'employees' : 'records'), [sel, setSel] = useState(null), [k, setK] = useState(0), bump = () => setK((x) => x + 1);
  return <div><h2>{tx('Work Experience Certificate – የሥራ ልምድ ማስረጃ')}</h2>
    {hr ? <Tabs tab={tab} setTab={setTab} tabs={[['employees', 'Employees with a recommendation letter'], ['records', 'Certificate records'], ['assets', 'Signature & stamp']]} /> : <p className="muted">{tx('Your issued Work Experience Certificate can be downloaded here.')}</p>}
    {tab === 'employees' && hr && <Employees key={k} user={user} open={setSel} />}{tab === 'records' && <Records user={user} open={setSel} reloadKey={k} />}{tab === 'assets' && hr && <Assets user={user} />}
    {sel && <Certificate id={sel} user={user} onClose={() => { setSel(null); bump(); }} onChange={() => {}} />}</div>;
}
