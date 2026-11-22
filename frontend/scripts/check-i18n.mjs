// npm run i18n:check - fails if a translation is missing or inconsistent.
//  1. every tx('...') / tm('...') phrase used in src/ exists in en.json and am.json
//  2. en.json and am.json have exactly the same keys, none empty
//  3. {{placeholders}} are identical in both languages
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(root, 'src'), require = createRequire(root + '/');
const { parse } = require('@babel/parser'); const traverse = require('@babel/traverse').default;
const en = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n/en.json'), 'utf8')), am = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n/am.json'), 'utf8'));
const errors = [];
for (const k of Object.keys(en)) if (!(k in am)) errors.push(`am.json is missing "${k}"`);
for (const k of Object.keys(am)) if (!(k in en)) errors.push(`en.json is missing "${k}"`);
for (const [k, v] of Object.entries(am)) { if (!String(v).trim()) errors.push(`empty Amharic text for "${k}"`); const a = (String(en[k] ?? '').match(/{{\w+}}/g) || []).sort().join(), b = (String(v).match(/{{\w+}}/g) || []).sort().join(); if (a !== b) errors.push(`placeholder mismatch for "${k}": ${a} vs ${b}`); }
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? e.name !== 'i18n' && walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) && files.push(path.join(d, e.name)); })(SRC);
const lit = (n) => !n ? [] : n.type === 'StringLiteral' ? [n.value] : n.type === 'TemplateLiteral' && !n.expressions.length ? [n.quasis[0].value.cooked] : n.type === 'ConditionalExpression' ? [...lit(n.consequent), ...lit(n.alternate)] : [];
let used = 0;
for (const f of files) traverse(parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), { CallExpression(p) { const c = p.node.callee; if (c.type === 'Identifier' && (c.name === 'tx' || c.name === 'tm')) lit(p.node.arguments[0]).forEach((s) => { used++; if (!(s in en)) errors.push(`${path.relative(root, f)}: "${s}" is not in en.json / am.json`); }); } });
if (errors.length) { console.error(errors.join('\n') + `\n\n${errors.length} i18n problem(s).`); process.exit(1); }
console.log(`i18n OK: ${Object.keys(en).length} keys in en.json and am.json, ${used} translated call sites checked.`);
