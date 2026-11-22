import { tx, tv } from '../i18n/index.js';
// Small dependency-free SVG charts. Every chart is drawn from the arrays the API returns: [{label, value}].
const COLORS = ['#1f6feb', '#12355b', '#2da44e', '#e0a030', '#b42318', '#8250df', '#0a7f8c', '#6e7781'];
const nice = (max) => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const short = (v) => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v));

// The API labels days like "Oct 01"; show the month in the selected language.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lab = (l) => { const m = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(String(l)); return m && MON.includes(m[1]) ? tx('month.' + m[1]) + ' ' + m[2] : tv(l); };
export function Empty() { return <p className="muted">{tx('No data yet.')}</p>; }

export function BarChart({ data, unit = '', color = COLORS[0], height = 190 }) {
  if (!data?.length || data.every((d) => !d.value)) return <Empty />;
  const W = 520, H = height, L = 38, B = 34, T = 10, top = nice(Math.max(...data.map((d) => d.value))), bw = (W - L - 6) / data.length;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
    {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={T + (H - T - B) * (1 - f)} y2={T + (H - T - B) * (1 - f)} stroke="#e3e8ee" /><text x={L - 4} y={T + (H - T - B) * (1 - f) + 4} textAnchor="end" fontSize="10" fill="#667">{short(top * f)}</text></g>)}
    {data.map((d, i) => { const h = ((H - T - B) * d.value) / top, x = L + i * bw + bw * 0.15; return (<g key={d.label + i}>
      <rect x={x} y={H - B - h} width={bw * 0.7} height={h} rx="3" fill={color}><title>{lab(d.label)}: {d.value}{unit}</title></rect>
      {data.length <= 14 || i % 2 === 0 ? <text x={x + bw * 0.35} y={H - B + 14} textAnchor="middle" fontSize="9" fill="#667">{lab(d.label).slice(0, 8)}</text> : null}</g>); })}
  </svg>);
}

export function LineChart({ data, unit = '', color = COLORS[0], height = 190 }) {
  if (!data?.length || data.every((d) => !d.value)) return <Empty />;
  const W = 520, H = height, L = 40, B = 34, T = 10, top = nice(Math.max(...data.map((d) => d.value))), step = (W - L - 10) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [L + i * step, T + (H - T - B) * (1 - d.value / top)]);
  return (<svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
    {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={T + (H - T - B) * (1 - f)} y2={T + (H - T - B) * (1 - f)} stroke="#e3e8ee" /><text x={L - 4} y={T + (H - T - B) * (1 - f) + 4} textAnchor="end" fontSize="10" fill="#667">{short(top * f)}</text></g>)}
    <polygon points={`${L},${H - B} ${pts.map((p) => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${H - B}`} fill={color} opacity="0.1" />
    <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2.5" />
    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color}><title>{lab(data[i].label)}: {data[i].value}{unit}</title></circle>)}
    {data.map((d, i) => (i % 2 === 0 || data.length <= 8) && <text key={i} x={pts[i][0]} y={H - B + 14} textAnchor="middle" fontSize="9" fill="#667">{lab(d.label)}</text>)}
  </svg>);
}

export function Donut({ data }) {
  const total = (data || []).reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty />;
  let acc = 0; const R = 60, C = 2 * Math.PI * R;
  return (<div className="donut"><svg viewBox="0 0 160 160" width="160" height="160"><circle cx="80" cy="80" r={R} fill="none" stroke="#eef1f5" strokeWidth="26" />
    {data.map((d, i) => { const len = (C * d.value) / total, el = <circle key={d.label} cx="80" cy="80" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="26" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)"><title>{lab(d.label)}: {d.value}</title></circle>; acc += len; return el; })}
    <text x="80" y="86" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1c2430">{total}</text></svg>
    <ul>{data.map((d, i) => <li key={d.label}><i style={{ background: COLORS[i % COLORS.length] }} />{lab(d.label)} <b>{d.value}</b></li>)}</ul></div>);
}

export function HBars({ data, unit = '' }) {
  if (!data?.length) return <Empty />;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (<div className="hbars">{data.map((d, i) => <div key={d.label}><span>{lab(d.label)}</span><div><i style={{ width: (100 * d.value) / max + '%', background: COLORS[i % COLORS.length] }} /></div><b>{d.value}{unit}</b></div>)}</div>);
}
