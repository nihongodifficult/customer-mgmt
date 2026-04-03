require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function run() {
  const client = await pool.connect();
  try {
    const STORE_NAME  = 'E+アイドルスクール';
    const STORE_COLOR = '#7c3aed';

    // 1. stores テーブルに挿入（すでにあればスキップ）
    await client.query(`
      INSERT INTO stores (name, color) VALUES ($1, $2)
      ON CONFLICT (name) DO NOTHING
    `, [STORE_NAME, STORE_COLOR]);
    console.log(`✅ 店舗「${STORE_NAME}」をstoresテーブルに登録しました`);

    // 2. store_name が空のデータをすべて更新
    const { rowCount } = await client.query(`
      UPDATE bookings SET store_name = $1
      WHERE store_name = '' OR store_name IS NULL
    `, [STORE_NAME]);
    console.log(`✅ 既存データ ${rowCount} 件の店舗名を「${STORE_NAME}」に更新しました`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
