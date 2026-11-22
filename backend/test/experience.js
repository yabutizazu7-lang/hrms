// Tests: automatic work-experience calculation (pure arithmetic + API, profile, lists, report, validation).
// Part A needs no database. Part B uses the DEVELOPMENT database (creates a few employees).
// Run: npm run db:init && npm run seed:all && npm run test:experience
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const S = require('../src/service');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }, sec = (t) => console.log('\n' + t);
const D = (t) => `${t.years}y ${t.months}m ${t.days}d`, X = (e, ps, asOf) => S.experience(e, ps, asOf), P = (start, end, verified = true, extra = {}) => ({ start_date: start, end_date: end, verified, is_current_institution: false, ...extra });
(async () => {
  sec('A1. Current service: less than a year, many years, "5 years, 7 months, 12 days"');
  ok(D(X({ hire_date: '2026-06-01' }, [], '2026-10-28').current) === '0y 4m 28d', 'started 1 June, today 28 Oct 2026: 0 years, 4 months, 28 days');
  ok(D(X({ hire_date: '2026-10-28' }, [], '2026-10-28').current) === '0y 0m 1d', 'started today = 1 day (first and last day count)');
  ok(D(X({ hire_date: '2018-03-15' }, [], '2026-10-28').current) === '8y 7m 14d', 'started 15 Mar 2018: 8 years, 7 months, 14 days');
  ok(D(X({ hire_date: '2021-03-16' }, [], '2026-10-28').current) === '5y 7m 13d', 'a five-year employee: 5 years, 7 months, 13 days (hired 16 Mar 2021)');
  ok(D(X({ hire_date: '2020-01-01' }, [], '2020-12-31').current) === '1y 0m 0d', 'a full calendar year is exactly 1 year');
  ok(X({ hire_date: '2018-03-15' }, [], '2026-10-28').total_verified.years === 8 && X({ hire_date: '2018-03-15' }, [], '2026-10-28').previous_verified.years === 0, 'no previous employment: total = current');
  ok(D(X({ hire_date: '2018-03-15' }, [], '2026-10-29').current) === '8y 7m 15d' && D(X({ hire_date: '2018-03-15' }, [], '2026-11-28').current) === '8y 8m 14d', 'the figure moves with the date (next day +1 day; next month +1 month)');

  sec('A2. Leap years and month ends');
  ok(D(X({ hire_date: '2020-02-29' }, [], '2021-02-28').current) === '1y 0m 0d', 'hired 29 Feb 2020: one year is complete on 28 Feb 2021');
  ok(D(X({ hire_date: '2020-02-29' }, [], '2021-02-27').current) === '0y 11m 30d', 'the day before: 11 months, 30 days');
  ok(D(X({ hire_date: '2020-02-29' }, [], '2024-02-29').current) === '4y 0m 1d', 'hired 29 Feb 2020, today 29 Feb 2024: 4 years and the day itself');
  ok(D(X({ hire_date: '2024-01-31' }, [], '2024-02-29').current) === '0y 1m 0d', '31 Jan -> 29 Feb (leap year) is one month');
  ok(D(X({ hire_date: '2023-01-31' }, [], '2023-02-28').current) === '0y 1m 0d', '31 Jan -> 28 Feb (common year) is one month');
  ok(D(X({ hire_date: '2024-01-31' }, [], '2024-03-30').current) === '0y 2m 0d', '31 Jan -> 30 Mar is two months');
  ok(D(X({ hire_date: '2023-12-31' }, [], '2024-01-30').current) === '0y 1m 0d', '31 Dec -> 30 Jan is one month');
  ok(D(X({ hire_date: '2023-01-30' }, [], '2023-03-29').current) === '0y 2m 0d' && D(X({ hire_date: '2023-01-31' }, [], '2023-03-29').current) === '0y 1m 29d', '30 Jan -> 29 Mar is 2 months; 31 Jan -> 29 Mar is 1 month 29 days (nothing negative, nothing lost)');
  let neg = false, mono = true, prev = -1; for (let i = 0; i < 4000; i++) { const t = Date.UTC(2019, 0, 31) + i * 86400000, d = new Date(t).toISOString().slice(0, 10), c = X({ hire_date: '2019-01-31' }, [], d).current; if (c.days < 0 || c.months < 0 || c.months > 11 || c.days > 30) neg = true; const k = (c.years * 12 + c.months) * 31 + c.days; if (c.total_days <= prev) mono = false; prev = c.total_days; }
  ok(!neg && mono, 'for a 31 January start, over 4 000 consecutive days: no negative or out-of-range part, the day count only grows');
  let calOk = true; for (const h of ['2020-02-29', '2024-01-31', '2023-03-31', '2019-08-30', '2022-12-31']) for (let i = 0; i < 1500; i += 7) { const a = Date.parse(h), b = new Date(a + i * 86400000).toISOString().slice(0, 10), c = X({ hire_date: h }, [], b).current; const back = Date.parse(h) + (c.total_days - 1) * 86400000; if (new Date(back).toISOString().slice(0, 10) !== b) calOk = false; }
  ok(calOk, 'the day count always equals the real number of calendar days from the start date to the date');

  sec('A3. Previous employment: several records, verified only');
  const base = { hire_date: '2020-01-01' }, asOf = '2026-01-01';
  const two = X(base, [P('2010-01-01', '2012-06-30'), P('2014-03-10', '2015-03-09')], asOf);
  ok(D(two.previous_verified) === '3y 6m 0d' && D(two.current) === '6y 0m 1d' && D(two.total_verified) === '9y 6m 1d', 'two verified previous periods (2y6m + 1y) + current 6y0m1d = 9y6m1d');
  ok(two.previous_count === 2 && two.previous_verified_count === 2 && two.previous_unverified === 0 && two.warnings.length === 0, 'both counted, no warnings');
  const unv = X(base, [P('2010-01-01', '2012-06-30'), P('2014-03-10', '2015-03-09', false)], asOf);
  ok(D(unv.previous_verified) === '2y 6m 0d' && D(unv.total_verified) === '8y 6m 1d' && unv.previous_unverified === 1, 'an unverified previous period is NOT in the verified figures');
  ok(D(unv.claimed_total) === '9y 6m 1d', 'it is shown separately in the claimed total (verified + unverified)');
  ok(D(X(base, [P('2010-01-01', '2012-06-30', false)], asOf).total_verified) === '6y 0m 1d', 'with only unverified previous records the total is just the current service');
  ok(JSON.stringify(X(base, [P('2010-01-01', '2012-06-30'), P('2014-03-10', '2015-03-09')].reverse(), asOf).total_verified) === JSON.stringify(two.total_verified), 'the order the records were entered in does not matter');

  sec('A4. Overlapping periods are counted once');
  const ov = X(base, [P('2010-01-01', '2012-06-30'), P('2011-01-01', '2013-12-31')], asOf);
  ok(D(ov.previous_verified) === '4y 0m 0d' && ov.warnings.includes('previous_overlaps_previous') && ov.overlap_days_removed > 0, 'two overlapping previous jobs (2010-01..2012-06 and 2011-01..2013-12) = 4 years, flagged');
  const same = X(base, [P('2010-01-01', '2012-12-31'), P('2010-01-01', '2012-12-31')], asOf); ok(D(same.previous_verified) === '3y 0m 0d', 'the same period entered twice counts once');
  const oc = X(base, [P('2019-06-01', '2020-06-30')], asOf); ok(D(oc.previous_verified) === '0y 7m 0d' && D(oc.total_verified) === '6y 7m 1d' && oc.warnings.includes('previous_overlaps_current'), 'a previous job overlapping the current employment: only the days before it are added (7 months), flagged');
  const inside = X(base, [P('2021-01-01', '2022-12-31')], asOf); ok(D(inside.previous_verified) === '0y 0m 0d' && D(inside.total_verified) === D(inside.current), 'a previous period inside the current employment adds nothing');
  const adj = X(base, [P('2018-01-01', '2019-12-31')], asOf); ok(D(adj.previous_verified) === '2y 0m 0d' && D(adj.total_verified) === '8y 0m 1d', 'a previous job ending the day before the current one starts: 2 + 6 years, no gap and no double count');

  sec('A5. Missing or invalid dates');
  const m1 = X({ hire_date: null }, [P('2010-01-01', '2012-06-30')], asOf); ok(m1.warnings.includes('hire_date_missing') && D(m1.current) === '0y 0m 0d' && D(m1.total_verified) === '2y 6m 0d' && m1.start_date === null, 'no hire date: warning, no invented current service, previous verified still counted');
  ok(X({ hire_date: '' }, [], asOf).warnings.includes('hire_date_missing'), 'an empty hire date is "missing"'); ok(X({ hire_date: 'abc' }, [], asOf).warnings.includes('hire_date_invalid') && X({ hire_date: '2021-02-30' }, [], asOf).warnings.includes('hire_date_invalid'), 'an unreadable or impossible hire date (30 Feb) is "invalid"');
  const fut = X({ hire_date: '2027-01-01' }, [], asOf); ok(fut.warnings.includes('hire_date_future') && D(fut.current) === '0y 0m 0d', 'a hire date in the future: warning, zero service');
  const tb = X({ hire_date: '2020-01-01', termination_date: '2019-01-01' }, [], asOf); ok(tb.warnings.includes('termination_before_hire') && D(tb.current) === '0y 0m 0d', 'an end date earlier than the start date: warning, zero service');
  const bad = X(base, [P('2012-06-30', '2010-01-01')], asOf); ok(bad.warnings.includes('previous_dates_invalid') && D(bad.previous_verified) === '0y 0m 0d', 'a previous period whose end is before its start is ignored and flagged');
  const fe = X(base, [P('2024-01-01', '2030-01-01')], asOf); ok(fe.warnings.includes('previous_end_in_future'), 'a previous period ending in the future is flagged and clipped');
  ok(D(X({ hire_date: '2010-01-01', termination_date: '2015-06-30' }, [], asOf).current) === '5y 6m 0d', 'a leaver\'s service stops at the termination date');
  const gap = X({ hire_date: '2015-01-01' }, [P('2015-01-01', '2017-12-31', true, { is_current_institution: true }), P('2019-01-01', '2020-12-31', true, { is_current_institution: true })], '2021-01-01'); ok(D(gap.current) === '5y 0m 0d', 'recorded interruptions at the current employer replace the plain start-date range (3y + 2y)');

  sec('A6. One shared calculation');
  const a = X(base, [P('2010-01-01', '2012-06-30')], asOf), b = X(base, [P('2010-01-01', '2012-06-30')], asOf); ok(JSON.stringify(a) === JSON.stringify(b), 'same input, same answer (pure function)');
  ok(a.sort_key === (a.total_verified.years * 12 + a.total_verified.months) * 30 + a.total_verified.days, 'the sort key is derived from the total verified experience, nothing stored');
  ok(S.text({ years: 5, months: 7, days: 12 }) === '5 years, 7 months, 12 days', 'export text format: 5 years, 7 months, 12 days');
  ok(JSON.stringify(S.total([{ start_date: '2020-01-01', end_date: '2020-12-31' }, { start_date: '2020-06-01', end_date: '2021-03-31' }], '2026-01-01')).includes('"years":1,"months":3,"days":0'), 'the retirement module\'s merge still works (overlap counted once)');

  // ------------------------------------------------------------------ part B (database)
  const app = require('../src/index'), { pool } = require('../src/db'), H = require('../src/hr'), PW = process.env.SEED_PASSWORD || 'Dev@12345678';
  const srv = app.listen(0), base0 = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body, token) => { const r = await fetch(base0 + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch {} return { s: r.status, d }; };
  const login = async (u) => (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d.token, T = {}; for (const u of ['hrm', 'hro', 'emp', 'mgr', 'exec']) T[u] = await login(u);
  const today = H.today(), addY = (n, off = 0) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
  const LK = (await call('GET', '/lookups', null, T.hrm)).d, dep = LK.departments[0].id, tag = Date.now().toString(36).toUpperCase().replace(/[^A-Z]/g, 'X');
  let n = 0; const mk = async (hire) => (await call('POST', '/employees', { first_name: 'Exp' + (++n), father_name: 'T' + tag, sex: 'male', hire_date: hire, department_id: dep }, T.hrm)).d;
  const det = async (id, tok = T.hrm) => (await call('GET', `/employees/${id}`, null, tok)).d, ymdT = (t) => `${t.years}y ${t.months}m ${t.days}d`;

  sec('B1. Profile data');
  const E1 = await mk(addY(5, -5)), E2 = await mk(addY(2)), E3 = await mk(addY(12));   // ~5 years, ~2 years, ~12 years
  const d1 = await det(E1.id); ok(d1.experience && d1.experience.start_date === addY(5, -5) && d1.experience.current.years >= 5 && d1.experience.warnings.length === 0, 'the profile carries the start date and the current service');
  ok(ymdT(d1.experience.current) === ymdT(X({ hire_date: addY(5, -5) }, [], today).current), 'the API figure equals the shared calculation');
  ok(d1.experience.previous.length === 0 && d1.experience.total_verified.years === d1.experience.current.years, 'no previous employment recorded: total = current');
  sec('B2. Previous employment: entry, verification, validation');
  const add = (id, body, tok = T.hro) => call('POST', `/employees/${id}/service`, { employer: 'Old Employer', job_title: 'Instructor', ...body }, tok);
  const p1 = await add(E1.id, { start_date: '2005-01-01', end_date: '2007-06-30' }); ok(p1.s === 201 && p1.d.verified === false && Array.isArray(p1.d.warnings), 'a previous employment is recorded (unverified)');
  ok(ymdT((await det(E1.id)).experience.previous_verified) === '0y 0m 0d' && (await det(E1.id)).experience.previous_unverified === 1, 'unverified: not in the verified experience');
  ok((await call('POST', `/service/${p1.d.id}/verify`, {}, T.hrm)).s === 200, 'another HR user verifies it'); const d1b = await det(E1.id); ok(ymdT(d1b.experience.previous_verified) === '2y 6m 0d' && d1b.experience.total_verified.years === d1.experience.total_verified.years + 2 + (d1.experience.total_verified.months + 6 >= 12 ? 1 : 0), 'verified: previous 2y 6m is added to the total');
  ok(d1b.experience.previous[0].employer === 'Old Employer' && d1b.experience.previous[0].job_title === 'Instructor' && d1b.experience.previous[0].verified === true, 'organization, job title and verification state are in the profile data');
  ok((await add(E1.id, { start_date: '2007-01-01', end_date: '2006-01-01' })).s === 400, 'an end date earlier than the start date is refused'); ok((await add(E1.id, { start_date: addY(0, 5), end_date: addY(0, 9) })).s === 400, 'a start date in the future is refused'); ok((await add(E1.id, { start_date: '2015-01-01', end_date: addY(0, 9) })).s === 400, 'an end date in the future is refused');
  ok((await add(E1.id, { start_date: '2005-01-01', end_date: '2007-06-30' })).s === 400, 'the same previous employment cannot be entered twice');
  const p2 = await add(E1.id, { employer: 'Second Employer', start_date: '2006-06-01', end_date: '2008-12-31' }); ok(p2.s === 201 && p2.d.warnings.includes('previous_overlaps_previous'), 'an overlapping record is accepted but the response warns about the overlap');
  await call('POST', `/service/${p2.d.id}/verify`, {}, T.hrm); ok(ymdT((await det(E1.id)).experience.previous_verified) === '4y 0m 0d', 'overlap counted once: 2005-01..2008-12 = 4y 0m (not 2y6m + 2y7m = 5y1m)');
  ok((await call('POST', `/employees/${E1.id}/service`, { employer: 'X', start_date: '2001-01-01', end_date: '2002-01-01' }, T.emp)).s === 403, 'an employee cannot add experience records');
  ok((await det(E1.id, T.mgr)).experience === undefined, 'a line manager does not get the experience data of someone else (it is HR data)');
  const me = (await pool.query("SELECT employee_id FROM users WHERE email='emp@hrms.test'")).rows[0].employee_id; ok((await det(me, T.emp)).experience.current.years >= 0, 'an employee sees their own experience');

  sec('B3. Employee lists: columns, filters and sorting (HR only)');
  const L = (qs, tok = T.hrm) => call('GET', `/employees?q=T${tag}${qs}`, null, tok).then((x) => x.d);
  const all = await L(''); const e1 = all.find((x) => x.id === E1.id); ok(e1.experience && e1.experience.current.years >= 5 && e1.experience.total_verified.years >= 8, 'the list carries current and total verified experience for HR');
  ok(ymdT(e1.experience.total_verified) === ymdT((await det(E1.id)).experience.total_verified), 'list figure = profile figure');
  const ids = (r) => r.map((x) => x.id);
  ok(ids(await L('&sort=experience')).join() === [E3.id, E1.id, E2.id].join(), 'sorted by total verified experience, longest first (E3 12y, E1 ~9y, E2 2y)'); ok(ids(await L('&sort=experience_asc')).join() === [E2.id, E1.id, E3.id].join(), 'shortest first');
  ok(ids(await L('&experience_min_years=10')).join() === [E3.id].join() && ids(await L('&experience_min_years=5&experience_max_years=9')).join() === [E1.id].join() && ids(await L('&experience_max_years=2')).join() === [E2.id].join(), 'filters: at least 10 years / 5 to 9 years / up to 2 years');
  ok(ids(await L('&sort=service')).join() === [E3.id, E1.id, E2.id].join(), 'sorted by service at this institution');
  ok(((await L('&sort=experience', T.mgr)).every?.((x) => x.experience === undefined)) !== false, 'a manager gets no experience columns');

  sec('B4. Report and export data');
  const rep = (await call('GET', '/reports/work_experience', null, T.hrm)).d, r1 = rep.rows.find((x) => x.employee_no === E1.employee_no);
  ok(rep.columns.length >= 14 && r1 && `${r1.tot_y}y ${r1.tot_m}m ${r1.tot_d}d` === ymdT((await det(E1.id)).experience.total_verified) && `${r1.cur_y}y ${r1.cur_m}m ${r1.cur_d}d` === ymdT((await det(E1.id)).experience.current), 'the work-experience report shows exactly the profile figures');
  ok(r1.start_date === addY(5, -5) && r1.unverified === 0, 'start date and unverified count are in the report');
  const sorted = rep.rows.map((x) => (x.tot_y * 12 + x.tot_m) * 30 + x.tot_d); ok(sorted.every((v, i) => i === 0 || v <= sorted[i - 1]), 'the report is ordered by total verified experience');
  ok((await call('GET', '/reports/work_experience', null, T.mgr)).s === 403 && (await call('GET', '/reports', null, T.hrm)).d.includes('work_experience'), 'the report is HR only');
  const tn = (await call('GET', '/reports/tenure', null, T.hrm)).d; ok(tn.rows.reduce((a, x) => a + x.employees, 0) === rep.rows.length, 'the "years of service" bands add up to the same employees');
  const ret = await call('GET', `/employees/${E3.id}/retirement-assessment`, null, T.hrm); ok(ret.s === 200 || ret.s === 404, 'retirement assessment still answers');

  sec('B5. Existing data untouched');
  ok((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name='employees' AND column_name ILIKE '%experience%'")).rows[0].count === '0' || Number((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name='employees' AND column_name ILIKE '%experience%'")).rows[0].count) === 0, 'no experience value is stored on the employee (always derived)');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
