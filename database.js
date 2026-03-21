/**
 * database.js — PostgreSQL 接続プール
 */
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('\n[ERROR] DATABASE_URL が .env に設定されていません。');
  console.error('  .env.example をコピーして .env を作成し、接続情報を入力してください。\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 本番サーバー (Supabase, Render 等) では SSL が必要
  ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] 予期しないエラー:', err.message);
});

module.exports = pool;
