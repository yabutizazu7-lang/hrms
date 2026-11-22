// Lists every phrase passed to tx()/tm() and every Field/Modal label prop in src/. Used to (re)build en.json.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(root, 'src'), require = createRequire(root + '/');
const { parse } = require('@babel/parser'); const traverse = require('@babel/traverse').default;
const keys = new Set(); const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? e.name !== 'i18n' && walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) && files.push(path.join(d, e.name)); })(SRC);
const lit = (n) => !n ? [] : n.type === 'StringLiteral' ? [n.value] : n.type === 'TemplateLiteral' && !n.expressions.length ? [n.quasis[0].value.cooked] : n.type === 'ConditionalExpression' ? [...lit(n.consequent), ...lit(n.alternate)] : [];
for (const f of files) traverse(parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), {
  CallExpression(p) { const c = p.node.callee; if (c.type === 'Identifier' && (c.name === 'tx' || c.name === 'tm')) lit(p.node.arguments[0]).forEach((s) => keys.add(s)); },
  JSXAttribute(p) { if (['label', 'title'].includes(p.node.name.name) && p.node.value?.type === 'StringLiteral' && /^[A-Z]/.test(p.node.value.value)) keys.add(p.node.value.value); },
  StringLiteral(p) { // array entries such as ['Waiting'] passed through tx(l) later: collect capitalised phrases used in label arrays
    const par = p.parent; if (par.type === 'ArrayExpression' && par.elements.length === 2 && par.elements[1] === p.node && /^[A-Z][A-Za-z &/(),'.\-…]+$/.test(p.node.value) && par.elements[0].type === 'StringLiteral') keys.add(p.node.value);
    if (par.type === 'ObjectProperty' && par.value === p.node && /^[A-Z][A-Za-z &/(),'.\-…]+$/.test(p.node.value) && /\.(jsx)$/.test(f)) keys.add(p.node.value); },
});
console.log(JSON.stringify([...keys].sort(), null, 1));
