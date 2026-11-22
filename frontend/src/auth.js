// Who is signed in and what they may do. The server enforces every permission again; this only decides what to show.
export const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };
export const saveUser = (u) => localStorage.setItem('user', JSON.stringify(u));
// HR work belongs to the HR department alone: the all-rights technical account does not get these (same list as the backend)
const HR_ONLY = ['cases.manage', 'cases.decide_hr', 'cases.authorize', 'discipline.manage', 'recruitment.manage', 'separations.manage', 'ppe.manage', 'ppe.exception', 'employment.confirm'];
export const can = (u, ...codes) => !!u && (u.role === 'super_admin' ? codes.some((c) => !HR_ONLY.includes(c)) : codes.some((c) => (u.permissions || []).includes(c)));
// Colours per role live in styles.css as html[data-role="..."]; the attribute is removed again on sign-out.
export function applyRoleTheme(role) { if (role) document.documentElement.dataset.role = role; else delete document.documentElement.dataset.role; }
export const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'System Admin', hr_manager: 'HR Manager', hr_officer: 'HR Officer', executive: 'Executive', manager: 'Line Manager', secretary: 'Secretary', employee: 'Employee' };
