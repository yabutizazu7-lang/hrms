import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useParams, useLocation, Link } from 'react-router-dom';
import { tx, tm, useLang } from './i18n/index.js'; import LanguageSwitcher from './i18n/LanguageSwitcher.jsx';
import api from './api'; import { getUser, saveUser, can, ROLE_LABEL, applyRoleTheme } from './auth.js'; import { Shield, Msg, useLoad } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx'; import { EmployeeList, EmployeeDetail, MyProfile } from './pages/Employees.jsx'; import Leave from './pages/Leave.jsx'; import Attendance from './pages/Attendance.jsx'; import Recruitment from './pages/Recruitment.jsx'; import { Performance, AppraisalView } from './pages/Performance.jsx'; import { Training, Separations, Announcements, Directory, OrgChart } from './pages/People.jsx'; import Reports from './pages/Reports.jsx';
import Home, { BrandPanel } from './pages/Home.jsx';
import { PermanentEmployment } from './pages/PermanentEmployment.jsx'; import { RegisterImport } from './pages/RegisterImport.jsx';
import WorkCertificates from './pages/WorkCertificates.jsx';
import { Cases, Staffing, Uniforms, HrPlans, Permanent, Retirement } from './pages/Directive.jsx';
import { Users, Rbac, Audit, EmailLog, Organization, LeaveConfig, SystemSettings } from './pages/Admin.jsx'; import { PublicLayout, Jobs, JobDetail, TrackApplication } from './pages/Public.jsx';

function Login({ user, onLogin }) {
  const [f, setF] = useState({ email: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" />;
  const go = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { const r = await api('/login', { method: 'POST', body: f }); const u = { ...r.user, permissions: r.permissions }; localStorage.setItem('token', r.token); saveUser(u); onLogin(u); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (<div className="auth-split"><BrandPanel /><div className="auth-side"><form className="card login" onSubmit={go}><h2>{tx('Sign in')}</h2><p className="muted" style={{ margin: 0 }}>{tx('Use your College account.')}</p><Msg err={err} />
      <label>{tx('Email')}<input type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
      <label>{tx('Password')}<input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
      <button disabled={busy}>{tx('Sign in')}</button><p className="muted"><Link to="/forgot">{tx('Forgot your password?')}</Link> · <Link to="/">{tx('Home')}</Link> · <Link to="/p/jobs">{tx('Careers')}</Link></p><small className="muted">{tx('Authorised personnel only. All activity is recorded.')}</small></form></div></div>);
}
function Forgot() {
  const [email, setEmail] = useState(''), [done, setDone] = useState(false), [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { await api('/forgot', { method: 'POST', body: { email } }); setDone(true); } catch (x) { setErr(x.message); } };
  return (<div className="login-page"><form className="card login" onSubmit={go}><h2>{tx('Forgot password')}</h2><Msg err={err} />
    {done ? <p className="ok">{tx('If this email belongs to an account, a reset link has been sent. Check your inbox (and spam).')}</p> : <><label>{tx('Your account email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button>{tx('Send reset link')}</button></>}
    <p className="muted"><Link to="/login">{tx('← Back to sign in')}</Link></p></form></div>);
}
function Reset() {
  const { token } = useParams(), [pw, setPw] = useState(''), [done, setDone] = useState(false), [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { await api('/reset', { method: 'POST', body: { token, password: pw } }); setDone(true); } catch (x) { setErr(x.message); } };
  return (<div className="login-page"><form className="card login" onSubmit={go}><h2>{tx('Choose a new password')}</h2><Msg err={err} />
    {done ? <p className="ok">{tx('Password changed.')} <Link to="/login">{tx('Sign in')}</Link></p> : <><label>{tx('New password (10+ characters, letters and numbers)')}<input type="password" minLength="10" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label><button>{tx('Save password')}</button></>}</form></div>);
}
function Account({ user, onDone }) {
  const [f, setF] = useState({ current: '', password: '', again: '' }), [err, setErr] = useState(''), [ok, setOk] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); setOk(''); if (f.password !== f.again) return setErr('The two new passwords are different'); try { await api('/change-password', { method: 'POST', body: { current: f.current, password: f.password } }); setOk('Password changed.'); setF({ current: '', password: '', again: '' }); onDone && onDone(); } catch (x) { setErr(x.message); } };
  return (<div><h2>{tx('My account')}</h2>
    <div className="card"><div className="dl"><div><small>{tx('Name')}</small><b>{user.name}</b></div><div><small>{tx('Email')}</small><b>{user.email}</b></div><div><small>{tx('Role')}</small><b>{tx(ROLE_LABEL[user.role] || user.role)}</b></div><div><small>{tx('Employee no.')}</small><b>{user.employee_no || '—'}</b></div><div><small>{tx('Department')}</small><b>{user.department || '—'}</b></div></div></div>
    <form className="card grid" onSubmit={go} style={{ maxWidth: 560 }}><h4 className="wide">{tx('Change password')}</h4><Msg err={err} ok={ok} />
      <label className="wide">{tx('Current password')}<input type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
      <label>{tx('New password (10+ characters, letters and numbers)')}<input type="password" autoComplete="new-password" minLength="10" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <label>{tx('Repeat the new password')}<input type="password" autoComplete="new-password" minLength="10" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></label>
      <div className="wide"><button>{tx('Save password')}</button></div></form></div>);
}

// Alerts shown as badges in the navigation. Refreshed every 30 seconds.
function useAlerts(user) {
  const [a, setA] = useState({});
  useEffect(() => {
    if (!user) return; let alive = true;
    const pull = () => api('/dashboard').then((d) => alive && setA({ leave: (d.team ? d.team.pending_leave : 0) + (d.leave_pending || 0), recruit: d.recruitment ? d.recruitment.new_applicants : 0, apprais: d.me && d.me.appraisal ? 1 : 0, retirement: d.retirement && d.retirement.configured ? d.retirement.approaching + d.retirement.eligible : 0, corrections: d.corrections_pending || (d.team ? d.team.corrections : 0) || 0 })).catch(() => {});
    pull(); const t = setInterval(pull, 30000); return () => { alive = false; clearInterval(t); };
  }, [user?.id]); // eslint-disable-line
  return a;
}
const Nav = ({ to, children, badge, end }) => <NavLink to={to} end={end}><span>{children}</span>{badge > 0 && <span className="badge">{badge}</span>}</NavLink>;

function Shell({ user, setUser }) {
  const [open, setOpen] = useState(false), loc = useLocation(), alerts = useAlerts(user);
  useEffect(() => { applyRoleTheme(user && user.role); return () => applyRoleTheme(null); }, [user && user.role]);
  useEffect(() => { if (user) api('/me').then((r) => { const u = { ...r.user, permissions: r.permissions }; saveUser(u); setUser(u); }).catch(() => {}); }, [loc.pathname === '/']); // eslint-disable-line
  if (!user) return <Navigate to={loc.pathname === '/' ? '/p/jobs' : '/login'} replace />;
  const c = (...p) => can(user, ...p), logout = () => { localStorage.clear(); setUser(null); }, emp = !!user.employee_id;
  if (user.must_change_password) return (<div className="layout"><header><b>{tx('Human Resource Management System')}</b><span className="hright"><LanguageSwitcher /><button className="ghost" onClick={logout}>{tx('Logout')}</button></span></header><nav /><main><div className="warnbox">{tx('You are using a temporary password. Choose a new one to continue.')}</div><Account user={user} onDone={() => { const u = { ...user, must_change_password: false }; saveUser(u); setUser(u); }} /></main></div>);
  const people = c('hr.view_all', 'team.view'), admin = c('users.manage', 'roles.manage', 'org.manage', 'config.manage', 'audit.view', 'audit.view_hr', 'email.view');
  return (<div className="layout">
    <header><span className="row"><button className="ghost menu" onClick={() => setOpen(!open)} aria-label="Menu">☰</button><span className="brandmark"><Shield /><span>{tx('Human Resource Management System')}<small>{user.department || tx(ROLE_LABEL[user.role] || user.role)}</small></span></span></span>
      <span className="hright"><LanguageSwitcher /><span className="who">{user.name}<small>{tx(ROLE_LABEL[user.role] || user.role)}</small></span><button className="ghost" onClick={logout}>{tx('Logout')}</button></span></header>
    <nav className={open ? 'open' : ''} onClick={() => setOpen(false)}>
      <Nav to="/" end>{tx('Dashboard')}</Nav>
      {emp && <><div className="sec">{tx('My work')}</div><Nav to="/me">{tx('My profile')}</Nav><Nav to="/attendance" badge={alerts.corrections}>{tx('Attendance')}</Nav><Nav to="/leave" badge={alerts.leave}>{tx('Leave')}</Nav><Nav to="/performance" badge={alerts.apprais}>{tx('Performance')}</Nav></>}
      <div className="sec">{tx('People')}</div>
      {people && <Nav to="/employees">{c('hr.view_all') ? tx('Employees') : tx('My team')}</Nav>}<Nav to="/directory">{tx('Directory')}</Nav><Nav to="/org">{tx('Organization chart')}</Nav>
      {c('recruitment.manage') && <Nav to="/recruitment" badge={alerts.recruit}>{tx('Recruitment')}</Nav>}{(c('training.manage') || emp) && <Nav to="/training">{tx('Training')}</Nav>}{c('separations.manage') && <Nav to="/separations">{tx('Separations')}</Nav>}<Nav to="/announcements">{tx('Announcements')}</Nav>
      <div className="sec">{tx('HR procedures')}</div>
      <Nav to="/cases">{c('cases.view', 'cases.manage', 'discipline.manage') ? tx('HR cases') : tx('My HR requests')}</Nav>
      {(c('cases.manage') || emp) && <Nav to="/work-certificates">{tx('Work Experience Certificate – የሥራ ልምድ ማስረጃ')}</Nav>}
      {c('import.manage') && <Nav to="/register-import">{tx('Employee register import')}</Nav>}
      {c('hr.view_all') && <Nav to="/permanent-employment">{tx('Probation and permanent employment')}</Nav>}
      {c('cases.manage', 'cases.view') && <Nav to="/permanent">{tx('Permanent employment')}</Nav>}
      {c('cases.manage', 'cases.view') && <Nav to="/retirement" badge={alerts.retirement}>{tx('Retirement')}</Nav>}
      {c('positions.manage', 'hr.view_all') && <Nav to="/staffing">{tx('Staffing and identifiers')}</Nav>}
      {(c('ppe.manage') || emp) && <Nav to="/uniforms">{tx('Uniform management')}</Nav>}
      {c('plans.manage', 'plans.approve', 'reports.view') && <Nav to="/hr-plans">{tx('Annual HR plan')}</Nav>}
      {c('reports.view') && <Nav to="/reports">{tx('Reports')}</Nav>}
      {admin && <div className="sec">{tx('Administration')}</div>}
      {c('users.manage') && <Nav to="/users">{tx('Users')}</Nav>}{c('roles.manage') && <Nav to="/permissions">{tx('Roles & Permissions')}</Nav>}{c('org.manage') && <Nav to="/organization">{tx('Departments & Positions')}</Nav>}
      {c('config.manage') && <><Nav to="/leave-config">{tx('Leave types & Holidays')}</Nav><Nav to="/system-settings">{tx('System settings')}</Nav></>}{c('audit.view', 'audit.view_hr') && <Nav to="/audit">{tx('Audit Trail')}</Nav>}{c('email.view') && <Nav to="/email">{tx('E-mail Log')}</Nav>}
      <div className="sec">{tx('Account')}</div><Nav to="/account">{tx('My account')}</Nav></nav>
    <main><Routes>
      <Route path="/" element={<Dashboard user={user} />} /><Route path="/account" element={<Account user={user} />} />
      {emp && <><Route path="/me" element={<MyProfile user={user} />} /><Route path="/attendance" element={<Attendance user={user} />} /><Route path="/leave" element={<Leave user={user} />} /><Route path="/performance" element={<Performance user={user} />} /><Route path="/performance/:id" element={<AppraisalView user={user} />} /></>}
      {people && <><Route path="/employees" element={<EmployeeList user={user} />} /><Route path="/employees/:id" element={<EmployeeDetail user={user} />} /></>}
      <Route path="/directory" element={<Directory />} /><Route path="/org" element={<OrgChart />} />
      {c('recruitment.manage') && <Route path="/recruitment" element={<Recruitment user={user} />} />}<Route path="/training" element={<Training user={user} />} />{c('separations.manage') && <Route path="/separations" element={<Separations user={user} />} />}<Route path="/announcements" element={<Announcements user={user} />} />
      {c('reports.view') && <Route path="/reports" element={<Reports />} />}
      {c('users.manage') && <Route path="/users" element={<Users user={user} />} />}{c('roles.manage') && <Route path="/permissions" element={<Rbac user={user} />} />}{c('org.manage') && <Route path="/organization" element={<Organization />} />}
      {c('config.manage') && <><Route path="/leave-config" element={<LeaveConfig />} /><Route path="/system-settings" element={<SystemSettings />} /></>}{c('audit.view', 'audit.view_hr') && <Route path="/audit" element={<Audit user={user} />} />}{c('email.view') && <Route path="/email" element={<EmailLog />} />}
      {(c('cases.manage') || emp) && <Route path="/work-certificates" element={<WorkCertificates user={user} />} />}
      <Route path="/cases" element={<Cases user={user} />} />
      {c('import.manage') && <Route path="/register-import" element={<RegisterImport user={user} />} />}
      {c('hr.view_all') && <Route path="/permanent-employment" element={<PermanentEmployment user={user} />} />}
      {c('cases.manage', 'cases.view') && <Route path="/permanent" element={<Permanent user={user} />} />}
      {c('cases.manage', 'cases.view') && <Route path="/retirement" element={<Retirement user={user} />} />}
      {c('positions.manage', 'hr.view_all') && <Route path="/staffing" element={<Staffing user={user} />} />}
      {(c('ppe.manage') || emp) && <Route path="/uniforms" element={<Uniforms user={user} />} />}
      {c('plans.manage', 'plans.approve', 'reports.view') && <Route path="/hr-plans" element={<HrPlans user={user} />} />}
      <Route path="*" element={<Navigate to="/" />} /></Routes></main></div>);
}
export default function App() {
  const [user, setUser] = useState(getUser); useLang();
  const loc = useLocation(), bare = /^\/(login|forgot|reset)/.test(loc.pathname);
  return (<>{bare && <div className="langfloat"><LanguageSwitcher /></div>}<Routes>
    <Route path="/forgot" element={<Forgot />} /><Route path="/reset/:token" element={<Reset />} /><Route path="/login" element={<Login user={user} onLogin={setUser} />} />
    <Route element={<PublicLayout user={user} />}><Route path="/p/jobs" element={<Jobs />} /><Route path="/p/jobs/:id" element={<JobDetail />} /><Route path="/p/track" element={<TrackApplication />} /></Route>
    <Route path="*" element={!user && loc.pathname === '/' ? <Home user={user} /> : <Shell user={user} setUser={setUser} />} /></Routes></>);
}
