// Roles and permissions. `init.js` inserts what is missing; permissions an administrator already edited are never overwritten.
// Every signed-in employee can always use self-service (own profile, leave, attendance, appraisal) without any permission.
const PERMISSIONS = [
  ['hr.view_all', 'employees', 'See the profiles of all employees (non-sensitive fields)'],
  ['employees.manage', 'employees', 'Hire, edit and transfer employees'],
  ['employees.sensitive', 'employees', 'See national ID, TIN, pension number and bank account'],
  ['salary.view', 'employees', 'See salaries and allowances'],
  ['salary.manage', 'employees', 'Change salaries and allowances'],
  ['documents.view_all', 'employees', 'Open the personnel documents of all employees'],
  ['documents.manage', 'employees', 'Upload personnel documents for any employee'],
  ['org.manage', 'organization', 'Manage departments and positions'],
  ['team.view', 'team', 'See the profiles and attendance of one\'s reporting line (manager)'],
  ['leave.approve', 'leave', 'Approve or reject leave of direct reports'],
  ['leave.manage', 'leave', 'See all leave, approve any request, adjust balances'],
  ['attendance.view_all', 'attendance', 'See attendance of all employees'],
  ['attendance.manage', 'attendance', 'Approve attendance corrections and enter attendance manually'],
  ['recruitment.manage', 'recruitment', 'Manage vacancies and applicants'],
  ['performance.manage', 'performance', 'Open appraisal cycles and finalize appraisals'],
  ['performance.review', 'performance', 'Score the appraisals of direct reports'],
  ['training.manage', 'training', 'Record training for employees'],
  ['separations.manage', 'separations', 'Run resignations, terminations and clearance'],
  ['announcements.manage', 'announcements', 'Publish announcements'],
  ['reports.view', 'reports', 'Open HR reports and statistics'],
  ['accounts.manage', 'admin', 'Create and disable login accounts for employees'],
  ['users.manage', 'admin', 'Manage all user accounts and reset passwords'],
  ['roles.manage', 'admin', 'Edit what each role may do'],
  ['config.manage', 'admin', 'Manage leave types, holidays and system settings'],
  ['audit.view', 'admin', 'Read the audit trail'],
  ['audit.view_hr', 'admin', 'Read the audit trail of HR records only (employees, HR cases, leave, uniforms, plans); not accounts or settings'],
  ['email.view', 'admin', 'Read the e-mail log and resend e-mails'],
  // --- directive-based HR modules (migration 002)
  ['fayda.view', 'employees', 'See Fayda / digital ID numbers unmasked (confidential)'],
  ['positions.manage', 'organization', 'Manage permanent staff positions and assign them to employees'],
  ['cases.view', 'cases', 'See HR cases (appointment, promotion, transfer, retirement ...) of all employees'],
  ['cases.manage', 'cases', 'Register, review and prepare HR cases and recommendations'],
  ['cases.decide_hr', 'cases', 'Take the final decision on HR cases as the HR department authority (never on one\'s own case)'],
  ['ppe.exception', 'uniforms', 'Issue uniforms or work tools beyond the authorized quantity or before the waiting period ends, with a documented authorization'],
  ['cases.authorize', 'cases', 'Designate named HR officers to decide for the HR authority, and set whether a case type needs a recommendation'],
  ['discipline.manage', 'discipline', 'Register and investigate disciplinary cases (confidential)'],
  ['service.manage', 'employees', 'Maintain and verify work-experience / service history'],
  ['ppe.manage', 'ppe', 'Manage uniform and work-equipment entitlements, stock and issues'],
  ['plans.manage', 'plans', 'Prepare the annual HR plan and record progress'],
  ['plans.approve', 'plans', 'Approve the annual HR plan and its year-end evaluation'],
  ['import.manage', 'admin', 'Preview, apply and roll back employee-register imports'],
  ['employment.confirm', 'employees', 'Confirm or decline permanent employment when the probation period is completed'],
];
// permissions added after the first release. Existing roles are not rewritten by init (administrators may have edited them),
// so init grants these once (migration marker grants-002) and only ever adds.
const NEW_GRANTS = {
  hr_manager: ['fayda.view', 'positions.manage', 'cases.view', 'cases.manage', 'discipline.manage', 'service.manage', 'ppe.manage', 'plans.manage', 'import.manage'],
  hr_officer: ['positions.manage', 'cases.view', 'cases.manage', 'service.manage', 'ppe.manage', 'plans.manage'],
  executive: ['cases.view', 'plans.approve'],
};
const ROLES = [
  { code: 'super_admin', name: 'Super Admin', description: 'Technical owner. Everything is allowed.', perms: '*' },
  { code: 'admin', name: 'System Admin', description: 'Manages accounts, roles and configuration. No access to employee records by default.', perms: ['users.manage', 'roles.manage', 'config.manage', 'audit.view', 'email.view'] },
  { code: 'hr_manager', name: 'HR Manager', description: 'Heads HR: all employee data, salaries, leave, recruitment, performance, separations, permanent-employment decisions.',
    perms: ['hr.view_all', 'employees.manage', 'employees.sensitive', 'salary.view', 'salary.manage', 'documents.view_all', 'documents.manage', 'org.manage', 'leave.approve', 'leave.manage', 'attendance.view_all', 'attendance.manage', 'recruitment.manage', 'performance.manage', 'training.manage', 'separations.manage', 'announcements.manage', 'reports.view', 'accounts.manage'] },
  { code: 'hr_officer', name: 'HR Officer', description: 'Day-to-day HR administration: records, leave, attendance, recruitment, training. No salaries.',
    perms: ['hr.view_all', 'employees.manage', 'employees.sensitive', 'documents.view_all', 'documents.manage', 'leave.manage', 'attendance.view_all', 'attendance.manage', 'recruitment.manage', 'training.manage', 'separations.manage', 'announcements.manage', 'reports.view', 'accounts.manage'] },
  { code: 'executive', name: 'Executive', description: 'Management view of the workforce and reports.', perms: ['hr.view_all', 'salary.view', 'reports.view'] },
  { code: 'manager', name: 'Line Manager', description: 'Manages a team: approves leave, scores appraisals, sees team attendance.', perms: ['team.view', 'leave.approve', 'performance.review'] },
  { code: 'secretary', name: 'Secretary', description: 'Office support: sees the staff directory and attendance, publishes announcements. No salaries, no sensitive IDs, no approvals.', perms: ['hr.view_all', 'attendance.view_all', 'announcements.manage'] },
  { code: 'employee', name: 'Employee', description: 'Self-service: own profile, leave, attendance and appraisal.', perms: [] },
];
for (const r of ROLES) if (Array.isArray(r.perms) && NEW_GRANTS[r.code]) r.perms = [...new Set([...r.perms, ...NEW_GRANTS[r.code]])];
// granted once more in migration marker grants-003 (separate marker so databases that already ran grants-002 receive it too)
const GRANTS_003 = { hr_manager: ['audit.view_hr'] };
const GRANTS_011 = { hr_manager: ['ppe.exception'] };   // only the HR Manager can authorize an exception
const GRANTS_009 = { hr_manager: ['cases.decide_hr', 'cases.authorize'] };   // only the HR Manager; HR officers are designated by name (authority_delegates)
const GRANTS_007 = { hr_manager: ['employment.confirm'], hr_officer: ['employment.confirm'] };
for (const r of ROLES) if (Array.isArray(r.perms) && GRANTS_003[r.code]) r.perms = [...new Set([...r.perms, ...GRANTS_003[r.code]])];
for (const r of ROLES) if (Array.isArray(r.perms) && GRANTS_011[r.code]) r.perms = [...new Set([...r.perms, ...GRANTS_011[r.code]])];
for (const r of ROLES) if (Array.isArray(r.perms) && GRANTS_009[r.code]) r.perms = [...new Set([...r.perms, ...GRANTS_009[r.code]])];
for (const r of ROLES) if (Array.isArray(r.perms) && GRANTS_007[r.code]) r.perms = [...new Set([...r.perms, ...GRANTS_007[r.code]])];
module.exports = { PERMISSIONS, ROLES, NEW_GRANTS, GRANTS_003, GRANTS_007, GRANTS_009, GRANTS_011 };
