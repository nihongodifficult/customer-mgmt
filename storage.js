/**
 * storage.js — PostgreSQL を使ったデータ操作層
 */
const pool = require('./database');

// ─── DB 初期化（テーブル作成） ────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id            SERIAL PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT '対応中',
      store_name    TEXT NOT NULL DEFAULT '',
      cast_name     TEXT NOT NULL DEFAULT '',
      booking_date  TEXT NOT NULL DEFAULT '',
      booking_time  TEXT NOT NULL DEFAULT '',
      course        TEXT NOT NULL DEFAULT '',
      option_text   TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      media         TEXT NOT NULL DEFAULT '',
      nationality   TEXT NOT NULL DEFAULT '',
      address       TEXT NOT NULL DEFAULT '',
      room_number   TEXT NOT NULL DEFAULT '',
      features      TEXT NOT NULL DEFAULT '',
      amount        INTEGER NOT NULL DEFAULT 0,
      notes         TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_booking_date    ON bookings(booking_date);
    CREATE INDEX IF NOT EXISTS idx_customer_name   ON bookings(customer_name);
    CREATE INDEX IF NOT EXISTS idx_booking_status  ON bookings(status);
  `);
  // 既存テーブルへの追加カラム（ALTER は IF NOT EXISTS で安全）
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_date TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operators (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL DEFAULT '#7c3aed',
      address    TEXT NOT NULL DEFAULT '',
      phone      TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stores (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL DEFAULT '#94a3b8',
      company_id INTEGER REFERENCES companies(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[DB] テーブル確認 OK');
}

// ─── ヘルパー ─────────────────────────────────────────────
function _prefix(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function _int(v) { return parseInt(v) || 0; }

// ─── CRUD ────────────────────────────────────────────────
async function insertBooking(f) {
  const { rows } = await pool.query(`
    INSERT INTO bookings
      (status, store_name, cast_name, booking_date, booking_time,
       course, option_text, customer_name, media, nationality,
       address, room_number, features, amount, notes, contract_date, user_name, account_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING *
  `, [
    f.status        || '対応中',
    f.storeName     || '',
    f.castName      || '',
    f.date          || '',
    f.time          || '',
    f.course        || '',
    f.option        || '',
    f.customerName  || '',
    f.media         || '',
    f.nationality   || '',
    f.address       || '',
    f.roomNumber    || '',
    f.features      || '',
    f.amount ? _int(f.amount) : 0,
    f.notes         || '',
    f.contractDate  || '',
    f.userName      || '',
    f.accountName   || '',
  ]);
  return rows[0];
}

async function updateBooking(id, f) {
  const { rows } = await pool.query(`
    UPDATE bookings SET
      status=$1, store_name=$2, cast_name=$3, booking_date=$4, booking_time=$5,
      course=$6, option_text=$7, customer_name=$8, media=$9, nationality=$10,
      address=$11, room_number=$12, features=$13, amount=$14, notes=$15,
      contract_date=$16, user_name=$17, account_name=$18, updated_at=NOW()
    WHERE id=$19
    RETURNING *
  `, [
    f.status, f.storeName, f.castName, f.date, f.time,
    f.course, f.option, f.customerName, f.media, f.nationality,
    f.address, f.roomNumber, f.features,
    f.amount !== undefined ? _int(f.amount) : 0,
    f.notes, f.contractDate || '', f.userName || '', f.accountName || '', id,
  ]);
  return rows[0] || null;
}

async function deleteBooking(id) {
  await pool.query('DELETE FROM bookings WHERE id=$1', [id]);
}

function _storeWhere(companyId, branch) {
  // Returns { cond, params } to append to an existing WHERE clause
  const cid = parseInt(companyId) || 0;
  const br  = branch || '';
  if (br)  return { cond: `AND store_name = $~`,                                                       params: [br] };
  if (cid) return { cond: `AND store_name IN (SELECT name FROM stores WHERE company_id = $~)`,         params: [cid] };
  return { cond: '', params: [] };
}

function _buildQuery(base, paramsBefore, sw) {
  // Replace $~ placeholders with correct $N indices
  let params = [...paramsBefore, ...sw.params];
  let cond = sw.cond;
  let offset = paramsBefore.length + 1;
  cond = cond.replace(/\$~/g, () => `$${offset++}`);
  return { sql: base + ' ' + cond, params };
}

async function getBookings(year, month, companyId, branch) {
  const sw = _storeWhere(companyId, branch);
  if (year && month) {
    const { sql, params } = _buildQuery(
      `SELECT * FROM bookings WHERE contract_date LIKE $1`,
      [`${_prefix(year, month)}%`], sw
    );
    const { rows } = await pool.query(sql + ' ORDER BY contract_date DESC, booking_time DESC', params);
    return rows;
  }
  const { sql, params } = _buildQuery(`SELECT * FROM bookings WHERE 1=1`, [], sw);
  const { rows } = await pool.query(sql + ' ORDER BY contract_date DESC, booking_time DESC', params);
  return rows;
}

async function getBookingById(id) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE id=$1', [id]);
  return rows[0] || null;
}

// ─── DASHBOARD ───────────────────────────────────────────
async function getDashboard(year, month, companyId, branch) {
  const prefix = `${_prefix(year, month)}%`;
  const today  = new Date().toLocaleDateString('sv-SE');
  const sw     = _storeWhere(companyId, branch);

  const build = (base, before) => _buildQuery(base, before, sw);
  const q1 = build(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND status != 'キャンセル'`, [prefix]);
  const q2 = build(`SELECT COUNT(*) as count FROM bookings WHERE contract_date LIKE $1 AND status = 'キャンセル'`, [prefix]);
  const q3 = build(`SELECT COUNT(*) as count FROM bookings WHERE contract_date=$1 AND status != 'キャンセル'`, [today]);
  const q4 = build(`SELECT COUNT(DISTINCT customer_name) as count FROM bookings WHERE customer_name != ''`, []);
  const q5 = build(`SELECT * FROM bookings WHERE 1=1`, []);

  const [mRes, mCancelRes, tRes, cRes, rRes] = await Promise.all([
    pool.query(q1.sql, q1.params),
    pool.query(q2.sql, q2.params),
    pool.query(q3.sql, q3.params),
    pool.query(q4.sql, q4.params),
    pool.query(q5.sql + ' ORDER BY created_at DESC LIMIT 8', q5.params),
  ]);

  return {
    monthSummary:   { count: _int(mRes.rows[0].count), total: _int(mRes.rows[0].total) },
    monthCancelled: _int(mCancelRes.rows[0].count),
    todayCount:     _int(tRes.rows[0].count),
    totalCustomers: _int(cRes.rows[0].count),
    recent:         rRes.rows,
  };
}

// ─── CUSTOMERS ───────────────────────────────────────────
async function getCustomers() {
  const { rows } = await pool.query(`
    SELECT
      customer_name,
      account_name,
      COUNT(*) FILTER (WHERE status != 'キャンセル')                AS visit_count,
      COALESCE(SUM(amount) FILTER (WHERE status != 'キャンセル'), 0) AS total_amount,
      MAX(contract_date)           AS last_date,
      (SELECT nationality FROM bookings b2
         WHERE b2.customer_name = b.customer_name AND b2.account_name = b.account_name
         ORDER BY contract_date DESC LIMIT 1) AS nationality,
      (SELECT address FROM bookings b3
         WHERE b3.customer_name = b.customer_name AND b3.account_name = b.account_name
         ORDER BY contract_date DESC LIMIT 1) AS address,
      (SELECT media FROM bookings b4
         WHERE b4.customer_name = b.customer_name AND b4.account_name = b.account_name
         ORDER BY contract_date DESC LIMIT 1) AS media
    FROM bookings b
    WHERE customer_name IS NOT NULL AND customer_name != ''
    GROUP BY customer_name, account_name
    ORDER BY visit_count DESC
  `);
  return rows;
}

async function getCustomerBookings(name, account) {
  const acct = account || '';
  const { rows } = await pool.query(
    `SELECT * FROM bookings
     WHERE customer_name=$1
       AND (account_name=$2 OR (($2='' ) AND (account_name IS NULL OR account_name='')))
       AND status != 'キャンセル'
     ORDER BY contract_date DESC, booking_time DESC`,
    [name, acct]
  );
  return rows;
}

// ─── STATS ───────────────────────────────────────────────
async function getStats(year, month, companyId, branch) {
  const prefix = `${_prefix(year, month)}%`;
  const sw = _storeWhere(companyId, branch);
  const build = (base, before) => _buildQuery(base, before, sw);

  const q1 = build(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND status != 'キャンセル'`, [prefix]);
  const q2 = build(`SELECT cast_name as name, store_name, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND cast_name != '' AND status != 'キャンセル'`, [prefix]);
  const q3 = build(`SELECT store_name as name, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND store_name != '' AND status != 'キャンセル'`, [prefix]);
  const q4 = build(`SELECT media as name, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND media != '' AND status != 'キャンセル'`, [prefix]);
  const q5 = build(`SELECT nationality as name, COUNT(*) as count FROM bookings WHERE contract_date LIKE $1 AND nationality != '' AND status != 'キャンセル'`, [prefix]);

  const [sumRes, castRes, storeRes, mediaRes, natRes] = await Promise.all([
    pool.query(q1.sql, q1.params),
    pool.query(q2.sql + ' GROUP BY cast_name, store_name ORDER BY count DESC', q2.params),
    pool.query(q3.sql + ' GROUP BY store_name ORDER BY count DESC', q3.params),
    pool.query(q4.sql + ' GROUP BY media ORDER BY count DESC', q4.params),
    pool.query(q5.sql + ' GROUP BY nationality ORDER BY count DESC', q5.params),
  ]);

  // 直近6ヶ月トレンド
  const trend = [];
  let m = parseInt(month), y = parseInt(year);
  for (let i = 5; i >= 0; i--) {
    let tm = m - i, ty = y;
    while (tm <= 0) { tm += 12; ty--; }
    const qt = build(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM bookings WHERE contract_date LIKE $1 AND status != 'キャンセル'`, [`${_prefix(ty, tm)}%`]);
    const { rows } = await pool.query(qt.sql, qt.params);
    trend.push({ label: `${tm}月`, count: _int(rows[0].count), total: _int(rows[0].total) });
  }

  return {
    summary:       { count: _int(sumRes.rows[0].count), total: _int(sumRes.rows[0].total) },
    byCast:        castRes.rows,
    byStore:       storeRes.rows,
    byMedia:       mediaRes.rows,
    byNationality: natRes.rows,
    trend,
  };
}

// ─── OPERATORS ───────────────────────────────────────────
async function getOperators() {
  const { rows } = await pool.query(`SELECT id, name FROM operators ORDER BY id ASC`);
  return rows;
}
async function insertOperator(name) {
  const { rows } = await pool.query(
    `INSERT INTO operators (name) VALUES ($1) RETURNING *`, [name.trim()]
  );
  return rows[0];
}
async function updateOperator(id, name) {
  const { rows } = await pool.query(
    `UPDATE operators SET name=$1 WHERE id=$2 RETURNING *`, [name.trim(), id]
  );
  return rows[0] || null;
}
async function deleteOperator(id) {
  await pool.query(`DELETE FROM operators WHERE id=$1`, [id]);
}

// ─── COMPANIES ───────────────────────────────────────────
async function getCompanies() {
  const { rows } = await pool.query(`SELECT * FROM companies ORDER BY id ASC`);
  return rows;
}
async function insertCompany(f) {
  const { rows } = await pool.query(
    `INSERT INTO companies (name, color, address, phone, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [f.name.trim(), f.color||'#7c3aed', f.address||'', f.phone||'', f.notes||'']
  );
  return rows[0];
}
async function updateCompany(id, f) {
  const { rows } = await pool.query(
    `UPDATE companies SET name=$1, color=$2, address=$3, phone=$4, notes=$5 WHERE id=$6 RETURNING *`,
    [f.name.trim(), f.color||'#7c3aed', f.address||'', f.phone||'', f.notes||'', id]
  );
  return rows[0] || null;
}
async function deleteCompany(id) {
  await pool.query(`DELETE FROM companies WHERE id=$1`, [id]);
}
async function getCompanySummary() {
  const today = new Date().toLocaleDateString('sv-SE');
  const ym    = today.slice(0, 7);
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.color,
      COUNT(b.id) FILTER (WHERE b.contract_date LIKE $1 AND b.status != 'キャンセル') AS month_count,
      COALESCE(SUM(b.amount) FILTER (WHERE b.contract_date LIKE $1 AND b.status != 'キャンセル'), 0) AS month_total,
      COUNT(b.id) FILTER (WHERE b.contract_date=$2 AND b.status != 'キャンセル') AS today_count
    FROM companies c
    LEFT JOIN stores s ON s.company_id = c.id
    LEFT JOIN bookings b ON b.store_name = s.name
    GROUP BY c.id, c.name, c.color
    ORDER BY c.id ASC
  `, [`${ym}%`, today]);
  return rows;
}

// ─── STORES (支店) ────────────────────────────────────────
async function getStores(companyId) {
  const cid = parseInt(companyId) || 0;
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS company_name FROM stores s
     LEFT JOIN companies c ON c.id = s.company_id
     WHERE ($1=0 OR s.company_id=$1) ORDER BY s.id ASC`,
    [cid]
  );
  return rows;
}
async function insertStore(f) {
  const { rows } = await pool.query(
    `INSERT INTO stores (name, color, company_id) VALUES ($1,$2,$3) RETURNING *`,
    [f.name.trim(), f.color||'#94a3b8', parseInt(f.companyId)||null]
  );
  return rows[0];
}
async function updateStore(id, f) {
  const { rows } = await pool.query(
    `UPDATE stores SET name=$1, color=$2, company_id=$3 WHERE id=$4 RETURNING *`,
    [f.name.trim(), f.color||'#94a3b8', parseInt(f.companyId)||null, id]
  );
  return rows[0] || null;
}
async function deleteStore(id) {
  await pool.query(`DELETE FROM stores WHERE id=$1`, [id]);
}
async function getStoreSummary(companyId) {
  const today = new Date().toLocaleDateString('sv-SE');
  const ym    = today.slice(0, 7);
  const cid   = parseInt(companyId) || 0;
  const { rows } = await pool.query(`
    SELECT
      s.id, s.name, s.color, s.company_id,
      COUNT(b.id) FILTER (WHERE b.contract_date LIKE $1 AND b.status != 'キャンセル') AS month_count,
      COALESCE(SUM(b.amount) FILTER (WHERE b.contract_date LIKE $1 AND b.status != 'キャンセル'), 0) AS month_total,
      COUNT(b.id) FILTER (WHERE b.contract_date=$2 AND b.status != 'キャンセル') AS today_count
    FROM stores s
    LEFT JOIN bookings b ON b.store_name = s.name
    WHERE ($3=0 OR s.company_id=$3)
    GROUP BY s.id, s.name, s.color, s.company_id
    ORDER BY s.id ASC
  `, [`${ym}%`, today, cid]);
  return rows;
}

module.exports = {
  initDB,
  insertBooking,
  updateBooking,
  deleteBooking,
  getBookings,
  getBookingById,
  getDashboard,
  getCustomers,
  getCustomerBookings,
  getStats,
  getOperators,
  insertOperator,
  updateOperator,
  deleteOperator,
  getCompanies,
  insertCompany,
  updateCompany,
  deleteCompany,
  getCompanySummary,
  getStores,
  insertStore,
  updateStore,
  deleteStore,
  getStoreSummary,
};
