// Loads the work-clothing / work-equipment catalogue read from Directive 173/2018 (PDF pp. 4-27) from db/seed/ppe_directive_173_2018.json.
// Idempotent and non-destructive: an item whose code or Amharic name already exists is reused and NEVER changed; entitlements that already exist are left as they are.
// Every entitlement is loaded UNVERIFIED so that HR confirms it against the original before relying on it.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '../db/seed/ppe_directive_173_2018.json');
async function seedPpeCatalog(db, log = () => {}) {
  const D = JSON.parse(fs.readFileSync(FILE, 'utf8')), res = { items_added: 0, items_reused: 0, entitlements_added: 0, entitlements_existing: 0 }, ids = {};
  for (const it of D.items) {
    const ex = (await db.query('SELECT id FROM ppe_items WHERE code=$1 OR name_am=$2 LIMIT 1', [it.code, it.name_am])).rows[0];
    if (ex) { ids[it.code] = ex.id; res.items_reused++; continue; }
    ids[it.code] = (await db.query('INSERT INTO ppe_items(code,name_am,name_en,kind,unit,category,source_ref,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [it.code, it.name_am, it.name_en, it.kind, it.unit, it.category, it.source_ref, it.note])).rows[0].id; res.items_added++;
  }
  for (const g of D.groups) {
    const base = `Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ ${g.no}, PDF p.${g.page}`;
    for (const r of g.rules) for (const pos of g.positions) {
      if (r.only && !r.only.includes(pos)) continue; if (r.exclude && r.exclude.includes(pos)) continue;
      const note = [r.note, g.applies_to, g.partial_note].filter(Boolean).join(' | ') || null;
      const x = await db.query('INSERT INTO ppe_entitlements(job_title_pattern,item_id,quantity,per_months,first_issue_quantity,immediate,note,group_no,source_ref,verified,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10) ON CONFLICT (job_title_pattern,item_id) DO NOTHING', [pos, ids[r.item], r.quantity, r.per_months, r.first_issue_quantity, !!g.immediate, note, g.no, base + (g.immediate ? ' · ' + g.immediate_note : ''), g.active !== false]);
      if (x.rowCount) res.entitlements_added++; else res.entitlements_existing++;
    }
  }
  log(res); return res;
}
module.exports = { seedPpeCatalog };
if (require.main === module) { const { pool } = require('./db'); seedPpeCatalog(pool, (r) => console.log('PPE catalogue:', JSON.stringify(r))).then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); }); }
