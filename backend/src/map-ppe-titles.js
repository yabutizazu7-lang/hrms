// Matches every employee's job title to the occupations of Directive No. 173/2018 (Annex 3) and links the safe ones.
//   node src/map-ppe-titles.js            PREVIEW: shows what would be linked, writes nothing
//   node src/map-ppe-titles.js --apply    links the automatic matches (running it again changes nothing) and records the run
//   node src/map-ppe-titles.js --csv <file>   also writes the employee-level report (employee no., title, result - no names)
require('./env'); const fs = require('fs'), { pool } = require('./db'), PM = require('./ppe-map');
(async () => {
  const apply = process.argv.includes('--apply'), ci = process.argv.indexOf('--csv'), csv = ci > 0 ? process.argv[ci + 1] : null, c = { query: (s, p) => pool.query(s, p) };
  const before = await PM.plan(c); let added = 0;
  if (apply) { added = await PM.autoMap(c); const v = PM.summarize(await PM.plan(c)); await pool.query('INSERT INTO ppe_mapping_runs(employees,matched,review,titles,titles_matched,titles_review,links_added) VALUES($1,$2,$3,$4,$5,$6,$7)', [v.employees, v.matched, v.review, v.titles, v.titles_matched, v.titles_review, added]); }
  const rows = apply ? await PM.plan(c) : before, v = PM.summarize(rows);
  console.log(`${apply ? 'APPLIED' : 'PREVIEW (nothing was written)'}: ${v.employees} employees, ${v.titles} job titles`);
  console.log(`  matched to an occupation of the directive: ${v.matched} employees (${v.titles_matched} titles)${apply ? `, ${added} new links` : ''}`);
  console.log(`  to be reviewed by HR (no occupation of this title in the directive): ${v.review} employees (${v.titles_review} titles)`);
  for (const r of rows.filter((x) => ['automatic', 'mapped', 'direct'].includes(x.status))) console.log(`   + ${r.employees} x ${r.title}  ->  ${r.matches.map((m) => m.pattern).join(' ; ')}`);
  if (csv) { const emps = (await pool.query("SELECT e.employee_no,COALESCE(pos.title,e.jeg_title) AS t FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id WHERE e.status<>'terminated' ORDER BY e.employee_no")).rows, by = Object.fromEntries(rows.map((r) => [r.title, r]));
    fs.writeFileSync(csv, '\ufeffemployee_no,job_title,result,directive_occupation\n' + emps.map((e) => { const r = by[e.t], ok = r && ['automatic', 'mapped', 'direct'].includes(r.status); return [e.employee_no, e.t || '', ok ? 'matched' : 'HR review', ok ? r.matches.map((m) => m.pattern).join(' ; ') : ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','); }).join('\n') + '\n'); console.log('  report written:', csv); }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
