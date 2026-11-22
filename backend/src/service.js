// Service-duration and work-experience arithmetic - the ONE place where experience is calculated (API, profile, lists, reports and exports all use it).
// Nothing here is stored: everything is derived from the recorded dates and the date of the request, so the figures change by themselves as time passes.
//
// Conventions (documented for HR):
//  * Dates are calendar days. A period counts its first AND its last day (2020-01-01..2020-12-31 = 1 year, 0 months, 0 days). Current employment runs from the
//    employment start date up to and including today.
//  * A single period is measured on the calendar: whole months from the start date, then the remaining days. A start day that does not exist in a month
//    (31 Jan, 30 Jan, 29 Feb ...) completes that month at the month end: 31 Jan..29 Feb (2024) = 1 month; 31 Jan..28 Feb (2023) = 1 month.
//  * When parts are added (previous + current), days carry into months at 30 days and months into years at 12 (the 30-day month of the Ethiopian calendar).
//  * Overlapping periods are counted once (union of the days). Previous periods are clipped so no day is counted twice with the current employment.
//  * Only VERIFIED previous periods count towards the verified figures. Unverified ones are shown separately ("claimed").
const DAY = 86400000;
const parse = (s) => {   // 'YYYY-MM-DD' (or a Date / ISO timestamp) -> UTC ms of that day, or null when missing / not a real date
  if (s == null || s === '') return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s instanceof Date ? (isNaN(s) ? '' : s.toISOString()) : String(s)); if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const toDay = (s) => parse(s);
// the moment the k-th month after `a` is completed (start of that day); a missing day (31 Feb) completes the month at its end
function anchor(a, k) {
  const s = new Date(a), y = s.getUTCFullYear(), m = s.getUTCMonth(), d = s.getUTCDate(), ty = y + Math.floor((m + k) / 12), tm = ((m + k) % 12 + 12) % 12, dim = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return d <= dim ? Date.UTC(ty, tm, d) : Date.UTC(ty, tm + 1, 1);
}
// whole years / months / days from day a to day b, both included
function ymd(a, b) {
  const e = b + DAY, s = new Date(a), x = new Date(e); let months = (x.getUTCFullYear() - s.getUTCFullYear()) * 12 + (x.getUTCMonth() - s.getUTCMonth());
  while (months > 0 && anchor(a, months) > e) months--; if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12, days: Math.round((e - anchor(a, months)) / DAY) };
}
const isZero = (t) => !t.years && !t.months && !t.days;
const add = (x, y) => { if (isZero(x)) return { years: y.years, months: y.months, days: y.days }; if (isZero(y)) return { years: x.years, months: x.months, days: x.days }; let d = x.days + y.days, m = x.months + y.months, yr = x.years + y.years; m += Math.floor(d / 30); d %= 30; yr += Math.floor(m / 12); m %= 12; return { years: yr, months: m, days: d }; };
function union(ranges) { const r = ranges.filter(([a, b]) => b >= a).sort((p, q) => p[0] - q[0]), out = []; for (const [a, b] of r) { const l = out[out.length - 1]; if (l && a <= l[1] + DAY) l[1] = Math.max(l[1], b); else out.push([a, b]); } return out; }
const lenDays = (ranges) => ranges.reduce((n, [a, b]) => n + Math.round((b - a) / DAY) + 1, 0);
function subtract(ranges, cuts) {   // the days of `ranges` that are not in `cuts` (both already merged)
  const out = []; for (let [a, b] of ranges) { for (const [c, d] of cuts) { if (d < a || c > b) continue; if (c > a) out.push([a, c - DAY]); a = d + DAY; if (a > b) break; } if (a <= b) out.push([a, b]); } return out;
}
const sumRanges = (ranges) => { let t = { years: 0, months: 0, days: 0 }; for (const [a, b] of ranges) t = add(t, ymd(a, b)); return t; };
const key = (t) => (t.years * 12 + t.months) * 30 + t.days;   // one number to sort and filter by (same 30-day convention)

// kept for the retirement module: periods = [{start_date,end_date|null}], asOf = 'YYYY-MM-DD'
function merge(periods, asOf) { const t = parse(asOf), r = periods.map((p) => [parse(p.start_date), Math.min(parse(p.end_date) ?? t, t)]).filter(([a, b]) => a != null && b != null && b >= a); return union(r); }
function total(periods, asOf) { const m = merge(periods, asOf), t = sumRanges(m); return { merged: m.map(([a, b]) => ({ from: iso(a), to: iso(b) })), calendar_days: lenDays(m), ...t }; }

// The employee's work experience as of `asOf`.
//   e: { hire_date, termination_date } ; periods: rows of service_periods ; returns durations + warnings (codes the screens translate)
function experience(e, periods, asOf) {
  const today = parse(asOf), warn = [], hire = parse(e.hire_date), term = parse(e.termination_date), flagged = periods.filter((p) => p.is_current_institution);
  if (e.hire_date == null || e.hire_date === '') warn.push('hire_date_missing'); else if (hire == null) warn.push('hire_date_invalid'); else if (hire > today) warn.push('hire_date_future');
  if (hire != null && term != null && term < hire) warn.push('termination_before_hire');
  const rangeOf = (p) => { const a = parse(p.start_date), b = p.end_date ? parse(p.end_date) : today; if (a == null || b == null || b < a) return null; return a > today ? null : [a, Math.min(b, today)]; };
  // current institution: the employment start date, up to termination or today (periods flagged "current institution" replace it when HR recorded interruptions)
  let cur = [];
  if (flagged.length) cur = flagged.filter((p) => p.verified).map(rangeOf).filter(Boolean);
  else if (hire != null && hire <= today && !(term != null && term < hire)) cur = [[hire, Math.min(term ?? today, today)]];
  cur = union(cur);
  const prevAll = periods.filter((p) => !p.is_current_institution), usable = (list) => list.map((p) => ({ p, r: rangeOf(p) }));
  for (const p of prevAll) { if (!rangeOf(p) && parse(p.start_date) != null && parse(p.end_date) != null && parse(p.end_date) < parse(p.start_date)) warn.push('previous_dates_invalid'); else if (p.end_date && parse(p.end_date) > today) warn.push('previous_end_in_future'); }
  const build = (list) => { const rs = list.map((x) => x.r).filter(Boolean), merged = union(rs), outside = subtract(merged, cur); return { merged, outside, overlap_self: lenDays(rs) - lenDays(merged), overlap_cur: lenDays(merged) - lenDays(outside) }; };
  const ver = build(usable(prevAll.filter((p) => p.verified))), all = build(usable(prevAll));
  if (all.overlap_self > 0) warn.push('previous_overlaps_previous'); if (all.overlap_cur > 0) warn.push('previous_overlaps_current');   // warn about every recorded period, verified or not
  const current = sumRanges(cur), previous = sumRanges(ver.outside), previousClaimed = sumRanges(all.outside), totalVerified = add(previous, current), claimed = add(previousClaimed, current);
  const unverified = prevAll.filter((p) => !p.verified).length;
  return {
    as_of: iso(today), start_date: hire != null ? iso(hire) : null, end_date: term != null ? iso(term) : null,
    current: { ...current, total_days: lenDays(cur) }, previous_verified: previous, total_verified: totalVerified, claimed_total: claimed,
    previous_count: prevAll.length, previous_verified_count: prevAll.length - unverified, previous_unverified: unverified, overlap_days_removed: ver.overlap_self + ver.overlap_cur,
    sort_key: key(totalVerified), current_key: key(current), warnings: [...new Set(warn)],
  };
}
const text = (t) => `${t.years} years, ${t.months} months, ${t.days} days`;   // English text for exports that cannot be translated per cell
module.exports = { merge, ymd, total, experience, text, addMonthsAnchor: anchor, parse };
