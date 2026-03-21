/**
 * migrate.js — db.json のデータを PostgreSQL へ移行
 * 使い方: node migrate.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('./storage');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

async function migrate() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('db.json が見つかりません。移行するデータはありません。');
    process.exit(0);
  }

  const json     = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const bookings = json.bookings || [];

  if (bookings.length === 0) {
    console.log('移行するデータがありません。');
    process.exit(0);
  }

  console.log(`\n📦 ${bookings.length} 件のデータを移行します...\n`);

  await db.initDB();

  let ok = 0, fail = 0;
  for (const b of bookings) {
    try {
      await db.insertBooking({
        status:       b.status       || '対応中',
        storeName:    b.store_name   || '',
        castName:     b.cast_name    || '',
        date:         b.booking_date || '',
        time:         b.booking_time || '',
        course:       b.course       || '',
        option:       b.option_text  || '',
        customerName: b.customer_name|| '',
        media:        b.media        || '',
        nationality:  b.nationality  || '',
        address:      b.address      || '',
        roomNumber:   b.room_number  || '',
        features:     b.features     || '',
        amount:       b.amount       || 0,
        notes:        b.notes        || '',
      });
      ok++;
      process.stdout.write(`  [OK] #${b.id} ${b.customer_name || '(名前なし)'}\n`);
    } catch (e) {
      fail++;
      process.stdout.write(`  [NG] #${b.id} ${e.message}\n`);
    }
  }

  console.log(`\n✅ 移行完了: 成功 ${ok} 件 / 失敗 ${fail} 件`);

  // バックアップ
  const bak = DB_FILE + '.bak';
  fs.copyFileSync(DB_FILE, bak);
  console.log(`💾 元データをバックアップ: ${bak}\n`);

  process.exit(0);
}

migrate().catch(e => {
  console.error('\n[エラー]', e.message);
  process.exit(1);
});
