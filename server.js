require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./storage');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3636;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// async エラーハンドラー
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error('[API Error]', e.message); res.status(500).json({ error: e.message }); }
};

// ─── BOOKINGS ─────────────────────────────────────────────

app.get('/api/bookings', wrap(async (req, res) => {
  const { year, month } = req.query;
  res.json(await db.getBookings(year, month));
}));

app.post('/api/bookings', wrap(async (req, res) => {
  res.json(await db.insertBooking(req.body));
}));

app.put('/api/bookings/:id', wrap(async (req, res) => {
  const updated = await db.updateBooking(parseInt(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}));

app.delete('/api/bookings/:id', wrap(async (req, res) => {
  await db.deleteBooking(parseInt(req.params.id));
  res.json({ ok: true });
}));

// ─── DASHBOARD ────────────────────────────────────────────

app.get('/api/dashboard', wrap(async (req, res) => {
  const { year, month } = req.query;
  res.json(await db.getDashboard(year, month));
}));

// ─── CUSTOMERS ────────────────────────────────────────────

app.get('/api/customers', wrap(async (req, res) => {
  res.json(await db.getCustomers());
}));

app.get('/api/customers/bookings', wrap(async (req, res) => {
  res.json(await db.getCustomerBookings(req.query.name, req.query.account));
}));

// ─── STATS ────────────────────────────────────────────────

app.get('/api/stats', wrap(async (req, res) => {
  const { year, month } = req.query;
  res.json(await db.getStats(year, month));
}));

// ─── START ────────────────────────────────────────────────

const net = require('net');

function findFreePort(start, cb) {
  const srv = net.createServer();
  srv.once('error', () => findFreePort(start + 1, cb));
  srv.once('listening', () => { const p = srv.address().port; srv.close(() => cb(p)); });
  srv.listen(start);
}

async function main() {
  // DB 接続 & テーブル初期化
  await db.initDB();

  findFreePort(PORT, (port) => {
    app.listen(port, () => {
      console.log(`\n✅  予約管理システム 起動中`);
      console.log(`   → http://localhost:${port}\n`);
      require('fs').writeFileSync(
        require('path').join(__dirname, 'data', '.port'),
        String(port)
      );
    });
  });
}

main().catch(e => {
  console.error('\n[起動エラー]', e.message);
  console.error('  .env の DATABASE_URL が正しいか確認してください。\n');
  process.exit(1);
});
