// Register-import tests: calendar conversion, parsing rules, and the "fill only empty fields, never overwrite" reconciliation.
require('../src/env');
const { ethToGreg, parseDate, split, plan, penOf } = require('../src/import-register'), { pool } = require('../src/db');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
(async () => {
  ok(ethToGreg(2018, 1, 1) === '2025-09-11' && ethToGreg(2017, 1, 1) === '2024-09-11', 'Ethiopian new year converts correctly'); ok(ethToGreg(2015, 13, 6) === '2023-09-11' && ethToGreg(2016, 13, 6) === null, 'Pagume 6 exists only in a leap year'); ok(ethToGreg(2000, 13, 7) === null && ethToGreg(2000, 14, 1) === null, 'impossible dates are rejected');
  const iss = []; ok(parseDate('26/12/2000', iss, 'x') === '2008-09-01' && iss.length === 1, 'text dates are read as Ethiopian and flagged');
  const i2 = []; ok(parseDate(36689, i2, 'x') === '2008-08-12' && i2.length === 1, 'a spreadsheet serial is Ethiopian typed d/m/yyyy that Excel read as m/d/yyyy: serial 2000-06-12 = Ethiopian 6/12/2000'); ok(parseDate(23929, [], 'x') === '1973-02-14', 'serial 1965-07-06 = Ethiopian 7/6/1965');
  ok(parseDate(30061, [], 'x') === null, 'a serial whose \"day\" is above 13 cannot be an Ethiopian month, so it is NOT guessed (left empty and flagged)');
  const i3 = []; ok(parseDate('1/42005', i3, 'x') === '2012-12-10' && /repaired/.test(i3[0]), 'a lost \"/\" is repaired only when the last four digits are the year, and flagged'); ok(parseDate('5/12/181', [], 'x') === null && parseDate('21/01/78', [], 'x') === null, 'dates with a 2- or 3-digit year are not guessed'); ok(penOf({ pension: 'የለም' }) === null && penOf({ pension: ' ሰ/123 ' }) === 'ሰ/123', '"የለም" (none) is not stored as a pension number');
  const sp = split('ኤርሚያስ ጌትነት አሰፋ ወርቁ'); ok(sp.first === 'ኤርሚያስ' && sp.father === 'ጌትነት' && sp.grand === 'አሰፋ ወርቁ', 'Amharic names split into first / father / grandfather');
  const c = await pool.connect(); try {
    await c.query('BEGIN');
    const tag = Date.now().toString(36).toUpperCase();
    await c.query("INSERT INTO employees(employee_no,first_name,father_name,grandfather_name,sex,hire_date,marital_status,pension_no) VALUES($1,'ሙከራ','ስም','ሦስተኛ','male','2010-01-01','single',NULL)", ['EMP-T' + tag]);
    const row = { n: 16, no: 1, fan: '9999000011112222', name_am: 'ሙከራ ስም ሦስተኛ', sex: 'ወ', pension: 'ሰ/00' + tag, dob: '20/2/1977', hire: '26/12/2000', marital: 'ያገባ', title: 'x', unit: 'x' };
    const p = (await plan(c, [row], false))[0]; ok(p.action === 'update', 'an existing employee is matched by name and updated, not duplicated');
    ok(p.fill.fayda_fan === '9999000011112222' && p.fill.date_of_birth === '1984-10-30' && p.fill.pension_no === 'ሰ/00' + tag, 'empty fields are filled (Fayda, date of birth, pension number)');
    ok(p.fill.marital_status === undefined && p.fill.hire_date === undefined, 'fields that already have a value are never overwritten');
    ok(p.issues.includes('permanent staff position number missing in the register'), 'a missing position number is flagged, never invented');
    const dup = await plan(c, [row, { ...row, no: 2 }], false); ok(dup.every((x) => x.action !== 'insert'), 'two identical register rows do not create duplicate employees');
    await c.query('ROLLBACK');
  } finally { c.release(); }
  console.log(`\n${pass} passed, ${fail} failed`); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
