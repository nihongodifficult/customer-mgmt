'use strict';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const STORES   = ['新宿店', '池袋店', '錦糸町店', '五反田店', '大阪店', '船橋店'];
const STATUSES = ['対応中', '完了', 'キャンセル'];
const MEDIAS   = ['YOASOBI', '公式ライン', 'LINE', 'WECHAT', 'WHATSAPP', 'Telegram', 'その他'];

function storeOptions(current) {
  return STORES.map(s => `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('');
}

// ─── 担当者管理 ────────────────────────────────────────────
function getOperators() {
  try { return JSON.parse(localStorage.getItem('operators') || '[]'); } catch { return []; }
}
function saveOperators(list) {
  localStorage.setItem('operators', JSON.stringify(list));
}
function operatorOptions(current) {
  return getOperators().map(o => `<option value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o)}</option>`).join('');
}
function addOperator() {
  const name = (prompt('担当者名を入力してください') || '').trim();
  if (!name) return;
  const list = getOperators();
  if (list.includes(name)) { toast('すでに登録されています', 'error'); return; }
  list.push(name);
  saveOperators(list);
  // 全ての担当者selectを更新
  document.querySelectorAll('.operator-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">-- 選択 --</option>${operatorOptions(cur)}<option value="__add__">＋ 担当者を追加...</option>`;
    sel.value = cur;
  });
  // 追加した担当者を選択状態に
  document.querySelectorAll('.operator-select').forEach(sel => { if (!sel.value || sel.value === '__add__') sel.value = name; });
  toast(`担当者「${name}」を追加しました`);
}
function deleteOperator(name) {
  if (!confirm(`「${name}」を担当者リストから削除しますか？`)) return;
  saveOperators(getOperators().filter(o => o !== name));
  toast(`「${name}」を削除しました`);
  renderOperatorSettings();
}
function renderOperatorSettings() {
  const list = getOperators();
  const el = document.getElementById('operatorList');
  if (!el) return;
  el.innerHTML = list.length === 0
    ? '<div style="color:var(--text-muted);font-size:13px">担当者が登録されていません</div>'
    : list.map(o => `<div class="op-row">
        <span>${esc(o)}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteOperator('${esc(o)}')">削除</button>
      </div>`).join('');
}
function openOperatorManager() {
  openModal('👤 担当者管理', `
    <div class="form-group" style="display:flex;gap:8px">
      <input class="form-control" id="newOpInput" type="text" placeholder="担当者名" style="flex:1">
      <button class="btn btn-primary" onclick="addOperatorFromInput()">追加</button>
    </div>
    <div id="operatorList" style="margin-top:12px"></div>
  `);
  renderOperatorSettings();
}
function addOperatorFromInput() {
  const name = (document.getElementById('newOpInput')?.value || '').trim();
  if (!name) { toast('名前を入力してください', 'error'); return; }
  const list = getOperators();
  if (list.includes(name)) { toast('すでに登録されています', 'error'); return; }
  list.push(name);
  saveOperators(list);
  document.getElementById('newOpInput').value = '';
  renderOperatorSettings();
  toast(`「${name}」を追加しました`);
}

function mediaOptions(current) {
  return MEDIAS.map(m => `<option value="${m}"${m === current ? ' selected' : ''}>${m}</option>`).join('');
}

function statusOptions(current) {
  return STATUSES.map(s => `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('');
}

function statusBadge(status) {
  const cls = status === '完了' ? 'badge-green' : status === 'キャンセル' ? 'badge-red' : 'badge-yellow';
  return `<span class="badge ${cls}">${esc(status || '対応中')}</span>`;
}

const STORE_COLORS = {
  '新宿店':   'store-shinjuku',
  '池袋店':   'store-ikebukuro',
  '錦糸町店': 'store-kinshicho',
  '五反田店': 'store-gotanda',
  '大阪店':   'store-osaka',
  '船橋店':   'store-funabashi',
};

function storeBadge(name) {
  if (!name) return '—';
  const cls = STORE_COLORS[name] || 'store-other';
  return `<span class="store-badge ${cls}">${esc(name)}</span>`;
}

function kvRowHTML(label, html) {
  if (!html || html === '—') return '';
  return `<span class="kv-k">${label}</span><span class="kv-v">${html}</span>`;
}

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const state = {
  page: 'dashboard',
  year:       new Date().getFullYear(),
  month:      new Date().getMonth() + 1,
  statsYear:  new Date().getFullYear(),
  statsMonth: new Date().getMonth() + 1,
  editingId:  null,
};

// ═══════════════════════════════════════════════════════════
// API LAYER
// ═══════════════════════════════════════════════════════════
const api = {
  async _fetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  getBookings:       (y, m) => api._fetch(`/api/bookings?year=${y}&month=${m}`),
  createBooking:     (d)    => api._fetch('/api/bookings', { method: 'POST',   body: JSON.stringify(d) }),
  updateBooking:     (id,d) => api._fetch(`/api/bookings/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteBooking:     (id)   => api._fetch(`/api/bookings/${id}`, { method: 'DELETE' }),
  getDashboard:      (y, m) => api._fetch(`/api/dashboard?year=${y}&month=${m}`),
  getCustomers:      ()     => api._fetch('/api/customers'),
  getCustomerBkgs:   (name, account) => api._fetch(`/api/customers/bookings?name=${encodeURIComponent(name)}&account=${encodeURIComponent(account||'')}`),
  getStats:          (y, m) => api._fetch(`/api/stats?year=${y}&month=${m}`),
};

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '';
  const dt   = new Date(d + 'T00:00:00');
  const days = ['日','月','火','水','木','金','土'];
  return `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})`;
}

function fmtAmt(n) {
  const v = parseInt(n) || 0;
  return v ? `¥${v.toLocaleString()}` : '';
}

function avatar(name) {
  return String(name||'?').charAt(0).toUpperCase();
}

function loading() {
  return '<div class="loading-wrap"><div class="spinner"></div></div>';
}

function empty(msg = 'データがありません', hint = '') {
  return `<div class="empty-state">
    <div class="empty-state-icon">📭</div>
    <div class="empty-state-text">${msg}</div>
    ${hint ? `<div class="empty-state-hint">${hint}</div>` : ''}
  </div>`;
}

function kvRow(label, val) {
  if (!val) return '';
  return `<span class="kv-k">${label}</span><span class="kv-v">${esc(val)}</span>`;
}

const content = () => document.getElementById('content');

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════
const PAGE_TITLES = {
  dashboard: 'ダッシュボード',
  bookings:  '予約一覧',
  register:  '新規登録',
  customers: 'お客様一覧',
  stats:     '集計・分析',
};

async function navigate(page) {
  state.page = page;

  // Sidebar nav active
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Mobile nav active
  document.querySelectorAll('.mnav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || '';
  closeSidebar();

  content().innerHTML = loading();

  try {
    if (page === 'dashboard') await renderDashboard();
    if (page === 'bookings')  await renderBookings();
    if (page === 'register')  renderRegister();
    if (page === 'customers') await renderCustomers();
    if (page === 'stats')     await renderStats();
  } catch (e) {
    content().innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-text">読み込みエラー</div>
      <div class="empty-state-hint">${esc(e.message)}</div>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR TOGGLE (mobile)
// ═══════════════════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard() {
  const d = await api.getDashboard(state.year, state.month);
  const { monthSummary, monthCancelled, todayCount, totalCustomers, recent } = d;

  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">ダッシュボード</h1>
        <p class="page-desc">${state.year}年${state.month}月</p>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card blue">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${todayCount}</div>
        <div class="stat-label">本日の予約件数</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-value">${monthSummary.count}</div>
        <div class="stat-label">今月の予約件数（キャンセル除く）</div>
        ${monthCancelled > 0 ? `<div class="stat-sub-cancel">キャンセル ${monthCancelled}件</div>` : ''}
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">💰</div>
        <div class="stat-value" style="font-size:22px">¥${(monthSummary.total||0).toLocaleString()}</div>
        <div class="stat-label">今月の売上（キャンセル除く）</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${totalCustomers}</div>
        <div class="stat-label">総お客様数</div>
      </div>
    </div>

    <div class="section-label">直近の予約</div>
    ${recent.length === 0
      ? empty('まだ予約がありません', '「新規登録」から追加してください')
      : `<div class="card">
          <div class="card-header">
            <span class="card-title">最近追加された予約</span>
            <button class="btn btn-secondary btn-sm" onclick="navigate('bookings')">すべて見る</button>
          </div>
          <div class="table-wrap desktop-only">
            ${bookingTableHTML(recent, false)}
          </div>
          <div class="mobile-only" style="padding:10px">
            ${recent.slice(0,4).map(b => bookingCardHTML(b)).join('')}
          </div>
        </div>`
    }
  `;
}

// ═══════════════════════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════════════════════
async function renderBookings() {
  const bookings       = await api.getBookings(state.year, state.month);
  const active         = bookings.filter(b => b.status !== 'キャンセル');
  const cancelled      = bookings.filter(b => b.status === 'キャンセル');
  const totalAmount    = active.reduce((s, b) => s + (b.amount || 0), 0);

  _allBookings = bookings;
  _bFilterStatus = 'all';

  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">予約一覧</h1>
      </div>
      <button class="btn btn-primary" onclick="openAddModal()">＋ 新規登録</button>
    </div>

    <div class="toolbar">
      <div class="month-nav">
        <button class="month-nav-btn" onclick="changeMonth(-1)">◀</button>
        <span class="month-nav-label">${state.year}年${state.month}月</span>
        <button class="month-nav-btn" onclick="changeMonth(1)">▶</button>
      </div>
      <div class="summary-chips">
        <div class="schip">
          <div class="schip-val">${active.length}</div>
          <div class="schip-label">件数</div>
        </div>
        <div class="schip gold">
          <div class="schip-val" style="font-size:15px">¥${totalAmount.toLocaleString()}</div>
          <div class="schip-label">合計</div>
        </div>
        ${cancelled.length > 0 ? `<div class="schip red">
          <div class="schip-val">${cancelled.length}</div>
          <div class="schip-label">キャンセル</div>
        </div>` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <input class="search-input" id="bSearch" type="search" placeholder="🔍 お客様名・キャスト・担当者で検索..."
        style="flex:1; min-width:180px; max-width:300px" oninput="filterBookings()">
      <button class="filter-chip active" data-sf="all"    onclick="setBFilter('all')">全て</button>
      <button class="filter-chip"        data-sf="対応中"  onclick="setBFilter('対応中')">対応中</button>
      <button class="filter-chip"        data-sf="完了"    onclick="setBFilter('完了')">完了</button>
      <button class="filter-chip"        data-sf="キャンセル" onclick="setBFilter('キャンセル')">キャンセル</button>
    </div>

    <div id="bookingList">
      ${renderBookingList(bookings)}
    </div>
  `;
}

function changeMonth(d) {
  state.month += d;
  if (state.month > 12) { state.month = 1;  state.year++; }
  if (state.month < 1)  { state.month = 12; state.year--; }
  navigate('bookings');
}

let _allBookings = [];
let _bFilterStatus = 'all';

function renderBookingList(list) {
  if (!list.length) return empty('この月の予約はありません');
  return `<div class="card desktop-only">
    <div class="table-wrap">${bookingTableHTML(list, true)}</div>
  </div>
  <div class="mobile-only">
    ${list.map(b => bookingCardHTML(b)).join('')}
  </div>`;
}

function filterBookings() {
  const q = (document.getElementById('bSearch')?.value || '').toLowerCase();
  const filtered = _allBookings.filter(b => {
    const matchText = !q ||
      (b.customer_name||'').toLowerCase().includes(q) ||
      (b.account_name||'').toLowerCase().includes(q) ||
      (b.cast_name||'').toLowerCase().includes(q) ||
      (b.user_name||'').toLowerCase().includes(q) ||
      (b.store_name||'').toLowerCase().includes(q);
    const matchStatus = _bFilterStatus === 'all' || b.status === _bFilterStatus;
    return matchText && matchStatus;
  });
  const el = document.getElementById('bookingList');
  if (el) el.innerHTML = renderBookingList(filtered);
}

function setBFilter(status) {
  _bFilterStatus = status;
  document.querySelectorAll('[data-sf]').forEach(el => el.classList.toggle('active', el.dataset.sf === status));
  filterBookings();
}

function bookingTableHTML(rows, actions) {
  return `<table>
    <thead><tr>
      <th>ステータス</th>
      <th>成約日付</th>
      <th>日付</th>
      <th>時間</th>
      <th>店舗</th>
      <th>お客様</th>
      <th>キャスト</th>
      <th>コース</th>
      <th>媒体</th>
      <th>国籍</th>
      <th>金額</th>
      <th>担当者</th>
      ${actions ? '<th>操作</th>' : ''}
    </tr></thead>
    <tbody>
      ${rows.map(b => `<tr>
        <td>${statusBadge(b.status)}</td>
        <td class="td-muted">${b.contract_date ? fmtDate(b.contract_date) : '—'}</td>
        <td>${fmtDate(b.booking_date)}</td>
        <td class="td-muted">${esc(b.booking_time)}</td>
        <td>${storeBadge(b.store_name)}</td>
        <td><strong>${esc(b.customer_name||'—')}</strong>${b.account_name ? `<br><span class="td-account">@${esc(b.account_name)}</span>` : ''}</td>
        <td class="td-muted">${esc(b.cast_name)}</td>
        <td>${esc(b.course)}</td>
        <td>${esc(b.nationality)}</td>
        <td>${esc(b.media)}</td>
        <td class="td-amount">${fmtAmt(b.amount)}</td>
        <td class="td-muted">${esc(b.user_name||'—')}</td>
        ${actions ? `<td class="td-actions">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal(${b.id})">編集</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBooking(${b.id})" style="margin-left:4px">削除</button>
        </td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function bookingCardHTML(b) {
  return `<div class="bcard">
    <div class="bcard-top">
      <div>
        <div class="bcard-name">${esc(b.customer_name||'(名前なし)')}${b.account_name ? `<span class="bcard-account"> @${esc(b.account_name)}</span>` : ''}</div>
        <div class="bcard-date">${fmtDate(b.booking_date)}${b.booking_time ? ' ' + b.booking_time : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:4px">${statusBadge(b.status)}</div>
        <div class="bcard-amount">${fmtAmt(b.amount)}</div>
        <div class="bcard-cast">${esc(b.cast_name)}</div>
      </div>
    </div>
    <div class="bcard-grid">
      ${kvRow('成約日付', b.contract_date ? fmtDate(b.contract_date) : '')}
      ${kvRowHTML('店舗', storeBadge(b.store_name))}
      ${kvRow('担当者', b.user_name)}
      ${kvRow('コース', b.course)}
      ${kvRow('オプション', b.option_text)}
      ${kvRow('媒体', b.media)}
      ${kvRow('国籍', b.nationality)}
      ${kvRow('住所', b.address)}
      ${kvRow('部屋', b.room_number)}
      ${kvRow('特徴', b.features)}
    </div>
    <div class="bcard-actions">
      <button class="btn btn-secondary btn-sm" onclick="openEditModal(${b.id})">編集</button>
      <button class="btn btn-danger btn-sm" onclick="deleteBooking(${b.id})">削除</button>
    </div>
  </div>`;
}

async function deleteBooking(id) {
  if (!confirm('この予約を削除しますか？')) return;
  await api.deleteBooking(id);
  toast('削除しました');
  navigate(state.page);
}

// ═══════════════════════════════════════════════════════════
// BOOKING FORM (shared between register & edit modal)
// ═══════════════════════════════════════════════════════════
function bookingFormHTML(b = {}) {
  const v = (field, def = '') => esc(b[field] ?? def);
  const today = new Date().toLocaleDateString('sv-SE');
  const contractDateVal = b.id !== undefined ? (b.contract_date || '') : today;
  return `
    <div class="fg4">
      <div class="form-group">
        <label class="form-label">ステータス</label>
        <select class="form-control" id="fStatus">
          ${statusOptions(b.status || '対応中')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">店舗名</label>
        <select class="form-control" id="fStore">
          <option value="">-- 選択してください --</option>
          ${storeOptions(b.store_name || '')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">成約日付</label>
        <input class="form-control" id="fContractDate" type="date" value="${esc(contractDateVal)}">
      </div>
      <div class="form-group">
        <label class="form-label">担当者</label>
        <div style="display:flex;gap:6px">
          <select class="form-control operator-select" id="fUserName" onchange="if(this.value==='__add__'){addOperator();this.value=''}">
            <option value="">-- 選択 --</option>
            ${operatorOptions(v('user_name'))}
            <option value="__add__">＋ 担当者を追加...</option>
          </select>
        </div>
      </div>
    </div>
    <div class="fg3">
      <div class="form-group">
        <label class="form-label">キャスト名</label>
        <input class="form-control" id="fCast" type="text" value="${v('cast_name')}" placeholder="例：こはく">
      </div>
      <div class="form-group">
        <label class="form-label">日付</label>
        <input class="form-control" id="fDate" type="date" value="${v('booking_date')}">
      </div>
      <div class="form-group">
        <label class="form-label">時間</label>
        <input class="form-control" id="fTime" type="time" value="${v('booking_time')}">
      </div>
    </div>
    <div class="fg3">
      <div class="form-group">
        <label class="form-label">コース</label>
        <input class="form-control" id="fCourse" type="text" value="${v('course')}" placeholder="例：60min">
      </div>
      <div class="form-group">
        <label class="form-label">オプション</label>
        <input class="form-control" id="fOption" type="text" value="${v('option_text')}">
      </div>
    </div>
    <div class="fg4">
      <div class="form-group">
        <label class="form-label">お客様名前</label>
        <input class="form-control" id="fCustomer" type="text" value="${v('customer_name')}" placeholder="例：Quantum">
      </div>
      <div class="form-group">
        <label class="form-label">アカウント名</label>
        <input class="form-control" id="fAccount" type="text" value="${v('account_name')}" placeholder="例：@quantum123">
      </div>
      <div class="form-group">
        <label class="form-label">媒体</label>
        <select class="form-control" id="fMedia">
          <option value="">-- 選択してください --</option>
          ${mediaOptions(b.media || '')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">国籍</label>
        <input class="form-control" id="fNationality" type="text" value="${v('nationality')}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">住所</label>
      <input class="form-control" id="fAddress" type="text" value="${v('address')}">
    </div>
    <div class="fg3">
      <div class="form-group">
        <label class="form-label">部屋番号</label>
        <input class="form-control" id="fRoom" type="text" value="${v('room_number')}">
      </div>
      <div class="form-group">
        <label class="form-label">金額（円）</label>
        <input class="form-control" id="fAmount" type="number" value="${b.amount || ''}" placeholder="例：40000" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">備考</label>
        <input class="form-control" id="fNotes" type="text" value="${v('notes')}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">お客様の特徴・服装</label>
      <textarea class="form-control" id="fFeatures" rows="2">${v('features')}</textarea>
    </div>
  `;
}

function collectForm() {
  const g = id => document.getElementById(id)?.value.trim() || '';
  return {
    status:        g('fStatus'),
    storeName:     g('fStore'),
    contractDate:  g('fContractDate'),
    castName:     g('fCast'),
    date:         g('fDate'),
    time:         g('fTime'),
    course:       g('fCourse'),
    option:       g('fOption'),
    customerName: g('fCustomer'),
    accountName:  g('fAccount'),
    media:        g('fMedia'),
    nationality:  g('fNationality'),
    address:      g('fAddress'),
    roomNumber:   g('fRoom'),
    features:     g('fFeatures'),
    amount:       g('fAmount'),
    notes:        g('fNotes'),
    userName:     g('fUserName') === '__add__' ? '' : g('fUserName'),
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER PAGE
// ═══════════════════════════════════════════════════════════
function renderRegister() {
  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">新規登録</h1>
        <p class="page-desc">テンプレートを貼り付けるか、手動で入力してください</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" id="tabTpl"    onclick="switchTab('tpl')">📋 テンプレート貼付</button>
      <button class="tab-btn"        id="tabManual" onclick="switchTab('manual')">✏️ 手動入力</button>
    </div>

    <!-- Template tab -->
    <div id="tabContentTpl">
      <div class="form-section">
        <div class="form-section-title">予約テンプレートを貼り付け</div>
        <div class="form-group">
          <textarea class="form-control" id="tplInput" style="min-height:200px; font-size:13px"
            placeholder="お疲れ様です！
インバウンドの予約が入りました:

女の子名前：
日付：
コース：
オプション：
お客様名前：
媒体：
国籍：
住所：
部屋番号：
お客様の服装：
金額："></textarea>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="parseTpl()">📖 内容を読み取る →</button>
      </div>
    </div>

    <!-- Manual tab -->
    <div id="tabContentManual" style="display:none">
      <form onsubmit="return false">
        <div class="form-section">
          <div class="form-section-title">予約情報</div>
          ${bookingFormHTML()}
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-lg" onclick="submitNewBooking()">✅ 登録する</button>
          <button class="btn btn-secondary" onclick="clearRegisterForm()">クリア</button>
        </div>
      </form>
    </div>
  `;
}

function switchTab(tab) {
  const isTpl = tab === 'tpl';
  document.getElementById('tabContentTpl').style.display    = isTpl ? 'block' : 'none';
  document.getElementById('tabContentManual').style.display = isTpl ? 'none' : 'block';
  document.getElementById('tabTpl').classList.toggle('active', isTpl);
  document.getElementById('tabManual').classList.toggle('active', !isTpl);
}

function parseTpl() {
  const text = document.getElementById('tplInput')?.value || '';
  if (!text.trim()) { toast('テンプレートを貼り付けてください', 'error'); return; }

  const get = key => {
    const re = new RegExp(`${key}[：:][ 　\\t]*(.*?)\\s*(?:\\r?\\n|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  const dateStr = get('日付');
  let date = '', time = '';
  const dm = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})/);
  const tm = dateStr.match(/(\d{1,2})[時:](\d{0,2})/);
  if (dm) date = `${new Date().getFullYear()}-${dm[1].padStart(2,'0')}-${dm[2].padStart(2,'0')}`;
  if (tm) time = `${tm[1].padStart(2,'0')}:${(tm[2]||'00').padStart(2,'0')}`;

  let castName = get('女の子名前').replace(/様$/, '').trim();
  let amount   = get('金額').replace(/[^0-9]/g, '');
  let features = get('お客様の服装') || get('お客様特徴') || get('お客様の特徴');

  switchTab('manual');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('fStatus',      '対応中');
  set('fCast',        castName);
  set('fDate',        date);
  set('fTime',        time);
  set('fCourse',      get('コース'));
  set('fOption',      get('オプション'));
  set('fCustomer',    get('お客様名前'));
  set('fAccount',     get('アカウント名') || get('アカウント') || get('ID'));
  set('fMedia',       get('媒体'));
  set('fNationality', get('国籍'));
  set('fAddress',     get('住所'));
  set('fRoom',        get('部屋番号'));
  set('fFeatures',    features);
  set('fAmount',      amount);

  toast('読み取り完了！内容を確認して登録してください');
}

function clearRegisterForm() {
  ['fStatus','fStore','fContractDate','fCast','fDate','fTime','fCourse','fOption','fCustomer','fMedia',
   'fNationality','fAddress','fRoom','fFeatures','fAmount','fNotes','fUserName','fAccount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function submitNewBooking() {
  const data = collectForm();
  if (!data.customerName && !data.castName) {
    toast('お客様名かキャスト名を入力してください', 'error'); return;
  }
  await api.createBooking(data);
  toast('登録しました！');
  clearRegisterForm();
  switchTab('tpl');
  document.getElementById('tplInput').value = '';
  setTimeout(() => navigate('bookings'), 600);
}

// ═══════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════
let _customers = [];

async function renderCustomers() {
  _customers = await api.getCustomers();

  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">お客様一覧</h1>
        <p class="page-desc">累計 ${_customers.length} 名</p>
      </div>
    </div>
    <div class="search-wrap mb-4">
      <span class="search-icon">🔍</span>
      <input class="search-input" id="customerSearch" type="search" placeholder="お客様名で検索..."
        oninput="filterCustomers()">
    </div>
    <div class="customer-grid" id="customerGrid">
      ${renderCustomerCards(_customers)}
    </div>
  `;
}

function renderCustomerCards(list) {
  if (!list.length) return empty('お客様がいません');
  return list.map((c, i) => `
    <div class="ccard" onclick="showCustomerDetail(${i})">
      <div class="ccard-avatar">${avatar(c.customer_name)}</div>
      <div class="ccard-name">${esc(c.customer_name)}</div>
      ${c.account_name ? `<div class="ccard-account">@${esc(c.account_name)}</div>` : ''}
      <div class="ccard-meta">
        <span>来店 ${c.visit_count}回</span>
        ${c.nationality ? `<span>🌏 ${esc(c.nationality)}</span>` : ''}
        ${c.last_date   ? `<span>最終: ${fmtDate(c.last_date)}</span>` : ''}
        ${c.total_amount ? `<span class="gold">${fmtAmt(c.total_amount)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function filterCustomers() {
  const q = (document.getElementById('customerSearch')?.value || '').toLowerCase();
  const filtered = q ? _customers.filter(c =>
    c.customer_name.toLowerCase().includes(q) ||
    (c.account_name||'').toLowerCase().includes(q)
  ) : _customers;
  document.getElementById('customerGrid').innerHTML = renderCustomerCards(filtered);
}

async function showCustomerDetail(idx) {
  const c = _customers[idx];
  if (!c) return;
  const bkgs = await api.getCustomerBkgs(c.customer_name, c.account_name);

  openModal(`👤 ${c.customer_name}`, `
    ${c.account_name ? `<div class="modal-account-name">@${esc(c.account_name)}</div>` : ''}
    <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div class="schip">
        <div class="schip-val">${c.visit_count}</div>
        <div class="schip-label">来店回数</div>
      </div>
      <div class="schip gold">
        <div class="schip-val" style="font-size:15px">${fmtAmt(c.total_amount)}</div>
        <div class="schip-label">累計金額</div>
      </div>
      ${c.nationality ? `<div class="schip"><div class="schip-val" style="font-size:14px">🌏 ${esc(c.nationality)}</div><div class="schip-label">国籍</div></div>` : ''}
      ${c.media ? `<div class="schip"><div class="schip-val" style="font-size:13px">${esc(c.media)}</div><div class="schip-label">媒体</div></div>` : ''}
    </div>
    ${c.address ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:14px">📍 ${esc(c.address)}</div>` : ''}
    <div class="section-label">来店履歴</div>
    ${bkgs.map(b => `
      <div class="bcard" style="cursor:default">
        <div class="bcard-top">
          <div>
            <div style="font-size:13px; font-weight:600">${fmtDate(b.booking_date)}${b.booking_time ? ' ' + b.booking_time : ''}</div>
            <div class="bcard-cast">${esc(b.cast_name)}</div>
          </div>
          <div class="bcard-amount">${fmtAmt(b.amount)}</div>
        </div>
        <div class="kv-grid" style="font-size:12px">
          ${kvRowHTML('店舗', storeBadge(b.store_name))}
          ${kvRow('担当者', b.user_name)}
          ${kvRow('コース', b.course)}
          ${kvRow('住所', b.address)}
          ${kvRow('部屋', b.room_number)}
          ${kvRow('特徴', b.features)}
        </div>
      </div>
    `).join('')}
  `);
}

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════
let _chartInstance = null;

async function renderStats() {
  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">集計・分析</h1>
      </div>
      <div class="month-nav">
        <button class="month-nav-btn" onclick="changeStatsMonth(-1)">◀</button>
        <span class="month-nav-label" id="statsMonthLabel">${state.statsYear}年${state.statsMonth}月</span>
        <button class="month-nav-btn" onclick="changeStatsMonth(1)">▶</button>
      </div>
    </div>
    <div id="statsContent"><div class="loading-wrap"><div class="spinner"></div></div></div>
  `;
  await loadStats();
}

async function loadStats() {
  const d = await api.getStats(state.statsYear, state.statsMonth);
  const { summary, byCast, byStore, byMedia, byNationality, trend } = d;

  document.getElementById('statsMonthLabel').textContent = `${state.statsYear}年${state.statsMonth}月`;

  document.getElementById('statsContent').innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-value">${summary.count}</div>
        <div class="stat-label">予約件数</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">💰</div>
        <div class="stat-value" style="font-size:22px">¥${(summary.total||0).toLocaleString()}</div>
        <div class="stat-label">合計売上</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">📊</div>
        <div class="stat-value">${summary.count ? Math.round(summary.total / summary.count).toLocaleString() : 0}</div>
        <div class="stat-label">平均単価 (円)</div>
      </div>
    </div>

    <!-- Trend chart -->
    <div class="chart-card" style="margin-bottom:20px">
      <div class="chart-title">📈 月別売上トレンド（直近6ヶ月）</div>
      <div class="chart-box"><canvas id="trendChart"></canvas></div>
    </div>

    <!-- Store breakdown (full width) -->
    <div class="chart-card" style="margin-bottom:20px">
      <div class="chart-title">🏪 店舗別</div>
      <div class="slist">
        ${byStore.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">データなし</div>' :
          byStore.map(r => {
            const pct = summary.total ? Math.round(r.total / summary.total * 100) : 0;
            return `<div class="slist-item">
              <span>${storeBadge(r.name)}</span>
              <span class="slist-right">
                ${r.count}件
                <span class="text-gold" style="margin-left:10px">${fmtAmt(r.total)}</span>
                <span style="color:var(--text-muted);font-size:11px;margin-left:8px">${pct}%</span>
              </span>
            </div>
            <div class="store-bar-wrap">
              <div class="store-bar" style="width:${pct}%"></div>
            </div>`;
          }).join('')}
      </div>
    </div>

    <div class="stats-grid-2">
      <!-- Cast -->
      <div class="chart-card">
        <div class="chart-title">🎀 キャスト別</div>
        <div class="slist">
          ${byCast.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">データなし</div>' :
            byCast.map(r => `<div class="slist-item">
              <span>${esc(r.name)}</span>
              <span class="slist-right">${r.count}件 <span class="text-gold">${fmtAmt(r.total)}</span></span>
            </div>`).join('')}
        </div>
      </div>
      <!-- Media -->
      <div class="chart-card">
        <div class="chart-title">📱 媒体別</div>
        <div class="slist">
          ${byMedia.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">データなし</div>' :
            byMedia.map(r => `<div class="slist-item">
              <span>${esc(r.name)}</span>
              <span class="slist-right">${r.count}件 <span class="text-gold">${fmtAmt(r.total)}</span></span>
            </div>`).join('')}
        </div>
      </div>
      <!-- Nationality -->
      <div class="chart-card">
        <div class="chart-title">🌏 国籍別</div>
        <div class="slist">
          ${byNationality.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">データなし</div>' :
            byNationality.map(r => `<div class="slist-item">
              <span>${esc(r.name)}</span>
              <span class="slist-right">${r.count}件</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;

  // Draw chart
  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
  const ctx = document.getElementById('trendChart');
  if (ctx) {
    _chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: trend.map(t => t.label),
        datasets: [{
          data: trend.map(t => t.total),
          backgroundColor: trend.map((_, i) => i === trend.length - 1 ? 'rgba(124,58,237,.85)' : 'rgba(124,58,237,.35)'),
          borderColor:     'rgba(124,58,237,1)',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `¥${Number(c.raw).toLocaleString()}` } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b' } },
          y: {
            grid: { color: 'rgba(255,255,255,.04)' },
            ticks: {
              color: '#64748b',
              callback: v => v === 0 ? '0' : `${(v/10000).toFixed(0)}万`,
            },
          },
        },
      },
    });
  }
}

function changeStatsMonth(d) {
  state.statsMonth += d;
  if (state.statsMonth > 12) { state.statsMonth = 1;  state.statsYear++; }
  if (state.statsMonth < 1)  { state.statsMonth = 12; state.statsYear--; }
  loadStats();
}

// ═══════════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ═══════════════════════════════════════════════════════════
function openAddModal() {
  state.editingId = null;
  openModal('＋ 新規予約登録', `
    ${bookingFormHTML()}
    <div class="form-actions mt-4">
      <button class="btn btn-primary btn-lg" onclick="saveModalBooking()">✅ 登録する</button>
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    </div>
  `);
}

async function openEditModal(id) {
  state.editingId = id;
  const bookings  = await api.getBookings(state.year, state.month);
  const b         = bookings.find(x => x.id === id);
  if (!b) { toast('予約が見つかりません', 'error'); return; }

  openModal('✏️ 予約を編集', `
    ${bookingFormHTML(b)}
    <div class="form-actions mt-4">
      <button class="btn btn-primary btn-lg" onclick="saveModalBooking()">💾 保存する</button>
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    </div>
  `);
}

async function saveModalBooking() {
  const data = collectForm();
  if (!data.customerName && !data.castName) {
    toast('お客様名かキャスト名を入力してください', 'error'); return;
  }
  if (state.editingId) {
    await api.updateBooking(state.editingId, data);
    toast('更新しました');
  } else {
    await api.createBooking(data);
    toast('登録しました');
  }
  closeModal();
  navigate(state.page);
}

// ═══════════════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════════════
function openModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = bodyHTML;
  document.getElementById('modalBackdrop').classList.add('open');
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
let _toastTimer = null;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show${type === 'error' ? ' error' : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('theme') || 'dark');
  navigate('dashboard');
});
