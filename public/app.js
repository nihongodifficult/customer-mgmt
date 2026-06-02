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

// ─── 担当者管理 (DB版) ────────────────────────────────────
let _operators = [];   // キャッシュ

async function loadOperators() {
  _operators = await api._fetch('/api/operators');
}
function operatorOptions(current) {
  return _operators.map(o =>
    `<option value="${esc(o.name)}"${o.name === current ? ' selected' : ''}>${esc(o.name)}</option>`
  ).join('');
}
function _refreshOperatorSelects(selectVal) {
  document.querySelectorAll('.operator-select').forEach(sel => {
    const cur = selectVal !== undefined ? selectVal : sel.value;
    sel.innerHTML = `<option value="">-- 選択 --</option>${operatorOptions(cur)}<option value="__add__">＋ 担当者を追加...</option>`;
    sel.value = cur;
  });
}
async function addOperator() {
  const name = (prompt('担当者名を入力してください') || '').trim();
  if (!name) return;
  try {
    const row = await api._fetch('/api/operators', { method:'POST', body: JSON.stringify({ name }) });
    _operators.push(row);
    _refreshOperatorSelects(row.name);
    toast(`担当者「${name}」を追加しました`);
  } catch (e) { toast(e.message, 'error'); }
}
async function renderOperatorSettings() {
  const el = document.getElementById('operatorList');
  if (!el) return;
  await loadOperators();
  el.innerHTML = _operators.length === 0
    ? '<div style="color:var(--text-muted);font-size:13px">担当者が登録されていません</div>'
    : _operators.map(o => `<div class="op-row" id="op-row-${o.id}">
        <span class="op-name" id="op-name-${o.id}">${esc(o.name)}</span>
        <span class="op-edit-input" id="op-edit-${o.id}" style="display:none;flex:1;margin-right:8px">
          <input class="form-control" style="height:28px;font-size:13px" id="op-input-${o.id}" value="${esc(o.name)}">
        </span>
        <span style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" id="op-btn-edit-${o.id}" onclick="startEditOperator(${o.id})">修正</button>
          <button class="btn btn-primary btn-sm"   id="op-btn-save-${o.id}" style="display:none" onclick="saveEditOperator(${o.id})">保存</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteOperator(${o.id},'${esc(o.name)}')">削除</button>
        </span>
      </div>`).join('');
}
function startEditOperator(id) {
  document.getElementById(`op-name-${id}`).style.display = 'none';
  document.getElementById(`op-edit-${id}`).style.display = 'inline-flex';
  document.getElementById(`op-btn-edit-${id}`).style.display = 'none';
  document.getElementById(`op-btn-save-${id}`).style.display = '';
  document.getElementById(`op-input-${id}`)?.focus();
}
async function saveEditOperator(id) {
  const newName = (document.getElementById(`op-input-${id}`)?.value || '').trim();
  if (!newName) { toast('名前を入力してください', 'error'); return; }
  const old = _operators.find(o => o.id === id);
  if (old && newName === old.name) { renderOperatorSettings(); return; }
  try {
    const row = await api._fetch(`/api/operators/${id}`, { method:'PUT', body: JSON.stringify({ name: newName }) });
    const idx = _operators.findIndex(o => o.id === id);
    if (idx !== -1) _operators[idx] = row;
    _refreshOperatorSelects();
    renderOperatorSettings();
    toast(`「${old?.name}」→「${newName}」に変更しました`);
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteOperator(id, name) {
  if (!confirm(`「${name}」を担当者リストから削除しますか？`)) return;
  await api._fetch(`/api/operators/${id}`, { method:'DELETE' });
  _operators = _operators.filter(o => o.id !== id);
  _refreshOperatorSelects();
  renderOperatorSettings();
  toast(`「${name}」を削除しました`);
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
async function addOperatorFromInput() {
  const name = (document.getElementById('newOpInput')?.value || '').trim();
  if (!name) { toast('名前を入力してください', 'error'); return; }
  try {
    const row = await api._fetch('/api/operators', { method:'POST', body: JSON.stringify({ name }) });
    _operators.push(row);
    document.getElementById('newOpInput').value = '';
    renderOperatorSettings();
    toast(`「${name}」を追加しました`);
  } catch (e) { toast(e.message, 'error'); }
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

let _storesCache = [];  // DB から取得した店舗一覧

function storeBadge(name) {
  if (!name) return '—';
  const s = _storesCache.find(s => s.name === name);
  const color = s?.color || '#7c3aed';
  const bg    = color + '33';  // 20% opacity
  return `<span class="store-badge" style="background:${bg};color:${color};border-color:${color}40">${esc(name)}</span>`;
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
  year:          new Date().getFullYear(),
  month:         new Date().getMonth() + 1,
  statsYear:     new Date().getFullYear(),
  statsMonth:    new Date().getMonth() + 1,
  editingId:     null,
  selectedCompany: null,  // null = 全会社, { id, name, color }
  selectedBranch:  null,  // null = 全支店, { id, name, color }
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
    if (res.status === 401) { window.location.href = '/login.html'; return; }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  _filterParam: () => {
    const c = state.selectedCompany ? `&company_id=${state.selectedCompany.id}` : '';
    const b = state.selectedBranch  ? `&branch=${encodeURIComponent(state.selectedBranch.name)}` : '';
    return c + b;
  },
  getBookings:      (y, m)      => api._fetch(`/api/bookings?year=${y}&month=${m}${api._filterParam()}`),
  createBooking:    (d)         => api._fetch('/api/bookings', { method:'POST', body:JSON.stringify(d) }),
  updateBooking:    (id, d)     => api._fetch(`/api/bookings/${id}`, { method:'PUT', body:JSON.stringify(d) }),
  deleteBooking:    (id)        => api._fetch(`/api/bookings/${id}`, { method:'DELETE' }),
  getDashboard:     (y, m)      => api._fetch(`/api/dashboard?year=${y}&month=${m}${api._filterParam()}`),
  getCustomers:     ()          => api._fetch('/api/customers'),
  getCustomerBkgs:  (n, a)      => api._fetch(`/api/customers/bookings?name=${encodeURIComponent(n)}&account=${encodeURIComponent(a||'')}`),
  getStats:         (y, m)      => api._fetch(`/api/stats?year=${y}&month=${m}${api._filterParam()}`),
  getCompanies:     ()          => api._fetch('/api/companies'),
  getCompanySummary:()          => api._fetch('/api/companies/summary'),
  getStores:        (cid)       => api._fetch(`/api/stores${cid ? `?company_id=${cid}` : ''}`),
  getStoreSummary:  (cid)       => api._fetch(`/api/stores/summary${cid ? `?company_id=${cid}` : ''}`),
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
        <div class="stat-label">本日の成約件数</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-value">${monthSummary.count}</div>
        <div class="stat-label">今月の成約件数（キャンセル除く）</div>
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
          <div class="schip-label">成約数</div>
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
        <td>${esc(b.media)}</td>
        <td>${esc(b.nationality)}</td>
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
  const defaultStore = b.id !== undefined ? (b.store_name || '') : (b.store_name || state.selectedStore?.name || '');
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
          ${storeOptionsFromDB(defaultStore)}
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
async function renderRegister() {
  await Promise.all([loadOperators(), api.getStores().then(s => _storesCache = s)]);
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
  if (!data.storeName) {
    toast('店舗名を選択してください', 'error'); return;
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
  return list.map((c) => `
    <div class="ccard" onclick="showCustomerDetail(${_customers.indexOf(c)})">
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
let _statsCache = null;

function exportStatsCSV() {
  if (!_statsCache) return;
  const { summary, byCast, byStore, byMedia, byNationality, trend, avgPerDay, label } = _statsCache;

  const rows = [];
  const q = v => (v === null || v === undefined) ? '' : String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : String(v);
  const line = (...cols) => rows.push(cols.map(q).join(','));

  line(`${label} 月末レポート`);
  line('');

  // サマリー
  line('■ サマリー');
  line('成約件数', '合計売上', '平均単価', '一日平均件数');
  line(summary.count, summary.total, summary.count ? Math.round(summary.total / summary.count) : 0, avgPerDay);
  line('');

  // 店舗別
  line('■ 店舗別');
  line('店舗名', '件数', '売上');
  byStore.forEach(r => line(r.name, r.count, r.total));
  line('');

  // キャスト別
  line('■ キャスト別');
  line('キャスト名', '店舗', '件数', '売上');
  byCast.forEach(r => line(r.name, r.store_name || '', r.count, r.total));
  line('');

  // 媒体別
  line('■ 媒体別');
  line('媒体', '件数', '売上');
  byMedia.forEach(r => line(r.name, r.count, r.total));
  line('');

  // 国籍別
  line('■ 国籍別');
  line('国', '件数');
  byNationality.forEach(r => line(r.name, r.count));
  line('');

  // トレンド
  line('■ 月別トレンド');
  line('月', '件数', '売上');
  trend.forEach(r => line(r.label, r.count, r.total));

  const bom = '\uFEFF';
  const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `月末レポート_${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printMonthlyReport() {
  if (!_statsCache) return;
  const { summary, byStore, byMedia, byNationality, trend, avgPerDay, label } = _statsCache;

  const GOLD    = '#B8960C';
  const GOLD_LT = '#D4AF37';
  const COLORS  = ['#1a1a2e','#2d2d44','#B8960C','#8B6914','#4a4a6a','#6b6b8a','#c8a84b','#e8c96e','#3d3d5c','#D4AF37'];

  const avgUnit  = Math.round(summary.count ? summary.total / summary.count : 0);
  const today    = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });
  const maxStore = byStore.reduce((m, r) => Math.max(m, Number(r.total)), 0);

  const storeRows = byStore.map((r, i) => {
    const pct     = summary.total ? (r.total / summary.total * 100).toFixed(1) : '0.0';
    const barPct  = maxStore ? Math.round(r.total / maxStore * 100) : 0;
    const color   = COLORS[i % COLORS.length];
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle"></span>${r.name}</td>
      <td class="num">${Number(r.count).toLocaleString()}件</td>
      <td class="num">¥${Number(r.total).toLocaleString()}</td>
      <td class="num">${pct}%</td>
      <td style="width:120px;padding-right:16px">
        <div style="height:6px;background:#f0ece0;border-radius:3px">
          <div style="height:6px;width:${barPct}%;background:linear-gradient(90deg,${GOLD},${GOLD_LT});border-radius:3px"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const mediaRows = byMedia.map(r => `<tr>
    <td>${r.name || '—'}</td>
    <td class="num">${Number(r.count).toLocaleString()}件</td>
    <td class="num">¥${Number(r.total).toLocaleString()}</td>
    <td class="num">${summary.count ? (r.count/summary.count*100).toFixed(1) : 0}%</td>
  </tr>`).join('');

  const trendRows = trend.map(r => `<tr>
    <td>${r.label}</td>
    <td class="num">${Number(r.count).toLocaleString()}件</td>
    <td class="num">¥${Number(r.total).toLocaleString()}</td>
    <td class="num">¥${r.count ? Math.round(r.total/r.count).toLocaleString() : '—'}</td>
  </tr>`).join('');

  const natLabels = JSON.stringify(byNationality.map(r => r.name));
  const natData   = JSON.stringify(byNationality.map(r => Number(r.count)));
  const natColors = JSON.stringify(byNationality.map((_, i) => COLORS[i % COLORS.length]));

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>Monthly Report — ${label}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></scr` + `ipt>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
    font-size: 12px;
    color: #1a1208;
    background: #fff;
    padding: 0;
  }

  /* ── カバーヘッダー ── */
  .cover {
    background: #0e0e1a;
    color: #fff;
    padding: 40px 52px 36px;
    position: relative;
    overflow: hidden;
  }
  .cover::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, ${GOLD}, ${GOLD_LT}, ${GOLD});
  }
  .cover-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
  }
  .cover-brand {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: .06em;
    color: ${GOLD_LT};
  }
  .cover-meta {
    text-align: right;
    font-size: 11px;
    color: rgba(255,255,255,.5);
    line-height: 1.8;
  }
  .cover-title {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255,255,255,.5);
    letter-spacing: .15em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .cover-period {
    font-size: 38px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -.02em;
    line-height: 1;
  }
  .cover-period span { color: ${GOLD_LT}; }

  /* ── ページ本文 ── */
  .page { padding: 40px 52px; }

  /* ── KPIグリッド ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: #e8e0d0;
    border: 1px solid #e8e0d0;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 36px;
  }
  .kpi {
    background: #fff;
    padding: 20px 18px;
    text-align: center;
  }
  .kpi-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #9c8c6a;
    margin-bottom: 8px;
  }
  .kpi-value {
    font-size: 26px;
    font-weight: 900;
    color: #1a1208;
    line-height: 1;
    margin-bottom: 4px;
  }
  .kpi-value.gold { color: ${GOLD}; }
  .kpi-sub { font-size: 10px; color: #9c8c6a; }

  /* ── セクション ── */
  .section { margin-bottom: 36px; }
  .section-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e8e0d0;
  }
  .section-head::before {
    content: '';
    display: block;
    width: 4px;
    height: 18px;
    background: linear-gradient(180deg, ${GOLD}, ${GOLD_LT});
    border-radius: 2px;
    flex-shrink: 0;
  }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .04em;
    color: #1a1208;
  }
  .section-sub { font-size: 11px; color: #9c8c6a; margin-left: auto; }

  /* ── テーブル ── */
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #faf7f0; }
  th {
    padding: 9px 14px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #6b5c3a;
    text-align: left;
    border-bottom: 2px solid #e8e0d0;
  }
  tbody tr { transition: background .1s; }
  tbody tr:nth-child(even) { background: #fdfaf4; }
  td {
    padding: 10px 14px;
    border-bottom: 1px solid #f0ece0;
    vertical-align: middle;
    font-size: 12px;
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  tbody tr:last-child td { border-bottom: none; }
  tfoot td {
    padding: 10px 14px;
    font-weight: 700;
    border-top: 2px solid #e8e0d0;
    background: #faf7f0;
    font-size: 12px;
  }

  /* ── 2カラム ── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }

  /* ── チャート ── */
  .chart-box {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 0;
  }
  canvas { max-width: 220px; max-height: 220px; }

  /* ── フッター ── */
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e8e0d0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #9c8c6a;
  }
  .footer-brand { font-weight: 700; color: ${GOLD}; letter-spacing: .08em; }

  /* ── 印刷 ── */
  @media print {
    @page { margin: 0; size: A4; }
    .cover { padding: 32px 40px 28px; }
    .page  { padding: 28px 40px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-top">
    <div class="cover-brand">GREED</div>
    <div class="cover-meta">
      <div>作成日: ${today}</div>
      <div>GREED 予約管理システム</div>
    </div>
  </div>
  <div class="cover-title">Monthly Performance Report</div>
  <div class="cover-period">${label.replace('年', '<span>年</span>').replace('月', '<span>月</span>')}</div>
</div>

<div class="page">

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">成約件数</div>
      <div class="kpi-value">${Number(summary.count).toLocaleString()}</div>
      <div class="kpi-sub">件</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">合計売上</div>
      <div class="kpi-value gold" style="font-size:${summary.total >= 1000000 ? '20px' : '26px'}">¥${Number(summary.total).toLocaleString()}</div>
      <div class="kpi-sub">キャンセル除く</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">平均単価</div>
      <div class="kpi-value" style="font-size:${avgUnit >= 100000 ? '20px' : '26px'}">¥${Number(avgUnit).toLocaleString()}</div>
      <div class="kpi-sub">1件あたり</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">一日平均</div>
      <div class="kpi-value">${avgPerDay}</div>
      <div class="kpi-sub">件 / 日</div>
    </div>
  </div>

  <div class="section">
    <div class="section-head">
      <div class="section-title">店舗別実績</div>
      <div class="section-sub">Store Performance</div>
    </div>
    <table>
      <thead><tr>
        <th>店舗名</th>
        <th class="num">件数</th>
        <th class="num">売上</th>
        <th class="num">構成比</th>
        <th style="width:130px">割合</th>
      </tr></thead>
      <tbody>${storeRows}</tbody>
      <tfoot><tr>
        <td>合計</td>
        <td class="num">${Number(summary.count).toLocaleString()}件</td>
        <td class="num">¥${Number(summary.total).toLocaleString()}</td>
        <td class="num">100%</td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-head">
        <div class="section-title">媒体別</div>
        <div class="section-sub">By Media</div>
      </div>
      <table>
        <thead><tr>
          <th>媒体</th>
          <th class="num">件数</th>
          <th class="num">売上</th>
          <th class="num">構成比</th>
        </tr></thead>
        <tbody>${mediaRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-title">国籍別</div>
        <div class="section-sub">By Nationality</div>
      </div>
      <div class="chart-box">
        <canvas id="natChart"></canvas>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head">
      <div class="section-title">月次推移（直近6ヶ月）</div>
      <div class="section-sub">Monthly Trend</div>
    </div>
    <table>
      <thead><tr>
        <th>月</th>
        <th class="num">件数</th>
        <th class="num">売上</th>
        <th class="num">平均単価</th>
      </tr></thead>
      <tbody>${trendRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <div><span class="footer-brand">GREED</span> — Confidential</div>
    <div>本レポートは ${today} に自動生成されました</div>
  </div>

</div>

<script>
new Chart(document.getElementById('natChart'), {
  type: 'doughnut',
  data: {
    labels: ${natLabels},
    datasets: [{
      data: ${natData},
      backgroundColor: ${natColors},
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 6
    }]
  },
  options: {
    cutout: '55%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { font: { size: 10, family: "'Noto Sans JP', sans-serif" }, boxWidth: 10, padding: 10 }
      }
    }
  }
});
setTimeout(() => window.print(), 1000);
</scr` + `ipt>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function renderStats() {
  content().innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">集計・分析</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="month-nav">
          <button class="month-nav-btn" onclick="changeStatsMonth(-1)">◀</button>
          <span class="month-nav-label" id="statsMonthLabel">${state.statsYear}年${state.statsMonth}月</span>
          <button class="month-nav-btn" onclick="changeStatsMonth(1)">▶</button>
        </div>
        <button class="btn btn-secondary" onclick="exportStatsCSV()">📥 CSV出力</button>
        <button class="btn btn-secondary" onclick="printMonthlyReport()">🖨️ 月末レポート</button>
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

  const daysInMonth = new Date(state.statsYear, state.statsMonth, 0).getDate();
  const now = new Date();
  const isCurrentMonth = (state.statsYear === now.getFullYear() && state.statsMonth === now.getMonth() + 1);
  const elapsedDays = isCurrentMonth ? now.getDate() : daysInMonth;
  const avgPerDay   = summary.count ? (summary.count / elapsedDays).toFixed(1) : '0.0';
  const statsLabel  = `${state.statsYear}年${state.statsMonth}月`;
  _statsCache = { summary, byCast, byStore, byMedia, byNationality, trend, avgPerDay, label: statsLabel };

  document.getElementById('statsContent').innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-value">${summary.count}</div>
        <div class="stat-label">成約件数</div>
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
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${avgPerDay}</div>
        <div class="stat-label">一日平均件数</div>
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
              <span>${esc(r.name)}${r.store_name ? ` <span class="slist-store">${esc(r.store_name)}</span>` : ''}</span>
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
  const [bookings] = await Promise.all([
    api.getBookings(state.year, state.month),
    loadOperators(),
    api.getStores().then(s => _storesCache = s),
  ]);
  const b = bookings.find(x => x.id === id);
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
  if (!data.storeName) {
    toast('店舗名を選択してください', 'error'); return;
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
  if (btn) {
    btn.innerHTML = theme === 'light'
      ? '<i data-lucide="moon"></i>'
      : '<i data-lucide="sun"></i>';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
}

// ═══════════════════════════════════════════════════════════
// STORE LANDING
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// LANDING — 会社選択
// ═══════════════════════════════════════════════════════════
let _companiesCache = [];

async function _refreshLandingCards() {
  const el = document.getElementById('slCards');
  if (!el) return;
  _companiesCache = await api.getCompanySummary();
  if (!_companiesCache.length) {
    el.innerHTML = `<div class="sl-empty">
      <p>会社・ブランドが登録されていません</p>
      <button class="btn btn-primary" onclick="openCompanyManager()">＋ 追加する</button>
    </div>`;
    return;
  }
  el.innerHTML = _companiesCache.map(c => `
    <div class="sl-card" onclick="selectCompany(${c.id})" style="--sc:${c.color}">
      <div class="sl-card-icon" style="color:${c.color}">🏢</div>
      <div class="sl-card-name">${esc(c.name)}</div>
      <div class="sl-card-stats">
        <span>今月 <strong>${c.month_count}</strong>件</span>
        <span>今日 <strong>${c.today_count}</strong>件</span>
      </div>
      <div class="sl-card-amount">¥${parseInt(c.month_total||0).toLocaleString()}</div>
    </div>
  `).join('');
}

async function showLanding() {
  document.getElementById('storeLanding').style.display = 'flex';
  document.getElementById('mainApp').style.display      = 'none';
  state.selectedCompany = null;
  state.selectedBranch  = null;
  document.getElementById('slCards').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div></div>';
  await Promise.all([loadOperators(), _refreshLandingCards()]);
}

async function selectCompany(id) {
  const c = id ? _companiesCache.find(x => x.id === id) : null;
  state.selectedCompany = c ? { id: c.id, name: c.name, color: c.color } : null;
  state.selectedBranch  = null;
  // 支店キャッシュ更新
  _storesCache = c ? await api.getStores(c.id) : [];
  _updateTopbarStore();
  document.getElementById('storeLanding').style.display = 'none';
  document.getElementById('mainApp').style.display      = 'flex';
  navigate('dashboard');
}

function goToLanding() { showLanding(); }

function _updateTopbarStore() {
  const c = state.selectedCompany;
  const b = state.selectedBranch;
  const label = document.getElementById('storeSelectorLabel');
  if (label) label.textContent = b ? `${c?.name} / ${b.name}` : (c?.name || '全会社');
  const btn = document.getElementById('storeSelectorBtn');
  if (btn) btn.style.borderColor = c ? (c.color + '80') : '';
}

// ─── 支店フィルター（トップバー） ────────────────────────
let _branchesCache = [];

async function openBranchSelector() {
  if (!state.selectedCompany) return;
  _branchesCache = await api.getStoreSummary(state.selectedCompany.id);
  openModal(`🏪 支店を選択 — ${esc(state.selectedCompany.name)}`, `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="sl-branch-btn ${!state.selectedBranch ? 'active' : ''}" onclick="selectBranch(0)">
        <span>🌐 全支店</span>
      </button>
      ${_branchesCache.map(b => `
        <button class="sl-branch-btn ${state.selectedBranch?.name === b.name ? 'active' : ''}"
          onclick="selectBranch(${b.id})" style="--sc:${b.color}">
          <span class="sl-dot" style="background:${b.color}"></span>
          <span style="flex:1;text-align:left">${esc(b.name)}</span>
          <span style="font-size:12px;color:var(--text-dim)">今月${b.month_count}件</span>
        </button>
      `).join('')}
    </div>
  `);
}

async function selectBranch(id) {
  const b = id ? _branchesCache.find(x => x.id === id) : null;
  state.selectedBranch = b ? { id: b.id, name: b.name, color: b.color } : null;
  _updateTopbarStore();
  closeModal();
  await navigate(state.page);
}

// ─── 会社管理 ─────────────────────────────────────────────
async function openCompanyManager() {
  openModal('🏢 会社・ブランド管理', `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end;margin-bottom:4px">
      <div>
        <label class="form-label">会社名</label>
        <input class="form-control" id="ncName" placeholder="例：○○プロダクション">
      </div>
      <div>
        <label class="form-label">カラー</label>
        <input type="color" id="ncColor" value="#7c3aed" style="height:40px;width:48px;border:none;border-radius:8px;cursor:pointer;padding:2px">
      </div>
      <button class="btn btn-primary" onclick="addCompanyFromInput()">追加</button>
    </div>
    <div id="companyMgmtList" style="margin-top:16px"></div>
  `);
  await renderCompanyMgmtList();
}

async function renderCompanyMgmtList() {
  const el = document.getElementById('companyMgmtList');
  if (!el) return;
  const list = await api.getCompanies();
  if (!list.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">登録なし</div>'; return; }
  el.innerHTML = list.map(c => `
    <div class="op-row" id="cmrow-${c.id}">
      <span class="sl-dot" style="background:${c.color}"></span>
      <span class="op-name" id="cmname-${c.id}">${esc(c.name)}</span>
      <span id="cmedit-${c.id}" style="display:none;flex:1;gap:6px;align-items:center">
        <input class="form-control" style="height:30px;font-size:13px;flex:1" id="cminput-${c.id}" value="${esc(c.name)}">
        <input type="color" id="cmcolor-${c.id}" value="${c.color}" style="height:30px;width:40px;border:none;border-radius:6px;cursor:pointer;padding:2px">
      </span>
      <span style="display:flex;gap:6px;margin-left:auto">
        <button class="btn btn-secondary btn-sm" id="cmbtn-edit-${c.id}" onclick="startEditCompany(${c.id})">修正</button>
        <button class="btn btn-primary btn-sm"   id="cmbtn-save-${c.id}" style="display:none" onclick="saveEditCompany(${c.id})">保存</button>
        <button class="btn btn-danger btn-sm"    onclick="deleteCompanyUI(${c.id},'${esc(c.name)}')">削除</button>
      </span>
    </div>
  `).join('');
}

async function addCompanyFromInput() {
  const name  = (document.getElementById('ncName')?.value || '').trim();
  const color = document.getElementById('ncColor')?.value || '#7c3aed';
  if (!name) { toast('会社名を入力してください', 'error'); return; }
  try {
    await api._fetch('/api/companies', { method:'POST', body: JSON.stringify({ name, color }) });
    document.getElementById('ncName').value = '';
    await renderCompanyMgmtList();
    await _refreshLandingCards();
    toast(`「${name}」を追加しました`);
  } catch(e) { toast(e.message, 'error'); }
}

function startEditCompany(id) {
  document.getElementById(`cmname-${id}`).style.display = 'none';
  const el = document.getElementById(`cmedit-${id}`);
  el.style.display = 'flex'; el.style.flex = '1';
  document.getElementById(`cmbtn-edit-${id}`).style.display = 'none';
  document.getElementById(`cmbtn-save-${id}`).style.display = '';
  document.getElementById(`cminput-${id}`)?.focus();
}

async function saveEditCompany(id) {
  const name  = (document.getElementById(`cminput-${id}`)?.value || '').trim();
  const color = document.getElementById(`cmcolor-${id}`)?.value || '#7c3aed';
  if (!name) { toast('会社名を入力してください', 'error'); return; }
  try {
    await api._fetch(`/api/companies/${id}`, { method:'PUT', body: JSON.stringify({ name, color, address:'', phone:'', notes:'' }) });
    await renderCompanyMgmtList();
    await _refreshLandingCards();
    toast('更新しました');
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCompanyUI(id, name) {
  if (!confirm(`「${name}」を削除しますか？\n支店・予約データは残ります。`)) return;
  await api._fetch(`/api/companies/${id}`, { method:'DELETE' });
  await renderCompanyMgmtList();
  await _refreshLandingCards();
  toast(`「${name}」を削除しました`);
}

// ─── 支店管理 ─────────────────────────────────────────────
async function openStoreManager() {
  const cid = state.selectedCompany?.id;
  openModal('🏪 支店管理', `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end;margin-bottom:4px">
      <div>
        <label class="form-label">支店名</label>
        <input class="form-control" id="nsName" placeholder="例：渋谷店">
      </div>
      <div>
        <label class="form-label">カラー</label>
        <input type="color" id="nsColor" value="#94a3b8" style="height:40px;width:48px;border:none;border-radius:8px;cursor:pointer;padding:2px">
      </div>
      <button class="btn btn-primary" onclick="addStoreFromInput(${cid||0})">追加</button>
    </div>
    <div id="storeMgmtList" style="margin-top:16px"></div>
  `);
  await renderStoreMgmtList(cid);
}

async function renderStoreMgmtList(cid) {
  const el = document.getElementById('storeMgmtList');
  if (!el) return;
  const list = await api.getStores(cid);
  _storesCache = list;
  if (!list.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">支店が登録されていません</div>'; return; }
  el.innerHTML = list.map(s => `
    <div class="op-row" id="smrow-${s.id}">
      <span class="sl-dot" style="background:${s.color}"></span>
      <span class="op-name" id="smname-${s.id}">${esc(s.name)}</span>
      <span id="smedit-${s.id}" style="display:none;flex:1;gap:6px;align-items:center">
        <input class="form-control" style="height:30px;font-size:13px;flex:1" id="sminput-${s.id}" value="${esc(s.name)}">
        <input type="color" id="smcolor-${s.id}" value="${s.color}" style="height:30px;width:40px;border:none;border-radius:6px;cursor:pointer;padding:2px">
      </span>
      <span style="display:flex;gap:6px;margin-left:auto">
        <button class="btn btn-secondary btn-sm" id="smbtn-edit-${s.id}" onclick="startEditStore(${s.id})">修正</button>
        <button class="btn btn-primary btn-sm"   id="smbtn-save-${s.id}" style="display:none" onclick="saveEditStore(${s.id},${cid||0})">保存</button>
        <button class="btn btn-danger btn-sm"    onclick="deleteStoreUI(${s.id},'${esc(s.name)}',${cid||0})">削除</button>
      </span>
    </div>
  `).join('');
}

async function addStoreFromInput(cid) {
  const name  = (document.getElementById('nsName')?.value || '').trim();
  const color = document.getElementById('nsColor')?.value || '#94a3b8';
  if (!name) { toast('支店名を入力してください', 'error'); return; }
  try {
    await api._fetch('/api/stores', { method:'POST', body: JSON.stringify({ name, color, companyId: cid }) });
    document.getElementById('nsName').value = '';
    await renderStoreMgmtList(cid);
    toast(`「${name}」を追加しました`);
  } catch(e) { toast(e.message, 'error'); }
}

function startEditStore(id) {
  document.getElementById(`smname-${id}`).style.display = 'none';
  const el = document.getElementById(`smedit-${id}`);
  el.style.display = 'flex'; el.style.flex = '1';
  document.getElementById(`smbtn-edit-${id}`).style.display = 'none';
  document.getElementById(`smbtn-save-${id}`).style.display = '';
  document.getElementById(`sminput-${id}`)?.focus();
}

async function saveEditStore(id, cid) {
  const name  = (document.getElementById(`sminput-${id}`)?.value || '').trim();
  const color = document.getElementById(`smcolor-${id}`)?.value || '#94a3b8';
  if (!name) { toast('支店名を入力してください', 'error'); return; }
  try {
    await api._fetch(`/api/stores/${id}`, { method:'PUT', body: JSON.stringify({ name, color, companyId: cid }) });
    await renderStoreMgmtList(cid);
    toast('更新しました');
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteStoreUI(id, name, cid) {
  if (!confirm(`「${name}」を削除しますか？\n予約データは残ります。`)) return;
  await api._fetch(`/api/stores/${id}`, { method:'DELETE' });
  _storesCache = _storesCache.filter(s => s.id !== id);
  await renderStoreMgmtList(cid);
  toast(`「${name}」を削除しました`);
}

// ─── 支店 select options ───────────────────────────────────
function storeOptionsFromDB(current) {
  return _storesCache.map(s =>
    `<option value="${esc(s.name)}"${s.name === current ? ' selected' : ''}>${esc(s.name)}</option>`
  ).join('');
}

function logout() {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = '/api/auth/logout';
  document.body.appendChild(f);
  f.submit();
}

document.addEventListener('DOMContentLoaded', async () => {
  // 認証チェック
  const auth = await fetch('/api/auth/check').then(r => r.json()).catch(() => ({ loggedIn: false }));
  if (!auth.loggedIn) { window.location.href = '/login.html'; return; }

  applyTheme(localStorage.getItem('theme') || 'dark');
  showLanding();
});
