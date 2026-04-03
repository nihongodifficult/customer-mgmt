require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool }  = require('pg');

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error('使い方: node import-csv.js <CSVファイルのパス>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// 日本語日付 "2026年2月2日 23:45 (JST)" → "2026-02-02"
function parseDate(s) {
  if (!s || !s.trim()) return '';
  const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
}

// 時間 "2026年2月2日 23:45 (JST)" → "23:45"
function parseTime(s) {
  if (!s) return '';
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2,'0')}:${m[2]}`;
}

// "￥40,000" → 40000
function parseAmount(s) {
  if (!s) return 0;
  return parseInt(String(s).replace(/[^0-9]/g, '')) || 0;
}

// 店舗名の表記ゆれ修正
function normalizeStore(s) {
  s = (s || '').trim();
  if (s === '五反田') return '五反田店';
  return s;
}

// 媒体の表記ゆれ修正
function normalizeMedia(s) {
  const map = { 'WeChat':'WECHAT', 'wechat':'WECHAT', 'WhatsApp':'WHATSAPP', 'whatsapp':'WHATSAPP', 'Telegram':'Telegram' };
  return map[s] || s || '';
}

async function run() {
  const content = fs.readFileSync(CSV_PATH);
  const records = parse(content, {
    columns: true,
    skip_empty_lines: false,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });

  console.log(`📄 ${records.length} 件読み込み`);

  let inserted = 0, skipped = 0;
  const client = await pool.connect();
  try {
    for (const r of records) {
      const customerName = (r['お客様氏名'] || '').trim().replace(/^\n+|\n+$/g, '').trim();
      const castName     = (r['キャスト様氏名'] || '').trim();
      const contractDate = parseDate(r['成約日付'] || '');
      // 予約日付がない、または成約日付と月が違う場合は成約日付を優先
      const rawBookingDate = parseDate(r['予約日付'] || '');
      const bookingDate = (!rawBookingDate || (contractDate && rawBookingDate.slice(0,7) !== contractDate.slice(0,7)))
        ? (contractDate || rawBookingDate)
        : rawBookingDate;
      const bookingTime  = parseTime(r['予約日付'] || '');
      const storeName    = normalizeStore(r['店舗名'] || '');
      const course       = (r['コース'] || '').trim();
      const option       = (r['op'] || '').trim();
      const address      = (r['住所'] || '').replace(/\n/g, ' ').trim();
      const nationality  = (r['国'] || '').trim();
      const media        = normalizeMedia((r['連絡手段'] || '').trim());
      const notes        = (r['メモ'] || '').trim();
      const amount       = parseAmount(r['金額'] || '');
      const status       = (r['ステータス'] || '完了').trim();

      if (!customerName && !castName) { skipped++; continue; }

      await client.query(`
        INSERT INTO bookings
          (status, store_name, cast_name, booking_date, booking_time,
           course, option_text, customer_name, account_name, media, nationality,
           address, amount, notes, contract_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [
        status, storeName, castName, bookingDate, bookingTime,
        course, option, customerName, customerName, media, nationality,
        address, amount, notes, contractDate,
      ]);
      inserted++;
      process.stdout.write(`\r  登録中: ${inserted}件...`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n✅ 完了: ${inserted}件登録 / ${skipped}件スキップ`);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
