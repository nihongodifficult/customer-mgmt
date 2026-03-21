/**
 * setup-db.js — DB作成 & .env 生成
 * 使い方: node setup-db.js
 */
const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const { Client } = require('pg');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  console.log('\n==============================');
  console.log('  PostgreSQL セットアップ');
  console.log('==============================\n');

  const host     = await ask('ホスト      [localhost]: ') || 'localhost';
  const port     = await ask('ポート      [5432]:     ') || '5432';
  const user     = await ask('ユーザー名  [postgres]: ') || 'postgres';
  const password = await ask('パスワード            : ');
  const dbName   = await ask('データベース名 [yoyaku]: ') || 'yoyaku';

  rl.close();

  // まず postgres DB に接続してデータベースを作成
  const adminClient = new Client({
    host, port: parseInt(port), user, password, database: 'postgres',
  });

  try {
    console.log('\nPostgreSQLに接続中...');
    await adminClient.connect();
    console.log('[OK] 接続成功');

    // データベース作成（既存の場合はスキップ）
    const exists = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]
    );
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[OK] データベース "${dbName}" を作成しました`);
    } else {
      console.log(`[OK] データベース "${dbName}" は既に存在します`);
    }
  } catch (e) {
    console.error('\n[ERROR] 接続失敗:', e.message);
    console.error('  パスワードやポートを確認してください\n');
    process.exit(1);
  } finally {
    await adminClient.end();
  }

  // .env 作成
  const url = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
  const envContent = `DATABASE_URL=${url}\nPORT=3636\n`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log('[OK] .env を作成しました');

  console.log('\n==============================');
  console.log('  完了！');
  console.log('  次: node migrate.js  (データ移行)');
  console.log('  次: start.bat        (サーバー起動)');
  console.log('==============================\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
