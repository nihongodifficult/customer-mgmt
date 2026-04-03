require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. companies テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        color      TEXT NOT NULL DEFAULT '#7c3aed',
        address    TEXT NOT NULL DEFAULT '',
        phone      TEXT NOT NULL DEFAULT '',
        notes      TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ companies テーブル作成');

    // 2. stores の既存データ（会社レベル）を companies へ移行
    const { rows: existingStores } = await client.query(`SELECT * FROM stores`);
    for (const s of existingStores) {
      await client.query(
        `INSERT INTO companies (name, color, address, phone, notes)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING`,
        [s.name, s.color, s.address||'', s.phone||'', s.notes||'']
      );
      console.log(`  → companies へ移行: ${s.name}`);
    }

    // 3. stores テーブルに company_id カラム追加
    await client.query(`
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)
    `);
    console.log('✅ stores.company_id カラム追加');

    // 4. stores テーブルから会社レベルのレコードを削除
    const companyNames = existingStores.map(s => s.name);
    if (companyNames.length) {
      await client.query(
        `DELETE FROM stores WHERE name = ANY($1)`, [companyNames]
      );
      console.log(`✅ stores から会社レコードを削除: ${companyNames.join(', ')}`);
    }

    // 5. bookings に存在する支店名を stores へ挿入
    const defaultCompany = await client.query(
      `SELECT id FROM companies WHERE name = 'E+アイドルスクール' LIMIT 1`
    );
    const companyId = defaultCompany.rows[0]?.id;
    if (!companyId) throw new Error('E+アイドルスクール が companies に見つかりません');

    const BRANCH_COLORS = {
      '新宿店':   '#a78bfa',
      '池袋店':   '#93c5fd',
      '錦糸町店': '#6ee7b7',
      '五反田店': '#fbbf24',
      '大阪店':   '#fca5a5',
      '船橋店':   '#f9a8d4',
    };

    const { rows: branches } = await client.query(
      `SELECT DISTINCT store_name FROM bookings WHERE store_name != '' ORDER BY store_name`
    );
    for (const b of branches) {
      const color = BRANCH_COLORS[b.store_name] || '#94a3b8';
      await client.query(
        `INSERT INTO stores (name, color, company_id)
         VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET company_id=$3`,
        [b.store_name, color, companyId]
      );
      console.log(`  → 支店登録: ${b.store_name}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ マイグレーション完了');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
