// Prints only the element(s) marked className="printable" (see styles.css). "Save as PDF" in the print dialog gives a PDF.
export function printArea({ thermal = false } = {}) {
  // Print a clean copy of the receipt(s): the marked elements are cloned into #print-holder (outside #root) and the rest of the page is hidden while printing.
  // (Hiding the page with visibility rules printed blank pages.) Canvas drawings, e.g. signatures, are copied as pictures because cloning does not copy their pixels.
  const holder = document.createElement('div'); holder.id = 'print-holder';
  document.querySelectorAll('.printable').forEach((el) => {
    const copy = el.cloneNode(true), from = el.querySelectorAll('canvas'), to = copy.querySelectorAll('canvas');
    from.forEach((cv, i) => { const img = document.createElement('img'); img.className = cv.className; try { img.src = cv.toDataURL('image/png'); } catch { /* tainted canvas: leave blank */ } to[i].replaceWith(img); });
    holder.appendChild(copy);
  });
  document.body.appendChild(holder);
  document.body.classList.add('print-mode');
  let st; if (thermal) { st = document.createElement('style'); st.textContent = '@page{size:80mm auto;margin:3mm}'; document.head.appendChild(st); } // 80 mm receipt-printer paper
  const done = () => { document.body.classList.remove('print-mode'); holder.remove(); st?.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  const imgs = [...holder.querySelectorAll('img')]; // wait until the pictures (logo, signatures) are ready, otherwise they print empty
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => window.print());
}
// Download rows as a CSV file (opens in Excel)
export function downloadCsv(name, columns, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const text = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.type === 'dt' && r[c.key] ? new Date(r[c.key]).toISOString() : r[c.key])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '.csv'; a.click(); URL.revokeObjectURL(a.href);
}
