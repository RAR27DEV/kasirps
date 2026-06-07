// =============================================
// KASIR PS v2 — Supabase Edition
// =============================================

// ===== SUPABASE CONFIG =====
const SUPABASE_URL  = 'https://cnovvfpsutypluiwnfwh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub3Z2ZnBzdXR5cGx1aXduZndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTIxMzMsImV4cCI6MjA5NjMyODEzM30.rBjZVltsQx2mL91fC8zsdiJIEsgQFbU-cY-pfkQ3EPg';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ===== CONSTANTS =====
const PS_UNITS = [
  { id:1,type:'PS4'},{id:2,type:'PS4'},{id:3,type:'PS4'},{id:4,type:'PS4'},
  { id:5,type:'PS3'},{id:6,type:'PS3'},{id:7,type:'PS3'},{id:8,type:'PS3'},
  { id:9,type:'PS3'},{id:10,type:'PS3'},{id:11,type:'PS3'}
];

const PRICES = {
  PS3: { 1:{30:3000,60:5000,120:10000,180:15000}, 2:{30:4000,60:7000,120:14000,180:21000} },
  PS4: { 1:{30:4000,60:8000,120:16000,180:24000}, 2:{30:5000,60:10000,120:20000,180:30000} }
};

const PACKAGES = [
  { label:'30 Menit', minutes:30,  bonus:0  },
  { label:'1 Jam',    minutes:60,  bonus:0  },
  { label:'2 Jam',    minutes:120, bonus:0  },
  { label:'3 Jam',    minutes:180, bonus:30 }
];

// ===== STATE =====
let currentUser  = null;
let sessions     = {};   // { [psId]: sessionObject } — active/waiting only
let snackMenu    = [];   // array of menu items
let realtimeChannel = null;

// Modal temp state
let _modalPsId       = null;
let _selectedPlayers = 1;
let _selectedPackage = null;
let _cancelPsId      = null;

// Alert tracking (per psId)
const alertShown = {};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Listen for auth state changes
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      if (session) {
        currentUser = session.user;
        await onSignedIn();
      } else {
        onSignedOut();
      }
    } else if (event === 'SIGNED_OUT') {
      onSignedOut();
    }
  });

  // Check existing session
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    hideLoading();
    showAuthPage();
  }
  // If session exists, onAuthStateChange fires INITIAL_SESSION → onSignedIn
});

async function onSignedIn() {
  showLoadingScreen('Memuat data...');
  try {
    await Promise.all([loadActiveSessions(), loadSnackMenu()]);
    hideLoading();
    showApp();
    setupClock();
    setDefaultReportDate();
    renderDashboard();
    renderSnackMenuPage();
    subscribeRealtime();
    startTimerLoop();
  } catch (err) {
    hideLoading();
    showAuthPage();
    showNotification('Gagal memuat data: ' + err.message, 'danger');
  }
}

function onSignedOut() {
  currentUser  = null;
  sessions     = {};
  snackMenu    = [];
  if (realtimeChannel) { db.removeChannel(realtimeChannel); realtimeChannel = null; }
  hideLoading();
  showAuthPage();
}

// ===== LOADING SCREEN =====
function showLoadingScreen(msg = 'Memuat aplikasi...') {
  const el = document.getElementById('loading-screen');
  if (el) {
    el.querySelector('.loading-text').textContent = msg;
    el.style.display = 'flex';
  }
}

function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = 'none';
}

// ===== AUTH UI =====
function showAuthPage() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const emailBadge = document.getElementById('user-email-badge');
  if (emailBadge && currentUser) emailBadge.textContent = '👤 ' + currentUser.email;
}

function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('login-section').classList.toggle('hidden', !isLogin);
  document.getElementById('register-section').classList.toggle('hidden', isLogin);
  document.getElementById('auth-subtitle').textContent = isLogin
    ? 'Masuk ke akun kasir kamu'
    : 'Buat akun kasir baru';
  hideAuthMsg();
}

function hideAuthMsg() {
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
}

// Password toggle
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.textContent = isText ? '👁' : '🙈';
}

// ===== AUTH ACTIONS =====
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthError('Isi email dan password terlebih dahulu.'); return; }

  setBtnLoading('login-btn', true);
  hideAuthMsg();

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    setBtnLoading('login-btn', false);
    showAuthError(getAuthErrorMsg(error.message));
  }
  // On success, onAuthStateChange fires and handles the rest
}

async function doRegister() {
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;

  if (!email || !password) { showAuthError('Isi semua kolom terlebih dahulu.'); return; }
  if (password.length < 6)  { showAuthError('Password minimal 6 karakter.'); return; }
  if (password !== confirm)  { showAuthError('Password tidak cocok.'); return; }

  setBtnLoading('reg-btn', true);
  hideAuthMsg();

  const { error } = await db.auth.signUp({ email, password });

  setBtnLoading('reg-btn', false);

  if (error) {
    showAuthError(getAuthErrorMsg(error.message));
  } else {
    showAuthSuccess('Akun berhasil dibuat! Silakan masuk dengan email dan password kamu.');
    switchAuthMode('login');
    document.getElementById('login-email').value = email;
  }
}

async function doLogout() {
  if (!confirm('Yakin ingin keluar?')) return;
  await db.auth.signOut();
}

function getAuthErrorMsg(msg) {
  if (msg.includes('Invalid login')) return 'Email atau password salah.';
  if (msg.includes('Email not confirmed')) return 'Email belum diverifikasi. Cek inbox kamu.';
  if (msg.includes('already registered')) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (msg.includes('rate limit')) return 'Terlalu banyak percobaan. Tunggu beberapa menit.';
  return msg;
}

// ===== BUTTON LOADING STATE =====
function setBtnLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const txt  = btn.querySelector('.btn-text');
  const spin = btn.querySelector('.btn-spin');
  if (txt)  txt.classList.toggle('hidden', loading);
  if (spin) spin.classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

// ===== DATA LOADING =====
async function loadActiveSessions() {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .in('status', ['WAITING', 'ACTIVE'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  sessions = {};
  (data || []).forEach(row => {
    sessions[row.ps_id] = fromDB(row);
  });
}

async function loadSnackMenu() {
  const { data, error } = await db
    .from('snack_menu')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) throw error;

  snackMenu = data || [];

  // Insert default menu if empty
  if (snackMenu.length === 0) {
    const defaults = [
      { name:'Aqua Botol',    price:3000 },
      { name:'Chitato',       price:5000 },
      { name:'Teh Kotak',     price:3000 },
      { name:'Indomie Goreng',price:5000 },
      { name:'Kopi Sachet',   price:2000 },
      { name:'Permen Kopiko', price:1000 }
    ].map(m => ({ ...m, user_id: currentUser.id }));

    const { data: inserted } = await db.from('snack_menu').insert(defaults).select();
    if (inserted) snackMenu = inserted;
  }
}

// ===== DB ↔ JS MAPPING =====
function fromDB(row) {
  return {
    id:             row.id,
    psId:           row.ps_id,
    psType:         row.ps_type,
    players:        row.players,
    status:         row.status,
    startTime:      row.start_time,
    startTimestamp: row.start_timestamp,
    packageMinutes: row.package_minutes,
    bonusMinutes:   row.bonus_minutes  || 0,
    totalMinutes:   row.total_minutes,
    endTimestamp:   row.end_timestamp,
    price:          row.price          || 0,
    paid:           row.paid           || false,
    snacks:         row.snacks         || [],
    openedAt:       row.opened_at,
    closedAt:       row.closed_at,
    note:           row.note
  };
}

// ===== REAL-TIME SUBSCRIPTION =====
function subscribeRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);

  realtimeChannel = db.channel('kasir-ps-realtime')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'sessions'
    }, async (payload) => {
      // Re-load all active sessions on any change
      await loadActiveSessions();
      renderDashboard();
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'snack_menu'
    }, async () => {
      await loadSnackMenu();
      renderSnackMenuPage();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time connected');
      }
    });
}

// ===== CLOCK =====
function setupClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const now  = new Date();
  const DAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const time = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  const date = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  el.innerHTML = `<span class="clock-time">${time}</span><span class="clock-date">${DAYS[now.getDay()]}, ${date}</span>`;
}

// ===== PAGES =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));

  const pageEl  = document.getElementById(`page-${page}`);
  const navEl   = document.getElementById(`nav-${page}`);
  const bnavEl  = document.getElementById(`bnav-${page}`);
  if (pageEl)  pageEl.classList.add('active');
  if (navEl)   navEl.classList.add('active');
  if (bnavEl)  bnavEl.classList.add('active');

  if (page === 'reports') renderReports();
  if (page === 'menu')    renderSnackMenuPage();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const grid = document.getElementById('ps-grid');
  if (!grid) return;
  const scrollY = window.scrollY;
  grid.innerHTML = PS_UNITS.map(u => buildCardHTML(u, sessions[u.id])).join('');
  window.scrollTo(0, scrollY);
  updateStats();
}

function buildCardHTML(unit, session) {
  const typeClass  = unit.type === 'PS4' ? 'badge-ps4' : 'badge-ps3';
  const cardStatus = session ? session.status.toLowerCase() : 'idle';

  let statusBadge = '', cardBody = '';

  if (!session) {
    statusBadge = '<span class="status-badge idle">KOSONG</span>';
    cardBody = `
      <div class="card-idle">
        <div class="idle-icon">🎮</div>
        <p class="idle-text">Unit Tersedia</p>
        <button class="btn-open-session" id="btn-open-${unit.id}" onclick="openOpenSessionModal(${unit.id})">
          + Buka Sesi
        </button>
      </div>`;

  } else if (session.status === 'WAITING') {
    statusBadge = '<span class="status-badge waiting">⏳ MENUNGGU</span>';
    const playerTxt = session.players === 1 ? '👤 1 Orang' : '👥 2 Orang';
    cardBody = `
      <div class="session-info">
        <div class="session-meta">
          <span class="meta-badge player-badge">${playerTxt}</span>
        </div>
        ${session.note ? `<div class="session-note">📝 ${esc(session.note)}</div>` : ''}
        <p class="waiting-msg">⏳ Menunggu game dimulai...</p>
        <div class="waiting-time"><small>Dibuka: ${fmtTime(new Date(session.openedAt))}</small></div>
      </div>
      <div class="card-actions">
        <button class="btn-start-timer" id="btn-starttimer-${unit.id}" onclick="openStartTimerModal(${unit.id})">▶ Mulai Timer</button>
        <button class="btn-cancel" id="btn-cancel-${unit.id}" onclick="askCancelSession(${unit.id})">✕ Batalkan</button>
      </div>`;

  } else if (session.status === 'ACTIVE') {
    const now       = Date.now();
    const remaining = session.endTimestamp - now;
    const expired   = remaining <= 0;
    const warn5     = !expired && remaining <= 5  * 60 * 1000;
    const near10    = !expired && remaining <= 10 * 60 * 1000;
    const timerCls  = expired ? 'timer-expired' : warn5 ? 'timer-warning' : near10 ? 'timer-near' : '';
    const countdown = expired ? 'WAKTU HABIS!' : fmtCountdown(remaining);
    const pkg       = PACKAGES.find(p => p.minutes === session.packageMinutes) || {};
    const endDt     = new Date(session.endTimestamp);
    const snackTot  = session.snacks.reduce((s, x) => s + x.price, 0);
    const total     = session.price + snackTot;
    const paidCls   = session.paid ? 'paid' : 'unpaid';
    const paidTxt   = session.paid ? '✓ SUDAH BAYAR' : '⚠ BELUM BAYAR';
    const statBadgeCls = (expired || warn5) ? 'timer-warning' : 'active';
    statusBadge = `<span class="status-badge ${statBadgeCls}">● AKTIF</span>`;

    const snacksHTML = session.snacks.length > 0 ? `
      <div class="snacks-section">
        <div class="snacks-header">🍿 Jajanan</div>
        <div class="snacks-list">
          ${session.snacks.map((s, i) => `
            <div class="snack-item">
              <span class="snack-name">${esc(s.name)}</span>
              <span class="snack-price">${fmtRp(s.price)}</span>
              <button class="snack-remove" onclick="removeSnack(${unit.id},${i})" title="Hapus">✕</button>
            </div>`).join('')}
        </div>
      </div>` : '';

    const bonusTxt = session.bonusMinutes > 0
      ? `<span class="bonus-badge">🎁 +${session.bonusMinutes}min bonus</span>` : '';

    cardBody = `
      <div class="session-info">
        <div class="session-meta">
          <span class="meta-badge player-badge">${session.players===1?'👤 1 Orang':'👥 2 Orang'}</span>
          <span class="meta-badge package-badge">${pkg.label||'—'}</span>
          ${bonusTxt}
        </div>
        ${session.note ? `<div class="session-note">📝 ${esc(session.note)}</div>` : ''}
        <div class="timer-display ${timerCls}" id="timer-display-${unit.id}">
          <div class="timer-countdown" id="timer-${unit.id}">${countdown}</div>
          <div class="timer-sub">
            <span>Mulai: ${session.startTime}</span>
            <span>Selesai: ${fmtTime(endDt)}</span>
          </div>
        </div>
        ${snacksHTML}
        <div class="price-section" id="price-sect-${unit.id}">
          <div class="price-row-mini"><span>Waktu:</span><span>${fmtRp(session.price)}</span></div>
          ${snackTot>0?`<div class="price-row-mini"><span>Jajanan:</span><span>${fmtRp(snackTot)}</span></div>`:''}
          <div class="price-row-mini total"><span>Total:</span><span>${fmtRp(total)}</span></div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-snack" onclick="openSnackModal(${unit.id})">🍿 Tambah Jajanan</button>
        <button class="btn-pay ${paidCls}" id="btn-pay-${unit.id}" onclick="togglePayment(${unit.id})">${paidTxt}</button>
        <button class="btn-close-session" onclick="openCloseSessionModal(${unit.id})">❌ Tutup Sesi</button>
      </div>`;
  }

  return `
    <div id="ps-card-${unit.id}" class="ps-card ${unit.type.toLowerCase()} ${cardStatus}">
      <div class="card-header">
        <div class="card-title">
          <span class="type-badge ${typeClass}">${unit.type}</span>
          <span class="ps-number">PS ${unit.id}</span>
        </div>
        ${statusBadge}
      </div>
      <div class="card-body">${cardBody}</div>
    </div>`;
}

function updateStats() {
  let active=0, waiting=0, idle=0;
  PS_UNITS.forEach(u => {
    const s = sessions[u.id];
    if (!s) idle++;
    else if (s.status==='WAITING') waiting++;
    else if (s.status==='ACTIVE')  active++;
  });
  setText('stat-active-count',  active);
  setText('stat-waiting-count', waiting);
  setText('stat-idle-count',    idle);
}

// ===== TIMER LOOP =====
function startTimerLoop() {
  setInterval(tickTimers, 1000);
}

function tickTimers() {
  let needsRender = false;
  PS_UNITS.forEach(unit => {
    const session = sessions[unit.id];
    if (!session || session.status !== 'ACTIVE') return;

    const now       = Date.now();
    const remaining = session.endTimestamp - now;
    const expired   = remaining <= 0;
    const warn5     = !expired && remaining <= 5  * 60 * 1000;
    const near10    = !expired && remaining <= 10 * 60 * 1000;

    const timerEl   = document.getElementById(`timer-${unit.id}`);
    const displayEl = document.getElementById(`timer-display-${unit.id}`);
    if (!timerEl || !displayEl) { needsRender = true; return; }

    timerEl.textContent  = expired ? 'WAKTU HABIS!' : fmtCountdown(remaining);
    displayEl.className  = `timer-display ${expired?'timer-expired':warn5?'timer-warning':near10?'timer-near':''}`;

    const cardEl  = document.getElementById(`ps-card-${unit.id}`);
    const badgeEl = cardEl?.querySelector('.status-badge');
    if (badgeEl) badgeEl.className = `status-badge ${(expired||warn5)?'timer-warning':'active'}`;

    // Alerts (one-time)
    if (!alertShown[unit.id]) alertShown[unit.id] = {};
    if (expired && !alertShown[unit.id].expired) {
      alertShown[unit.id].expired = true;
      showNotification(`⏰ PS ${unit.id} — Waktu sudah HABIS!`, 'danger');
    } else if (warn5 && !alertShown[unit.id].w5) {
      alertShown[unit.id].w5 = true;
      showNotification(`⚠️ PS ${unit.id} — Sisa waktu kurang dari 5 menit!`, 'warning');
    }
  });

  if (needsRender) renderDashboard();
  updateStats();
}

// ===== MODAL: BUKA SESI =====
function openOpenSessionModal(psId) {
  _modalPsId = psId;
  _selectedPlayers = 1;
  const unit = PS_UNITS.find(u => u.id === psId);
  document.getElementById('modal-open-title').textContent = `Buka Sesi PS ${psId} (${unit.type})`;
  document.getElementById('session-note').value = '';
  _setPlayerBtns(1);
  showModal('open-session');
}

function selectPlayers(n) {
  _selectedPlayers = n;
  _setPlayerBtns(n);
}

function _setPlayerBtns(n) {
  document.getElementById('player-1-btn').classList.toggle('active', n===1);
  document.getElementById('player-2-btn').classList.toggle('active', n===2);
}

async function confirmOpenSession() {
  const psId = _modalPsId;
  const note = document.getElementById('session-note').value.trim();
  const unit = PS_UNITS.find(u => u.id === psId);

  setBtnLoading('confirm-open-btn', true);

  const { data, error } = await db.from('sessions').insert({
    user_id:   currentUser.id,
    ps_id:     psId,
    ps_type:   unit.type,
    players:   _selectedPlayers,
    status:    'WAITING',
    snacks:    [],
    paid:      false,
    note:      note || null,
    opened_at: new Date().toISOString()
  }).select().single();

  setBtnLoading('confirm-open-btn', false);

  if (error) {
    showNotification('Gagal buka sesi: ' + error.message, 'danger');
    return;
  }

  sessions[psId] = fromDB(data);
  closeModal('open-session');
  renderDashboard();
  showNotification(`PS ${psId} dibuka — ${_selectedPlayers===1?'1 orang':'2 orang'}`, 'success');
}

// ===== CANCEL SESSION =====
function askCancelSession(psId) {
  _cancelPsId = psId;
  document.getElementById('cancel-confirm-msg').textContent =
    `Apakah kamu yakin ingin membatalkan sesi PS ${psId}? Sesi ini tidak akan masuk ke laporan.`;
  showModal('confirm-cancel');
}

async function confirmCancelSession() {
  const psId   = _cancelPsId;
  const session = sessions[psId];
  if (!session) return;

  setBtnLoading('confirm-cancel-btn', true);

  const { error } = await db.from('sessions').delete().eq('id', session.id).eq('user_id', currentUser.id);

  setBtnLoading('confirm-cancel-btn', false);

  if (error) { showNotification('Gagal batalkan: ' + error.message, 'danger'); return; }

  delete sessions[psId];
  delete alertShown[psId];
  closeModal('confirm-cancel');
  renderDashboard();
  showNotification(`Sesi PS ${psId} dibatalkan`, 'info');
}

// ===== MODAL: MULAI TIMER =====
function openStartTimerModal(psId) {
  _modalPsId       = psId;
  _selectedPackage = null;

  const session   = sessions[psId];
  const unit      = PS_UNITS.find(u => u.id === psId);
  const playerTxt = session.players === 1 ? '1 Orang' : '2 Orang';

  document.getElementById('modal-timer-title').textContent = `Mulai Timer PS ${psId}`;
  document.getElementById('timer-ps-info').innerHTML = `
    <span class="info-chip ${unit.type==='PS4'?'chip-ps4':'chip-ps3'}">${unit.type}</span>
    <span class="info-chip chip-player">👥 ${playerTxt}</span>`;

  const now = new Date();
  document.getElementById('start-time-input').value =
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const grid = document.getElementById('package-options');
  grid.innerHTML = PACKAGES.map(pkg => {
    const price    = PRICES[unit.type][session.players][pkg.minutes];
    const bonusTxt = pkg.bonus ? `<span class="pkg-bonus">🎁 +${pkg.bonus}min bonus</span>` : '';
    return `
      <button class="package-btn" data-min="${pkg.minutes}" onclick="selectPackage(${pkg.minutes})">
        <span class="pkg-label">${pkg.label}</span>
        ${bonusTxt}
        <span class="pkg-price">${fmtRp(price)}</span>
      </button>`;
  }).join('');

  document.getElementById('price-preview').style.display = 'none';
  document.getElementById('confirm-timer-btn').disabled = true;
  showModal('start-timer');
}

function selectPackage(minutes) {
  _selectedPackage = minutes;
  document.querySelectorAll('.package-btn').forEach(btn =>
    btn.classList.toggle('active', parseInt(btn.dataset.min) === minutes));

  const psId    = _modalPsId;
  const session = sessions[psId];
  const unit    = PS_UNITS.find(u => u.id === psId);
  const price   = PRICES[unit.type][session.players][minutes];
  const pkg     = PACKAGES.find(p => p.minutes === minutes);
  const bonus   = pkg.bonus || 0;
  const total   = minutes + bonus;

  document.getElementById('price-preview').style.display = 'flex';
  document.getElementById('preview-price').textContent   = fmtRp(price);
  document.getElementById('bonus-row').style.display     = bonus > 0 ? 'flex' : 'none';

  const h = Math.floor(total/60), m = total%60;
  let dur = '';
  if (h>0) dur += `${h} jam `;
  if (m>0) dur += `${m} menit`;
  document.getElementById('preview-duration').textContent = dur.trim() || `${total} menit`;
  document.getElementById('confirm-timer-btn').disabled = false;
}

async function confirmStartTimer() {
  if (!_selectedPackage) return;

  const psId    = _modalPsId;
  const session = sessions[psId];
  const unit    = PS_UNITS.find(u => u.id === psId);
  const timeStr = document.getElementById('start-time-input').value;
  if (!timeStr) { showNotification('Masukkan jam mulai!', 'warning'); return; }

  const [hh, mm]  = timeStr.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hh, mm, 0, 0);

  const pkg          = PACKAGES.find(p => p.minutes === _selectedPackage);
  const bonus        = pkg.bonus || 0;
  const totalMinutes = _selectedPackage + bonus;
  const price        = PRICES[unit.type][session.players][_selectedPackage];
  const endTs        = startDate.getTime() + totalMinutes * 60 * 1000;

  setBtnLoading('confirm-timer-btn', true);

  const { data, error } = await db.from('sessions').update({
    status:          'ACTIVE',
    start_time:      timeStr,
    start_timestamp: startDate.getTime(),
    package_minutes: _selectedPackage,
    bonus_minutes:   bonus,
    total_minutes:   totalMinutes,
    end_timestamp:   endTs,
    price
  }).eq('id', session.id).eq('user_id', currentUser.id).select().single();

  setBtnLoading('confirm-timer-btn', false);

  if (error) { showNotification('Gagal mulai timer: ' + error.message, 'danger'); return; }

  sessions[psId] = fromDB(data);
  alertShown[psId] = {};
  closeModal('start-timer');
  renderDashboard();
  showNotification(
    `Timer PS ${psId} dimulai! Paket ${pkg.label}${bonus>0?' + 30 mnt bonus':''}. Harga: ${fmtRp(price)}`,
    'success'
  );
}

// ===== TOGGLE PAYMENT =====
async function togglePayment(psId) {
  const session = sessions[psId];
  if (!session) return;

  const newPaid = !session.paid;

  // Optimistic update
  session.paid = newPaid;
  const btn = document.getElementById(`btn-pay-${psId}`);
  if (btn) {
    btn.className   = `btn-pay ${newPaid?'paid':'unpaid'}`;
    btn.textContent = newPaid ? '✓ SUDAH BAYAR' : '⚠ BELUM BAYAR';
  }

  const { error } = await db.from('sessions')
    .update({ paid: newPaid })
    .eq('id', session.id)
    .eq('user_id', currentUser.id);

  if (error) {
    // Revert
    session.paid = !newPaid;
    if (btn) {
      btn.className   = `btn-pay ${!newPaid?'paid':'unpaid'}`;
      btn.textContent = !newPaid ? '✓ SUDAH BAYAR' : '⚠ BELUM BAYAR';
    }
    showNotification('Gagal update status: ' + error.message, 'danger');
    return;
  }

  showNotification(`PS ${psId}: ${newPaid?'✓ Sudah dibayar':'Belum dibayar'}`, newPaid?'success':'warning');
}

// ===== MODAL: JAJANAN =====
function openSnackModal(psId) {
  _modalPsId = psId;
  document.getElementById('modal-snack-title').textContent = `🍿 Tambah Jajanan — PS ${psId}`;
  document.getElementById('manual-snack-name').value  = '';
  document.getElementById('manual-snack-price').value = '';
  document.getElementById('snack-added-list').innerHTML = '';

  const menuEl = document.getElementById('snack-menu-items');
  if (snackMenu.length === 0) {
    menuEl.innerHTML = '<p class="empty-menu">Belum ada menu. Tambah di halaman Menu Jajanan.</p>';
  } else {
    menuEl.innerHTML = snackMenu.map(item => `
      <button class="menu-snack-btn" onclick="quickAddSnack('${esc(item.name)}',${item.price})">
        <span>${esc(item.name)}</span>
        <span class="menu-snack-price">${fmtRp(item.price)}</span>
      </button>`).join('');
  }

  showModal('snack');
}

async function quickAddSnack(name, price) {
  await _doAddSnack(_modalPsId, name, price);
}

async function confirmAddSnack() {
  const name  = document.getElementById('manual-snack-name').value.trim();
  const price = parseInt(document.getElementById('manual-snack-price').value) || 0;
  if (!name) { showNotification('Masukkan nama jajanan!', 'warning'); return; }
  await _doAddSnack(_modalPsId, name, price);
  document.getElementById('manual-snack-name').value  = '';
  document.getElementById('manual-snack-price').value = '';
}

async function _doAddSnack(psId, name, price) {
  const session = sessions[psId];
  if (!session) return;

  const newSnacks = [...session.snacks, { name, price }];

  const { data, error } = await db.from('sessions')
    .update({ snacks: newSnacks })
    .eq('id', session.id)
    .eq('user_id', currentUser.id)
    .select().single();

  if (error) { showNotification('Gagal tambah jajanan: ' + error.message, 'danger'); return; }

  session.snacks = data.snacks;

  // Show in modal
  const addedList = document.getElementById('snack-added-list');
  if (addedList) {
    const item = document.createElement('div');
    item.className = 'snack-added-item';
    item.textContent = `✓ ${name} — ${fmtRp(price)}`;
    addedList.appendChild(item);
  }

  _refreshCardSnacks(psId);
  showNotification(`${name} ditambahkan ke PS ${psId}`, 'success');
}

async function removeSnack(psId, idx) {
  const session = sessions[psId];
  if (!session) return;
  const snackName = session.snacks[idx].name;
  const newSnacks = session.snacks.filter((_, i) => i !== idx);

  const { data, error } = await db.from('sessions')
    .update({ snacks: newSnacks })
    .eq('id', session.id)
    .eq('user_id', currentUser.id)
    .select().single();

  if (error) { showNotification('Gagal hapus jajanan: ' + error.message, 'danger'); return; }

  session.snacks = data.snacks;
  _refreshCardSnacks(psId);
  showNotification(`${snackName} dihapus dari PS ${psId}`, 'info');
}

function _refreshCardSnacks(psId) {
  const session = sessions[psId];
  const cardEl  = document.getElementById(`ps-card-${psId}`);
  if (!cardEl || !session) return;

  let snackSect = cardEl.querySelector('.snacks-section');
  const priceSect = cardEl.querySelector('.price-section');

  const newSnacksHTML = session.snacks.length > 0 ? `
    <div class="snacks-section">
      <div class="snacks-header">🍿 Jajanan</div>
      <div class="snacks-list">
        ${session.snacks.map((s, i) => `
          <div class="snack-item">
            <span class="snack-name">${esc(s.name)}</span>
            <span class="snack-price">${fmtRp(s.price)}</span>
            <button class="snack-remove" onclick="removeSnack(${psId},${i})">✕</button>
          </div>`).join('')}
      </div>
    </div>` : '';

  if (snackSect) {
    if (session.snacks.length > 0) snackSect.outerHTML = newSnacksHTML;
    else snackSect.remove();
  } else if (session.snacks.length > 0 && priceSect) {
    priceSect.insertAdjacentHTML('beforebegin', newSnacksHTML);
  }

  if (priceSect) {
    const snackTot = session.snacks.reduce((s, x) => s + x.price, 0);
    const total    = session.price + snackTot;
    priceSect.innerHTML = `
      <div class="price-row-mini"><span>Waktu:</span><span>${fmtRp(session.price)}</span></div>
      ${snackTot>0?`<div class="price-row-mini"><span>Jajanan:</span><span>${fmtRp(snackTot)}</span></div>`:''}
      <div class="price-row-mini total"><span>Total:</span><span>${fmtRp(total)}</span></div>`;
  }
}

// ===== MODAL: TUTUP SESI =====
function openCloseSessionModal(psId) {
  _modalPsId = psId;
  const session = sessions[psId];
  const unit    = PS_UNITS.find(u => u.id === psId);
  document.getElementById('modal-close-title').textContent = `Tutup Sesi PS ${psId}`;

  const pkg      = PACKAGES.find(p => p.minutes === session.packageMinutes) || {};
  const snackTot = session.snacks.reduce((s, x) => s + x.price, 0);
  const total    = (session.price || 0) + snackTot;
  const playerTx = session.players === 1 ? '1 Orang' : '2 Orang';
  const now      = Date.now();
  const em       = Math.max(0, Math.floor((now - (session.startTimestamp || now)) / 60000));
  const elapsedStr = em >= 60
    ? `${Math.floor(em/60)} jam ${em%60} menit`
    : `${em} menit`;

  const snackRows = session.snacks.length > 0 ? `
    <div class="summary-section">
      <div class="summary-label">🍿 Jajanan</div>
      ${session.snacks.map(s => `
        <div class="summary-row"><span>${esc(s.name)}</span><span>${fmtRp(s.price)}</span></div>`).join('')}
      <div class="summary-row" style="border-top:1px solid var(--border);padding-top:5px;margin-top:3px">
        <span style="font-weight:600">Subtotal</span>
        <span style="font-weight:700;color:var(--text)">${fmtRp(snackTot)}</span>
      </div>
    </div>` : '';

  document.getElementById('close-session-summary').innerHTML = `
    <div class="summary-card">
      <div class="summary-section">
        <div class="summary-row">
          <span>Tipe</span>
          <span class="chip ${unit.type==='PS4'?'chip-ps4 badge-ps4':'chip-ps3 badge-ps3'}">${unit.type}</span>
        </div>
        <div class="summary-row"><span>Pemain</span><span>${playerTx}</span></div>
        <div class="summary-row"><span>Paket</span><span>${pkg.label||'—'}</span></div>
        <div class="summary-row"><span>Jam Mulai</span><span>${session.startTime||'—'}</span></div>
        <div class="summary-row"><span>Durasi Bermain</span><span>${elapsedStr}</span></div>
        ${session.bonusMinutes>0?`<div class="summary-row"><span>Bonus</span><span style="color:var(--yellow)">🎁 +${session.bonusMinutes} menit</span></div>`:''}
      </div>
      ${snackRows}
      <div class="summary-section total-section">
        <div class="summary-row"><span>Harga Waktu</span><span>${fmtRp(session.price||0)}</span></div>
        ${snackTot>0?`<div class="summary-row"><span>Total Jajanan</span><span>${fmtRp(snackTot)}</span></div>`:''}
        <div class="summary-row grand-total">
          <span>TOTAL BAYAR</span><span>${fmtRp(total)}</span>
        </div>
      </div>
      <div class="summary-paid-toggle">
        <label class="paid-toggle-label">
          <input type="checkbox" id="close-paid-check" ${session.paid?'checked':''}>
          <span>Sudah dibayar</span>
        </label>
      </div>
    </div>`;

  showModal('close-session');
}

async function confirmCloseSession() {
  const psId    = _modalPsId;
  const session = sessions[psId];
  if (!session) return;

  const paidEl = document.getElementById('close-paid-check');
  const paid   = paidEl ? paidEl.checked : session.paid;

  setBtnLoading('confirm-close-btn', true);

  const { error } = await db.from('sessions').update({
    status:    'DONE',
    paid,
    closed_at: new Date().toISOString()
  }).eq('id', session.id).eq('user_id', currentUser.id);

  setBtnLoading('confirm-close-btn', false);

  if (error) { showNotification('Gagal tutup sesi: ' + error.message, 'danger'); return; }

  delete sessions[psId];
  delete alertShown[psId];
  closeModal('close-session');
  renderDashboard();

  const snackTot = session.snacks.reduce((s, x) => s + x.price, 0);
  showNotification(`Sesi PS ${psId} ditutup. Total: ${fmtRp((session.price||0)+snackTot)}`, 'success');
}

// ===== REPORTS =====
function setDefaultReportDate() {
  const el = document.getElementById('report-date');
  if (el) el.value = new Date().toISOString().split('T')[0];
}

async function renderReports() {
  const dateEl = document.getElementById('report-date');
  if (!dateEl) return;
  const selectedDate = dateEl.value;
  if (!selectedDate) return;

  // Date range
  const start = selectedDate + 'T00:00:00.000Z';
  // Next day
  const d = new Date(selectedDate);
  d.setDate(d.getDate() + 1);
  const end = d.toISOString().split('T')[0] + 'T00:00:00.000Z';

  // Show loading
  document.getElementById('report-summary').innerHTML = '<div class="empty-state"><div class="loading-spinner-ring"></div></div>';
  document.getElementById('report-table-container').innerHTML = '';

  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'DONE')
    .gte('closed_at', start)
    .lt('closed_at', end)
    .order('closed_at', { ascending: false });

  if (error) {
    document.getElementById('report-summary').innerHTML = `<div class="empty-state"><p style="color:var(--red)">Gagal memuat data: ${error.message}</p></div>`;
    return;
  }

  const filtered = (data || []).map(fromDB);
  const getTotal = s => (s.price||0) + s.snacks.reduce((x,y)=>x+y.price,0);
  const totalRev    = filtered.reduce((sum,s)=>sum+getTotal(s), 0);
  const totalPaid   = filtered.filter(s=>s.paid).reduce((sum,s)=>sum+getTotal(s), 0);
  const totalUnpaid = totalRev - totalPaid;
  const snackRev    = filtered.reduce((sum,s)=>sum+s.snacks.reduce((x,y)=>x+y.price,0), 0);
  const timeRev     = filtered.reduce((sum,s)=>sum+(s.price||0), 0);

  document.getElementById('report-summary').innerHTML = `
    <div class="summary-cards-grid">
      <div class="summary-stat-card green">
        <div class="summary-stat-label">Total Sesi</div>
        <div class="summary-stat-value">${filtered.length} sesi</div>
      </div>
      <div class="summary-stat-card blue">
        <div class="summary-stat-label">Total Pendapatan</div>
        <div class="summary-stat-value">${fmtRp(totalRev)}</div>
      </div>
      <div class="summary-stat-card purple">
        <div class="summary-stat-label">Pendapatan Waktu</div>
        <div class="summary-stat-value">${fmtRp(timeRev)}</div>
      </div>
      <div class="summary-stat-card orange">
        <div class="summary-stat-label">Pendapatan Jajanan</div>
        <div class="summary-stat-value">${fmtRp(snackRev)}</div>
      </div>
      <div class="summary-stat-card teal">
        <div class="summary-stat-label">Sudah Dibayar</div>
        <div class="summary-stat-value">${fmtRp(totalPaid)}</div>
      </div>
      <div class="summary-stat-card red">
        <div class="summary-stat-label">Belum Dibayar</div>
        <div class="summary-stat-value">${fmtRp(totalUnpaid)}</div>
      </div>
    </div>`;

  if (filtered.length === 0) {
    document.getElementById('report-table-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Tidak ada sesi selesai pada <strong>${selectedDate}</strong></p>
      </div>`;
    return;
  }

  document.getElementById('report-table-container').innerHTML = `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>#</th><th>PS</th><th>Tipe</th><th>Pemain</th>
            <th>Paket</th><th>Mulai</th><th>Tutup</th>
            <th>Jajanan</th><th>Waktu</th><th>Total</th><th>Bayar</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((s,i) => {
            const snackTot = s.snacks.reduce((x,y)=>x+y.price,0);
            const total    = (s.price||0) + snackTot;
            const pkg      = PACKAGES.find(p=>p.minutes===s.packageMinutes)||{};
            const closedTm = s.closedAt ? fmtTime(new Date(s.closedAt)) : '—';
            const snackTxt = s.snacks.length>0
              ? s.snacks.map(x=>`${esc(x.name)} (${fmtRp(x.price)})`).join('<br>') : '—';
            return `<tr>
              <td style="color:var(--text-dim)">${i+1}</td>
              <td><strong>PS ${s.psId}</strong></td>
              <td><span class="table-badge ${s.psType==='PS4'?'badge-ps4':'badge-ps3'}">${s.psType}</span></td>
              <td>${s.players===1?'👤 1':'👥 2'}</td>
              <td style="white-space:nowrap">${pkg.label||'—'}</td>
              <td style="white-space:nowrap">${s.startTime||'—'}</td>
              <td style="white-space:nowrap">${closedTm}</td>
              <td class="snack-cell">${snackTxt}</td>
              <td style="white-space:nowrap">${fmtRp(s.price||0)}</td>
              <td style="white-space:nowrap"><strong>${fmtRp(total)}</strong></td>
              <td><span class="table-paid-badge ${s.paid?'paid':'unpaid'}">${s.paid?'✓ Lunas':'⚠ Belum'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function exportReport() {
  const dateEl = document.getElementById('report-date');
  const selectedDate = dateEl ? dateEl.value : '';
  if (!selectedDate) { showNotification('Pilih tanggal terlebih dahulu!', 'warning'); return; }

  const d = new Date(selectedDate);
  d.setDate(d.getDate() + 1);
  const end = d.toISOString().split('T')[0] + 'T00:00:00.000Z';

  const { data, error } = await db.from('sessions').select('*')
    .eq('user_id', currentUser.id).eq('status', 'DONE')
    .gte('closed_at', selectedDate + 'T00:00:00.000Z')
    .lt('closed_at', end)
    .order('closed_at', { ascending: true });

  if (error || !data || data.length === 0) {
    showNotification('Tidak ada data untuk diekspor', 'warning');
    return;
  }

  const filtered  = data.map(fromDB);
  const getTotal  = s => (s.price||0) + s.snacks.reduce((x,y)=>x+y.price,0);
  const totalRev  = filtered.reduce((sum,s)=>sum+getTotal(s), 0);
  const totalPaid = filtered.filter(s=>s.paid).reduce((sum,s)=>sum+getTotal(s), 0);

  let txt = `=========================================\n`;
  txt    += `      LAPORAN KASIR PS\n`;
  txt    += `      Tanggal: ${selectedDate}\n`;
  txt    += `=========================================\n\n`;

  filtered.forEach((s, i) => {
    const snackTot = s.snacks.reduce((x,y)=>x+y.price,0);
    const total    = (s.price||0) + snackTot;
    const pkg      = PACKAGES.find(p=>p.minutes===s.packageMinutes)||{};
    txt += `${i+1}. PS ${s.psId} (${s.psType}) — ${s.players} orang\n`;
    txt += `   Paket  : ${pkg.label||'—'}\n`;
    txt += `   Mulai  : ${s.startTime||'—'}\n`;
    txt += `   Tutup  : ${s.closedAt?fmtTime(new Date(s.closedAt)):'—'}\n`;
    txt += `   Harga  : ${fmtRp(s.price||0)}\n`;
    if (s.snacks.length>0) {
      txt += `   Jajanan:\n`;
      s.snacks.forEach(sn=>(txt+=`     - ${sn.name}: ${fmtRp(sn.price)}\n`));
      txt += `   Subtotal Jajanan: ${fmtRp(snackTot)}\n`;
    }
    txt += `   TOTAL  : ${fmtRp(total)}\n`;
    txt += `   Bayar  : ${s.paid?'LUNAS ✓':'BELUM BAYAR ⚠'}\n`;
    if (s.note) txt += `   Catatan: ${s.note}\n`;
    txt += '\n';
  });

  txt += `----------------------------------------\n`;
  txt += `Total Sesi        : ${filtered.length}\n`;
  txt += `Total Pendapatan  : ${fmtRp(totalRev)}\n`;
  txt += `Sudah Dibayar     : ${fmtRp(totalPaid)}\n`;
  txt += `Belum Dibayar     : ${fmtRp(totalRev-totalPaid)}\n`;
  txt += `=========================================\n`;

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `laporan-ps-${selectedDate}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showNotification('Laporan berhasil diexport!', 'success');
}

// ===== MENU JAJANAN PAGE =====
function renderSnackMenuPage() {
  const grid = document.getElementById('menu-grid');
  if (!grid) return;

  if (snackMenu.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍿</div>
        <p>Belum ada item menu. Klik <strong>"+ Tambah Item"</strong>.</p>
      </div>`;
    return;
  }

  grid.innerHTML = snackMenu.map(item => `
    <div class="menu-item-card" id="menu-card-${item.id}">
      <div class="menu-item-info">
        <span class="menu-item-name">${esc(item.name)}</span>
        <span class="menu-item-price">${fmtRp(item.price)}</span>
      </div>
      <div class="menu-item-actions">
        <button class="btn-edit-menu" onclick="openEditMenuModal('${item.id}')">✏️ Edit</button>
        <button class="btn-delete-menu" onclick="deleteMenuItem('${item.id}')">🗑️</button>
      </div>
    </div>`).join('');
}

function openAddMenuModal() {
  document.getElementById('modal-menu-title').textContent = 'Tambah Item Menu';
  document.getElementById('menu-item-id').value    = '';
  document.getElementById('menu-item-name').value  = '';
  document.getElementById('menu-item-price').value = '';
  showModal('menu-item');
}

function openEditMenuModal(id) {
  const item = snackMenu.find(m => m.id === id);
  if (!item) return;
  document.getElementById('modal-menu-title').textContent = 'Edit Item Menu';
  document.getElementById('menu-item-id').value    = id;
  document.getElementById('menu-item-name').value  = item.name;
  document.getElementById('menu-item-price').value = item.price;
  showModal('menu-item');
}

async function confirmSaveMenuItem() {
  const id    = document.getElementById('menu-item-id').value;
  const name  = document.getElementById('menu-item-name').value.trim();
  const price = parseInt(document.getElementById('menu-item-price').value) || 0;
  if (!name) { showNotification('Masukkan nama item!', 'warning'); return; }

  setBtnLoading('save-menu-btn', true);

  let error;
  if (id) {
    ({ error } = await db.from('snack_menu').update({ name, price }).eq('id', id).eq('user_id', currentUser.id));
    if (!error) {
      const item = snackMenu.find(m=>m.id===id);
      if (item) { item.name=name; item.price=price; }
    }
  } else {
    const { data, error: e } = await db.from('snack_menu')
      .insert({ user_id: currentUser.id, name, price }).select().single();
    error = e;
    if (!error && data) snackMenu.push(data);
  }

  setBtnLoading('save-menu-btn', false);

  if (error) { showNotification('Gagal simpan: ' + error.message, 'danger'); return; }

  closeModal('menu-item');
  renderSnackMenuPage();
  showNotification(`${id?'Item diupdate':'Item ditambahkan'}: ${name} — ${fmtRp(price)}`, 'success');
}

async function deleteMenuItem(id) {
  const item = snackMenu.find(m => m.id === id);
  if (!item) return;
  if (!confirm(`Hapus "${item.name}" dari menu?`)) return;

  const { error } = await db.from('snack_menu').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { showNotification('Gagal hapus: ' + error.message, 'danger'); return; }

  snackMenu = snackMenu.filter(m => m.id !== id);
  renderSnackMenuPage();
  showNotification(`${item.name} dihapus dari menu`, 'info');
}

// ===== MODAL SYSTEM =====
function showModal(type) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  const m = document.getElementById(`modal-${type}`);
  if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closeModal(type) {
  const m = document.getElementById(`modal-${type}`);
  if (m) m.classList.add('hidden');
  document.body.style.overflow = '';
}

function handleOverlayClick(e, type) {
  if (e.target === e.currentTarget) closeModal(type);
}

// ===== NOTIFICATIONS =====
function showNotification(msg, type = 'info') {
  const c = document.getElementById('notification-container');
  if (!c) return;
  const n = document.createElement('div');
  n.className = `notification notif-${type}`;
  n.textContent = msg;
  c.appendChild(n);
  setTimeout(() => n.classList.add('visible'), 10);
  setTimeout(() => {
    n.classList.remove('visible');
    setTimeout(() => n.remove(), 350);
  }, 3500);
}

// ===== UTILITIES =====
function fmtRp(amount) { return `Rp ${Number(amount||0).toLocaleString('id-ID')}`; }
function fmtTime(date) { return date.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false }); }
function fmtCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const ts = Math.floor(ms/1000);
  return `${pad(Math.floor(ts/3600))}:${pad(Math.floor((ts%3600)/60))}:${pad(ts%60)}`;
}
function pad(n) { return String(n).padStart(2,'0'); }
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
