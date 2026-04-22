require('dotenv').config();

// ─── 環境変数チェック ──────────────────────────────────────
const REQUIRED_ENV = ['SESSION_SECRET', 'DATABASE_URL', 'ADMIN_USER', 'ADMIN_PASS'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[起動エラー] ${key} が .env に設定されていません`);
    process.exit(1);
  }
}

// ─── クラッシュハンドラー ──────────────────────────────────
process.on('uncaughtException',  err  => { console.error('[FATAL] Uncaught exception:', err);  process.exit(1); });
process.on('unhandledRejection', reason => { console.error('[FATAL] Unhandled rejection:', reason); process.exit(1); });

const express      = require('express');
const session      = require('express-session');
const pgSession    = require('connect-pg-simple')(session);
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { Pool }     = require('pg');
const db           = require('./storage');

const app    = express();
const PORT   = parseInt(process.env.PORT) || 3636;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

// ─── セキュリティヘッダー ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", "data:"],
      connectSrc:    ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd,
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

// ─── セッション（PostgreSQL永続化） ───────────────────────
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});
app.use(session({
  store: new pgSession({
    pool: sessionPool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000, // 8時間
  },
}));

// ─── ログインレート制限 ────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'ログイン試行が多すぎます。15分後に再試行してください' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// ─── 認証 ─────────────────────────────────────────────────
app.post('/auth/login', loginLimiter, (req, res) => {
  const { user, pass } = req.body;
  if (
    typeof user === 'string' && typeof pass === 'string' &&
    user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS
  ) {
    req.session.loggedIn = true;
    req.session.save(err => {
      if (err) { console.error('[Login] session save error:', err); return res.redirect('/login.html?error=1'); }
      res.redirect('/');
    });
  } else {
    res.redirect('/login.html?error=1');
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

app.get('/api/auth/check', (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

// ─── ヘルスチェック ────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── API 認証ミドルウェア ──────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session.loggedIn) return next();
  res.status(401).json({ error: 'ログインが必要です' });
};

app.use('/api', requireAuth);

app.use(express.static(path.join(__dirname, 'public')));

// ─── async エラーハンドラー ────────────────────────────────
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};

// ─── クエリパラメータのバリデーション ─────────────────────
function validYear(v)  { const n = parseInt(v); return n >= 2000 && n <= 2100 ? n : null; }
function validMonth(v) { const n = parseInt(v); return n >= 1    && n <= 12   ? n : null; }
function validId(v)    { const n = parseInt(v); return n > 0 ? n : null; }

// ─── BOOKINGS ─────────────────────────────────────────────

app.get('/api/bookings', wrap(async (req, res) => {
  const { company_id, branch } = req.query;
  const year  = validYear(req.query.year);
  const month = validMonth(req.query.month);
  if (req.query.year && !year)   return res.status(400).json({ error: '年が無効です' });
  if (req.query.month && !month) return res.status(400).json({ error: '月が無効です' });
  res.json(await db.getBookings(year, month, company_id, branch));
}));

app.post('/api/bookings', wrap(async (req, res) => {
  res.json(await db.insertBooking(req.body));
}));

app.put('/api/bookings/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  const updated = await db.updateBooking(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
}));

app.delete('/api/bookings/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  await db.deleteBooking(id);
  res.json({ ok: true });
}));

// ─── DASHBOARD ────────────────────────────────────────────

app.get('/api/dashboard', wrap(async (req, res) => {
  const { company_id, branch } = req.query;
  const year  = validYear(req.query.year);
  const month = validMonth(req.query.month);
  if (!year || !month) return res.status(400).json({ error: '年月が無効です' });
  res.json(await db.getDashboard(year, month, company_id, branch));
}));

// ─── CUSTOMERS ────────────────────────────────────────────

app.get('/api/customers', wrap(async (req, res) => {
  res.json(await db.getCustomers());
}));

app.get('/api/customers/bookings', wrap(async (req, res) => {
  res.json(await db.getCustomerBookings(req.query.name, req.query.account));
}));

// ─── OPERATORS ────────────────────────────────────────────

app.get('/api/operators', wrap(async (req, res) => {
  res.json(await db.getOperators());
}));

app.post('/api/operators', wrap(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '名前は必須です' });
  try {
    res.json(await db.insertOperator(name));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' });
    throw e;
  }
}));

app.put('/api/operators/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '名前は必須です' });
  try {
    const row = await db.updateOperator(id, name);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' });
    throw e;
  }
}));

app.delete('/api/operators/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  await db.deleteOperator(id);
  res.json({ ok: true });
}));

// ─── STATS ────────────────────────────────────────────────

app.get('/api/stats', wrap(async (req, res) => {
  const { company_id, branch } = req.query;
  const year  = validYear(req.query.year);
  const month = validMonth(req.query.month);
  if (!year || !month) return res.status(400).json({ error: '年月が無効です' });
  res.json(await db.getStats(year, month, company_id, branch));
}));

// ─── COMPANIES ────────────────────────────────────────────

app.get('/api/companies', wrap(async (req, res) => {
  res.json(await db.getCompanies());
}));
app.get('/api/companies/summary', wrap(async (req, res) => {
  res.json(await db.getCompanySummary());
}));
app.post('/api/companies', wrap(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: '会社名は必須です' });
  try { res.json(await db.insertCompany(req.body)); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' }); throw e; }
}));
app.put('/api/companies/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  if (!req.body.name?.trim()) return res.status(400).json({ error: '会社名は必須です' });
  try {
    const row = await db.updateCompany(id, req.body);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' }); throw e; }
}));
app.delete('/api/companies/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  await db.deleteCompany(id);
  res.json({ ok: true });
}));

// ─── STORES (支店) ─────────────────────────────────────────

app.get('/api/stores', wrap(async (req, res) => {
  res.json(await db.getStores(req.query.company_id));
}));
app.get('/api/stores/summary', wrap(async (req, res) => {
  res.json(await db.getStoreSummary(req.query.company_id));
}));
app.post('/api/stores', wrap(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: '支店名は必須です' });
  try { res.json(await db.insertStore(req.body)); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' }); throw e; }
}));
app.put('/api/stores/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  if (!req.body.name?.trim()) return res.status(400).json({ error: '支店名は必須です' });
  try {
    const row = await db.updateStore(id, req.body);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'すでに登録されています' }); throw e; }
}));
app.delete('/api/stores/:id', wrap(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'IDが無効です' });
  await db.deleteStore(id);
  res.json({ ok: true });
}));

// ─── START ────────────────────────────────────────────────

async function main() {
  await db.initDB();
  const port = parseInt(process.env.PORT) || 3636;
  app.listen(port, () => {
    console.log(`\n✅  予約管理システム 起動中`);
    console.log(`   → http://localhost:${port}\n`);
  });
}

main().catch(e => {
  console.error('\n[起動エラー]', e.message);
  process.exit(1);
});
