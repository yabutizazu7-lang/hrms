require('./env');
const express = require('express'), cors = require('cors'), helmet = require('helmet'), { limit } = require('./mw'), { pool } = require('./db'), notify = require('./notify');
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', process.env.TRUST_PROXY ? 1 : false);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true }));
// uploads travel as base64 JSON, so these routes accept a larger body; every other route is limited to 200 kB
const big = express.json({ limit: Math.ceil((Number(process.env.MAX_UPLOAD_MB) || 8) * 1.4) + 'mb' });
app.use(['/api/employees/:id/documents', '/api/hr-cases/:id/documents', '/api/public/apply', '/api/leave/requests', '/api/register-import', '/api/work-certificates/assets'], big);
app.use(express.json({ limit: '200kb' }));
app.use('/api', limit(600, 60 * 1000));
app.get('/api/health', async (_, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/recruitment'));
app.use('/api', require('./routes/employees').router);
app.use('/api', require('./routes/probation').router);
app.use('/api', require('./routes/register').router);
app.use('/api', require('./routes/authority').router);
app.use('/api', require('./routes/leave').router);
app.use('/api', require('./routes/attendance'));
app.use('/api', require('./routes/performance'));
app.use('/api', require('./routes/misc'));
app.use('/api', require('./routes/cases'));
app.use('/api', require('./routes/directive'));
app.use('/api', require('./routes/certificates').router);
app.use('/api', require('./routes/retirement').router);
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
const dist = require('path').join(__dirname, '../../frontend/dist');
if (require('fs').existsSync(dist)) { app.use(express.static(dist, { maxAge: '1h', index: false })); app.get('*', (req, res) => res.sendFile(require('path').join(dist, 'index.html'))); }
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err); res.status(500).json({ error: 'Server error' });
});
const port = Number(process.env.PORT) || 28200;
if (require.main === module) { app.listen(port, () => console.log(`HRMS API on :${port}${notify.live() ? '' : ' (e-mail in TEST mode)'}`)); notify.start(); require('./routes/probation').start(); require('./retirement').start(); require('./routes/certificates').start(); }
module.exports = app;
