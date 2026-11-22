// Ethiopian calendar date + Ethiopian clock, as printed on the association's receipts.
import { tx, locale } from './i18n/index.js';
const TZ = 'Africa/Addis_Ababa';
const parts = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(d)).map((p) => [p.type, p.value]));
const jdn = (y, m, d) => { const a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3; return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045; };
export function ethiopianDate(d) { // 'DD-MM-YYYY' (E.C.), e.g. 1 Oct 2026 -> 21-01-2019
  const p = parts(d), j = jdn(+p.year, +p.month, +p.day) - 1723856, r = j % 1461, n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor(j / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return `${String((n % 30) + 1).padStart(2, '0')}-${String(Math.floor(n / 30) + 1).padStart(2, '0')}-${year}`;
}
// Ethiopian clock: the day starts at 6:00, so the local time is shifted by 6 hours (08:18 -> 2:18). The Amharic word tells the part of the day.
export function ethiopianTime(d) {
  const p = parts(d), h = +p.hour, eh = (h + 18) % 24, h12 = eh % 12 || 12;
  const period = tx(h >= 6 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : h >= 18 ? 'evening' : 'night');
  return `${h12}:${p.minute} ${eh < 12 ? 'AM' : 'PM'} (${period})`;
}
export const clock24 = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
export const gregorianLong = (d) => new Date(d).toLocaleDateString(locale(), { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
export const clock12 = (d) => new Date(d).toLocaleTimeString(locale(), { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
