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

async function getBookings(year, month) {
  if (year && month) {
    const { rows } = await pool.query(
      `SELECT * FROM bookings WHERE booking_date LIKE $1
       ORDER BY booking_date DESC, booking_time DESC`,
      [`${_prefix(year, month)}%`]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT * FROM bookings ORDER BY booking_date DESC, booking_time DESC`
  );
  return rows;
}

async function getBookingById(id) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE id=$1', [id]);
  return rows[0] || null;
}

// ─── DASHBOARD ───────────────────────────────────────────
async function getDashboard(year, month) {
  const prefix = `${_prefix(year, month)}%`;
  const today  = new Date().toLocaleDateString('sv-SE');

  const [mRes, mCancelRes, tRes, cRes, rRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM bookings WHERE booking_date LIKE $1 AND status != 'キャンセル'`, [prefix]),
    pool.query(`SELECT COUNT(*) as count
                FROM bookings WHERE booking_date LIKE $1 AND status = 'キャンセル'`, [prefix]),
    pool.query(`SELECT COUNT(*) as count FROM bookings WHERE (booking_date=$1 OR created_at::date = $1::date) AND status != 'キャンセル'`, [today]),
    pool.query(`SELECT COUNT(DISTINCT customer_name) as count
                FROM bookings WHERE customer_name != ''`),
    pool.query(`SELECT * FROM bookings ORDER BY created_at DESC LIMIT 8`),
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
      MAX(booking_date)           AS last_date,
      (SELECT nationality FROM bookings b2
         WHERE b2.customer_name = b.customer_name AND b2.account_name = b.account_name
         ORDER BY booking_date DESC LIMIT 1) AS nationality,
      (SELECT address FROM bookings b3
         WHERE b3.customer_name = b.customer_name AND b3.account_name = b.account_name
         ORDER BY booking_date DESC LIMIT 1) AS address,
      (SELECT media FROM bookings b4
         WHERE b4.customer_name = b.customer_name AND b4.account_name = b.account_name
         ORDER BY booking_date DESC LIMIT 1) AS media
    FROM bookings b
    WHERE customer_name IS NOT NULL AND customer_name != ''
    GROUP BY customer_name, account_name
    ORDER BY visit_count DESC
  `);
  return rows;
}

async function getCustomerBookings(name, account) {
  const { rows } = await pool.query(
    `SELECT * FROM bookings WHERE customer_name=$1 AND account_name=$2 AND status != 'キャンセル'
     ORDER BY booking_date DESC, booking_time DESC`,
    [name, account ?? '']
  );
  return rows;
}

// ─── STATS ───────────────────────────────────────────────
async function getStats(year, month) {
  const prefix = `${_prefix(year, month)}%`;

  const [sumRes, castRes, storeRes, mediaRes, natRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM bookings WHERE booking_date LIKE $1 AND status != 'キャンセル'`, [prefix]),
    pool.query(`SELECT cast_name as name, COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM bookings WHERE booking_date LIKE $1 AND cast_name != '' AND status != 'キャンセル'
                GROUP BY cast_name ORDER BY count DESC`, [prefix]),
    pool.query(`SELECT store_name as name, COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM bookings WHERE booking_date LIKE $1 AND store_name != '' AND status != 'キャンセル'
                GROUP BY store_name ORDER BY count DESC`, [prefix]),
    pool.query(`SELECT media as name, COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM bookings WHERE booking_date LIKE $1 AND media != '' AND status != 'キャンセル'
                GROUP BY media ORDER BY count DESC`, [prefix]),
    pool.query(`SELECT nationality as name, COUNT(*) as count
                FROM bookings WHERE booking_date LIKE $1 AND nationality != '' AND status != 'キャンセル'
                GROUP BY nationality ORDER BY count DESC`, [prefix]),
  ]);

  // 直近6ヶ月トレンド
  const trend = [];
  let m = parseInt(month), y = parseInt(year);
  for (let i = 5; i >= 0; i--) {
    let tm = m - i, ty = y;
    while (tm <= 0) { tm += 12; ty--; }
    const p = `${_prefix(ty, tm)}%`;
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
       FROM bookings WHERE booking_date LIKE $1 AND status != 'キャンセル'`, [p]
    );
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
};
