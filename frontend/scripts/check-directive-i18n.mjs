// npm run i18n:check-directive - for the directive modules: every case type, field, action, stage, plan category and every STATIC
// server message (bad('...')) in the new backend routes must have an English and an Amharic text.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), req = createRequire(root + '/'), be = path.join(root, '../backend/src');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8')), am = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/am.json'), 'utf8'));
const WF = req(path.join(be, 'workflows.js')), miss = [], need = (k) => { if (!en[k] || !am[k] || !String(am[k]).trim()) miss.push(k); };
for (const [t, d] of Object.entries(WF.T)) { need('case.type.' + t); for (const f of Object.keys(d.fields)) { need('case.field.' + f); for (const o of d.fields[f][1] || []) need('value.' + o); } }
for (const s of Object.keys(WF.NEXT)) need('value.' + s);
for (const a of ['submit', 'review', 'return', 'recommend', 'decide', 'complete', 'appeal', 'cancel', 'reopen', 'note', 'created', 'edited', 'document']) need('case.action.' + a);
for (const c of ['recruitment', 'training', 'succession', 'promotion_transfer', 'retirement_forecast', 'leave_coverage', 'other']) need('plan.category.' + c);
for (const k of ['configuration_required', 'missing_data', 'eligible_subject_to_confirmation', 'not_yet_eligible']) need('rstatus.' + k); need('value.due');
for (const m of ['The retirement age has not been configured. An authorized HR decision citing the governing law must be entered in Settings (retirement_age_years). The system does not guess it.', 'The retirement age has not been configured. An authorized HR decision citing the governing law must be entered in the settings (retirement_age_years) first. The system does not guess it.']) need(m);
let msgs = 0;
for (const f of ['routes/cases.js', 'routes/directive.js', 'ids.js']) {
  const src = fs.readFileSync(path.join(be, f), 'utf8');
  for (const m of src.matchAll(/bad\((['"])((?:\\.|(?!\1).)*)\1(?:,\s*\d+)?\)/g)) { const text = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'); if (/\$\{/.test(text)) continue; msgs++; if (!en[text] || !am[text]) miss.push('server message: ' + text); }
}
if (miss.length) { console.error('Missing translations:\n' + miss.map((x) => ' - ' + x).join('\n') + `\n\n${miss.length} missing.`); process.exit(1); }
console.log(`Directive i18n OK: case types, fields, actions, stages, plan categories and ${msgs} server messages are translated.`);
