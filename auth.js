/**
 * auth.js — MCGG Network Shared Auth Module (ES Module)
 *
 * Fix:
 *  - Tombol logout TERSEMBUNYI saat belum login (hidden by default di HTML sudah benar,
 *    tapi updateSidebarUI() kini menjamin state selalu konsisten.
 *  - Tombol login TERSEMBUNYI saat sudah login.
 *  - Modal tidak lagi conflict dengan Enter key di luar modal.
 *  - Desain modal disinkronkan dengan tema builder.css / glass-panel.
 *  - Loading spinner, animasi shake error, success state yang rapi.
 *  - Token refresh & session load yang lebih robust.
 */

export const SUPABASE_URL      = 'https://wsbpdvglzcfsujduvbcs.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYnBkdmdsemNmc3VqZHV2YmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0ODcxNzIsImV4cCI6MjA4NzA2MzE3Mn0.AeKhJYSn4n8ckdYa4i8QW4Mv6h-BRWtugkBRfICPMnI';

// ── State internal ────────────────────────────────────────────────────────────
let _session         = null;
let _authListeners   = [];
let _modalEl         = null;
let _pendingCallback = null;
let _authMode        = 'login';  // 'login' | 'register'
let _modalOpen       = false;

// ── Supabase REST ─────────────────────────────────────────────────────────────
async function authFetch(path, body, token) {
  const headers = { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || `Auth error ${res.status}`);
  return data;
}

// ── Session persistence ───────────────────────────────────────────────────────
const SESSION_KEY = 'mcgg_auth_session';

function saveSession(data) {
  const session = {
    user:          data.user,
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) {}
  _session = session;
  _authListeners.forEach(cb => cb(_session));
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  _session = null;
  _authListeners.forEach(cb => cb(null));
}

async function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored.expires_at > Date.now() + 60_000) {
      _session = stored;
      return;
    }
    // Expired → coba refresh
    if (stored.refresh_token) {
      const refreshed = await authFetch('/token?grant_type=refresh_token', { refresh_token: stored.refresh_token });
      saveSession(refreshed);
    } else {
      clearSession();
    }
  } catch {
    clearSession();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Kembalikan session aktif atau null */
export function getSession() { return _session; }

/**
 * Subscribe perubahan auth state.
 * Callback langsung dipanggil dengan state saat ini.
 * @returns unsubscribe function
 */
export function onAuthChange(cb) {
  _authListeners.push(cb);
  cb(_session);
  return () => { _authListeners = _authListeners.filter(fn => fn !== cb); };
}

/** Logout */
export async function signOut() {
  try {
    if (_session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_session.access_token}` },
      });
    }
  } catch { /* abaikan error network saat logout */ }
  clearSession();
}

/**
 * Jalankan callback jika user sudah login.
 * Jika belum login, buka modal dengan konteks pesan.
 */
export function requireAuth(cb, reason = '') {
  if (_session) { if (cb) cb(_session); return; }
  openAuthModal(reason, cb);
}

export async function signUp(email, password, username) {
  const data = await authFetch('/signup', { email, password, data: { username, full_name: username } });
  if (data.access_token) saveSession(data);
  return data;
}

export async function signIn(email, password) {
  const data = await authFetch('/token?grant_type=password', { email, password });
  saveSession(data);
  return data;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function openAuthModal(reason = '', pendingCb = null) {
  _pendingCallback = pendingCb;
  ensureModal();
  setAuthMode('login');
  updateReasonText(reason);
  showModal();
}

function ensureModal() {
  if (_modalEl) return;

  _modalEl = document.createElement('div');
  _modalEl.id = 'auth-modal';
  _modalEl.setAttribute('role', 'dialog');
  _modalEl.setAttribute('aria-modal', 'true');
  _modalEl.setAttribute('aria-label', 'Login atau Daftar');

  _modalEl.innerHTML = `
    <div class="am-backdrop"></div>
    <div class="am-box">

      <button class="am-close" id="am-close" aria-label="Tutup">
        <i class="ph-bold ph-x"></i>
      </button>

      <!-- Header -->
      <div class="am-header">
        <div class="am-logo">
          <i class="ph-fill ph-hexagon"></i>
        </div>
        <div class="am-header-text">
          <span class="am-title">MCGG Network</span>
          <span class="am-sub">Magic Chess: Go Go Community</span>
        </div>
      </div>

      <!-- Reason (opsional) -->
      <p class="am-reason" id="am-reason" hidden></p>

      <!-- Tabs -->
      <div class="am-tabs">
        <button class="am-tab am-tab--active" data-mode="login">Masuk</button>
        <button class="am-tab" data-mode="register">Daftar</button>
        <span class="am-tab-bar" id="am-tab-bar"></span>
      </div>

      <!-- Forms -->
      <div class="am-body">

        <!-- LOGIN -->
        <div id="am-form-login">
          <div class="am-field">
            <label class="am-label" for="am-email-login">Email</label>
            <div class="am-input-row">
              <i class="ph-bold ph-envelope am-icon"></i>
              <input type="email" id="am-email-login" class="am-input"
                placeholder="email@kamu.com" autocomplete="email">
            </div>
          </div>
          <div class="am-field">
            <label class="am-label" for="am-pw-login">Password</label>
            <div class="am-input-row">
              <i class="ph-bold ph-lock am-icon"></i>
              <input type="password" id="am-pw-login" class="am-input am-input--pr"
                placeholder="••••••••" autocomplete="current-password">
              <button type="button" class="am-eye" data-target="am-pw-login" aria-label="Toggle password">
                <i class="ph-bold ph-eye"></i>
              </button>
            </div>
          </div>
          <div class="am-error" id="am-err-login" hidden>
            <i class="ph-bold ph-warning-circle"></i>
            <span id="am-err-login-text"></span>
          </div>
          <button class="am-submit" id="am-submit-login">
            <i class="ph-bold ph-sign-in"></i> Masuk
          </button>
        </div>

        <!-- REGISTER -->
        <div id="am-form-register" hidden>
          <div class="am-field">
            <label class="am-label" for="am-username">Username</label>
            <div class="am-input-row">
              <i class="ph-bold ph-at am-icon"></i>
              <input type="text" id="am-username" class="am-input"
                placeholder="username_kamu" maxlength="30" autocomplete="username">
            </div>
          </div>
          <div class="am-field">
            <label class="am-label" for="am-email-register">Email</label>
            <div class="am-input-row">
              <i class="ph-bold ph-envelope am-icon"></i>
              <input type="email" id="am-email-register" class="am-input"
                placeholder="email@kamu.com" autocomplete="email">
            </div>
          </div>
          <div class="am-field">
            <label class="am-label" for="am-pw-register">Password</label>
            <div class="am-input-row">
              <i class="ph-bold ph-lock am-icon"></i>
              <input type="password" id="am-pw-register" class="am-input am-input--pr"
                placeholder="Minimal 8 karakter" autocomplete="new-password">
              <button type="button" class="am-eye" data-target="am-pw-register" aria-label="Toggle password">
                <i class="ph-bold ph-eye"></i>
              </button>
            </div>
          </div>
          <div class="am-error" id="am-err-register" hidden>
            <i class="ph-bold ph-warning-circle"></i>
            <span id="am-err-register-text"></span>
          </div>
          <button class="am-submit" id="am-submit-register">
            <i class="ph-bold ph-user-plus"></i> Buat Akun
          </button>
        </div>

        <!-- SUCCESS -->
        <div id="am-success" hidden>
          <div class="am-success-wrap">
            <div class="am-success-icon"><i class="ph-fill ph-check-circle"></i></div>
            <p class="am-success-text" id="am-success-text"></p>
          </div>
        </div>

      </div>
    </div>`;

  document.body.appendChild(_modalEl);
  _bindModalEvents();
}

function _bindModalEvents() {
  // Tutup via backdrop atau tombol X
  _modalEl.querySelector('.am-backdrop').addEventListener('click', hideModal);
  _modalEl.querySelector('#am-close').addEventListener('click', hideModal);

  // ESC — hanya saat modal terbuka
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _modalOpen) hideModal();
  });

  // Enter key — hanya dari input di dalam modal, bukan dari luar
  _modalEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (!_modalEl.contains(document.activeElement)) return;
    if (document.activeElement.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (_authMode === 'login') _modalEl.querySelector('#am-submit-login')?.click();
    else _modalEl.querySelector('#am-submit-register')?.click();
  });

  // Tab switch
  _modalEl.querySelectorAll('.am-tab').forEach(tab => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });

  // Password eye toggle
  _modalEl.querySelectorAll('.am-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = _modalEl.querySelector(`#${btn.dataset.target}`);
      const isPw  = input.type === 'password';
      input.type  = isPw ? 'text' : 'password';
      btn.querySelector('i').className = isPw ? 'ph-bold ph-eye-slash' : 'ph-bold ph-eye';
    });
  });

  // ── Submit: Login ──────────────────────────────────────────────────────────
  _modalEl.querySelector('#am-submit-login').addEventListener('click', async () => {
    const btn      = _modalEl.querySelector('#am-submit-login');
    const errEl    = _modalEl.querySelector('#am-err-login');
    const errText  = _modalEl.querySelector('#am-err-login-text');
    const email    = _modalEl.querySelector('#am-email-login').value.trim();
    const password = _modalEl.querySelector('#am-pw-login').value;

    if (!email || !password) {
      showError(errEl, errText, 'Email dan password wajib diisi.');
      return;
    }

    errEl.hidden = true;
    setLoading(btn, true);

    try {
      await signIn(email, password);
      showSuccess('Login berhasil! Selamat datang kembali 👋');
      setTimeout(() => {
        hideModal();
        if (_pendingCallback) { _pendingCallback(_session); _pendingCallback = null; }
      }, 1300);
    } catch (err) {
      const msg = err.message.toLowerCase();
      const friendly = msg.includes('invalid') || msg.includes('credentials')
        ? 'Email atau password salah.'
        : err.message;
      showError(errEl, errText, friendly);
      setLoading(btn, false, '<i class="ph-bold ph-sign-in"></i> Masuk');
    }
  });

  // ── Submit: Register ──────────────────────────────────────────────────────
  _modalEl.querySelector('#am-submit-register').addEventListener('click', async () => {
    const btn      = _modalEl.querySelector('#am-submit-register');
    const errEl    = _modalEl.querySelector('#am-err-register');
    const errText  = _modalEl.querySelector('#am-err-register-text');
    const username = _modalEl.querySelector('#am-username').value.trim();
    const email    = _modalEl.querySelector('#am-email-register').value.trim();
    const password = _modalEl.querySelector('#am-pw-register').value;

    if (!username || username.length < 3) { showError(errEl, errText, 'Username minimal 3 karakter.'); return; }
    if (!email)                            { showError(errEl, errText, 'Email wajib diisi.'); return; }
    if (password.length < 8)              { showError(errEl, errText, 'Password minimal 8 karakter.'); return; }

    errEl.hidden = true;
    setLoading(btn, true);

    try {
      const data = await signUp(email, password, username);
      if (data.access_token) {
        showSuccess('Akun berhasil dibuat! Selamat datang di MCGG 🎉');
        setTimeout(() => {
          hideModal();
          if (_pendingCallback) { _pendingCallback(_session); _pendingCallback = null; }
        }, 1400);
      } else {
        // Butuh konfirmasi email
        showSuccess('Cek email kamu untuk konfirmasi akun, lalu login.');
      }
    } catch (err) {
      const msg = err.message.toLowerCase();
      const friendly = msg.includes('already')
        ? 'Email sudah terdaftar. Coba login.'
        : err.message;
      showError(errEl, errText, friendly);
      setLoading(btn, false, '<i class="ph-bold ph-user-plus"></i> Buat Akun');
    }
  });
}

// ── Helper: set/reset loading state button ────────────────────────────────────
function setLoading(btn, loading, resetHtml = '') {
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<span class="am-spinner"></span>`;
  } else if (resetHtml) {
    btn.innerHTML = resetHtml;
  }
}

// ── Helper: mode tab ─────────────────────────────────────────────────────────
function setAuthMode(mode) {
  _authMode = mode;
  const isLogin = mode === 'login';

  _modalEl.querySelector('#am-form-login').hidden    = !isLogin;
  _modalEl.querySelector('#am-form-register').hidden = isLogin;
  _modalEl.querySelector('#am-success').hidden       = true;

  // Tab active styling + underline bar
  _modalEl.querySelectorAll('.am-tab').forEach(tab => {
    tab.classList.toggle('am-tab--active', tab.dataset.mode === mode);
  });
  const bar = _modalEl.querySelector('#am-tab-bar');
  if (bar) bar.style.transform = isLogin ? 'translateX(0)' : 'translateX(100%)';

  // Clear errors & reset buttons
  ['am-err-login','am-err-register'].forEach(id => {
    const el = _modalEl.querySelector(`#${id}`);
    if (el) el.hidden = true;
  });
  const loginBtn = _modalEl.querySelector('#am-submit-login');
  const regBtn   = _modalEl.querySelector('#am-submit-register');
  if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = '<i class="ph-bold ph-sign-in"></i> Masuk'; }
  if (regBtn)   { regBtn.disabled   = false; regBtn.innerHTML   = '<i class="ph-bold ph-user-plus"></i> Buat Akun'; }

  // Focus input pertama setelah transisi
  setTimeout(() => {
    _modalEl.querySelector(`#am-form-${mode} input:first-of-type`)?.focus();
  }, 60);
}

function updateReasonText(reason) {
  const el = _modalEl?.querySelector('#am-reason');
  if (!el) return;
  if (reason) { el.textContent = `🔒 Login diperlukan ${reason}.`; el.hidden = false; }
  else          el.hidden = true;
}

function showError(wrap, textEl, msg) {
  textEl.textContent = msg;
  wrap.hidden = false;
  // Shake animation
  wrap.classList.remove('am-error--shake');
  void wrap.offsetWidth;
  wrap.classList.add('am-error--shake');
}

function showSuccess(msg) {
  _modalEl.querySelector('#am-form-login').hidden    = true;
  _modalEl.querySelector('#am-form-register').hidden = true;
  _modalEl.querySelector('#am-success').hidden       = false;
  _modalEl.querySelector('#am-success-text').textContent = msg;
}

function showModal() {
  _modalEl.style.display = 'flex';
  _modalOpen = true;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => _modalEl.classList.add('am--visible'));
  });
  setTimeout(() => {
    _modalEl.querySelector('#am-form-login input:first-of-type')?.focus();
  }, 100);
}

function hideModal() {
  _modalEl.classList.remove('am--visible');
  _modalOpen = false;
  document.body.style.overflow = '';
  setTimeout(() => { if (_modalEl) _modalEl.style.display = 'none'; }, 300);
}

// ── Sidebar UI updater ────────────────────────────────────────────────────────
/**
 * ATURAN VISIBILITY:
 * Login   → loginBtn disembunyikan (none), logoutBtn TAMPIL (flex), avatar tampil dengan nama user
 * Logout  → loginBtn TAMPIL (flex), logoutBtn disembunyikan (none), avatar kembali ke guest
 */
function updateSidebarUI(session) {
  const loginBtn  = document.getElementById('sidebar-login-btn');
  const logoutBtn = document.getElementById('sidebar-logout-btn');
  const avatarEl  = document.querySelector('.sidebar__avatar');

  if (session?.user) {
    // ── Sudah login ──────────────────────────────────────────────────────────
    const username = session.user.user_metadata?.username
      || session.user.email?.split('@')[0]
      || 'User';

    // Atur visibilitas tombol menggunakan style.display untuk mengalahkan CSS class
    if (loginBtn)  loginBtn.style.display  = 'none';   // sembunyikan login
    if (logoutBtn) logoutBtn.style.display = 'flex';   // tampilkan logout

    // Perbarui profil avatar
    if (avatarEl) {
      avatarEl.src   = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=6366f1&color=fff&bold=true`;
      avatarEl.alt   = username;
      avatarEl.title = username;
      avatarEl.style.borderColor = 'var(--clr-primary)';
    }
  } else {
    // ── Belum login (guest) ──────────────────────────────────────────────────
    
    // Atur visibilitas tombol menggunakan style.display
    if (loginBtn)  loginBtn.style.display  = 'flex';  // tampilkan login
    if (logoutBtn) logoutBtn.style.display = 'none';  // sembunyikan logout

    // Kembalikan profil ke mode anonim/guest
    if (avatarEl) {
      avatarEl.src   = 'https://ui-avatars.com/api/?name=Guest&background=27272a&color=71717a';
      avatarEl.alt   = 'Guest';
      avatarEl.title = 'Belum login';
      avatarEl.style.borderColor = '';
    }
  }
}

// ── initAuth — panggil sekali per halaman ────────────────────────────────────
export async function initAuth() {
  await loadStoredSession();

  // Inject CSS modal (sekali saja)
  if (!document.getElementById('auth-modal-css')) {
    const style = document.createElement('style');
    style.id = 'auth-modal-css';
    style.textContent = AUTH_MODAL_CSS;
    document.head.appendChild(style);
  }

  // Bind sidebar buttons
  const loginBtn  = document.getElementById('sidebar-login-btn');
  const logoutBtn = document.getElementById('sidebar-logout-btn');

  loginBtn?.addEventListener('click', () => openAuthModal());
  logoutBtn?.addEventListener('click', async () => {
    await signOut();
    _showToast('Kamu telah logout.');
  });

  // Subscribe → update UI setiap kali state berubah
  onAuthChange(updateSidebarUI);
}

// ── Toast global ──────────────────────────────────────────────────────────────
function _showToast(msg) {
  document.querySelectorAll('.mcgg-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className   = 'mcgg-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('mcgg-toast--show'));
  setTimeout(() => {
    t.classList.remove('mcgg-toast--show');
    setTimeout(() => t.remove(), 280);
  }, 3000);
}

// ── Auth Modal CSS ────────────────────────────────────────────────────────────
// Gaya disinkronkan dengan builder.css / glass-panel: background #111, border var(--glass-border),
// radius 20px, font Plus Jakarta Sans, warna aksen var(--clr-primary) / #6366f1.
const AUTH_MODAL_CSS = `
/* === Auth Modal Wrapper === */
#auth-modal {
  position: fixed; inset: 0; z-index: 9000;
  display: none;                /* JS toggle → flex */
  align-items: center; justify-content: center;
  padding: 20px;
}

/* Backdrop blur — sinkron dengan .cp-overlay */
.am-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.78);
  backdrop-filter: blur(8px);
  opacity: 0;
  transition: opacity 0.28s ease;
}
#auth-modal.am--visible .am-backdrop { opacity: 1; }

/* Box utama — sinkron dengan .cp-modal / glass-panel */
.am-box {
  position: relative;
  width: 100%; max-width: 420px;
  background: #111;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 20px;
  padding: 28px 28px 24px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.85);
  transform: translateY(20px);
  opacity: 0;
  transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease;
}
#auth-modal.am--visible .am-box { transform: translateY(0); opacity: 1; }

/* Tombol tutup */
.am-close {
  position: absolute; top: 16px; right: 16px;
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  color: #71717a; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s; font-family: inherit;
}
.am-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

/* Header */
.am-header {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 22px;
}
.am-logo {
  width: 46px; height: 46px; border-radius: 13px;
  background: linear-gradient(135deg, var(--clr-primary, #6366f1), var(--clr-secondary, #a855f7));
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 22px; flex-shrink: 0;
  box-shadow: 0 6px 20px var(--clr-primary-glow, rgba(99,102,241,0.3));
}
.am-title {
  display: block;
  font-size: 16px; font-weight: 800; color: #fff;
  font-family: 'Plus Jakarta Sans', sans-serif;
  line-height: 1.2;
}
.am-sub {
  display: block;
  font-size: 11px; color: #52525b;
  font-family: 'Plus Jakarta Sans', sans-serif;
  margin-top: 2px;
}

/* Reason hint */
.am-reason {
  font-size: 12px; color: #a1a1aa; line-height: 1.5;
  background: rgba(99,102,241,0.07);
  border: 1px solid rgba(99,102,241,0.18);
  border-radius: 9px; padding: 9px 13px; margin-bottom: 18px;
}

/* Tabs */
.am-tabs {
  position: relative;
  display: flex;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 10px; padding: 4px; gap: 2px;
  margin-bottom: 22px;
}
.am-tab-bar {
  position: absolute; top: 4px; left: 4px;
  width: calc(50% - 4px); height: calc(100% - 8px);
  background: rgba(255,255,255,0.08);
  border-radius: 7px; pointer-events: none;
  transition: transform 0.25s var(--anim-ios, ease);
}
.am-tab {
  flex: 1; padding: 9px 8px; border-radius: 7px;
  border: none; background: transparent;
  color: #52525b; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
  transition: color 0.18s; position: relative; z-index: 1;
}
.am-tab--active { color: #fff; }

/* Fields */
.am-field { margin-bottom: 13px; }
.am-label {
  display: block; font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: #52525b; margin-bottom: 6px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}
.am-input-row { position: relative; display: flex; align-items: center; }
.am-icon {
  position: absolute; left: 13px;
  color: #3f3f46; font-size: 15px; pointer-events: none; z-index: 1;
}
.am-input {
  width: 100%; height: 42px;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 10px;
  padding: 0 13px 0 40px;
  color: #fff; font-size: 13px; font-family: 'Plus Jakarta Sans', sans-serif;
  outline: none;
  transition: border-color 0.18s, background 0.18s;
  box-sizing: border-box;
}
.am-input--pr { padding-right: 40px; }
.am-input:focus {
  border-color: var(--clr-primary, #6366f1);
  background: rgba(99,102,241,0.05);
}
.am-input::placeholder { color: #3f3f46; }

.am-eye {
  position: absolute; right: 11px;
  background: transparent; border: none; color: #3f3f46;
  cursor: pointer; font-size: 16px; padding: 4px;
  display: flex; align-items: center; transition: color 0.18s;
}
.am-eye:hover { color: #a1a1aa; }

/* Error message */
.am-error {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #ef4444;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 9px; padding: 9px 12px;
  margin-bottom: 12px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}
.am-error i { font-size: 14px; flex-shrink: 0; }

@keyframes am-shake {
  0%,100% { transform: translateX(0); }
  20%,60% { transform: translateX(-6px); }
  40%,80% { transform: translateX(6px); }
}
.am-error--shake { animation: am-shake 0.38s ease; }

/* Submit button — sinkron dengan .btn--primary di builder.css */
.am-submit {
  width: 100%; height: 42px; margin-top: 4px;
  background: var(--clr-primary, #6366f1); color: #fff;
  border: none; border-radius: 10px;
  font-size: 13px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  box-shadow: 0 4px 12px var(--clr-primary-glow, rgba(99,102,241,0.3));
  transition: all 0.2s var(--anim-bounce, ease);
}
.am-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px var(--clr-primary-glow, rgba(99,102,241,0.4));
}
.am-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

/* Spinner */
.am-spinner {
  width: 17px; height: 17px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  animation: am-spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes am-spin { to { transform: rotate(360deg); } }

/* Success state */
.am-success-wrap { text-align: center; padding: 16px 0 8px; }
.am-success-icon {
  font-size: 52px; color: #22c55e; margin-bottom: 14px;
  animation: am-pop 0.45s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes am-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.am-success-text {
  font-size: 14px; color: #a1a1aa; line-height: 1.6;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* ── Sidebar login/logout buttons — sinkron dengan builder.css ── */

/* Tombol Login (tampil saat belum login) */
#sidebar-login-btn {
  width: 68px; height: 68px; border-radius: 16px;
  background: transparent;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  color: #71717a; cursor: pointer;
  font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 4px;
  transition: all 0.2s var(--anim-ios, ease);
  font-family: 'Plus Jakarta Sans', sans-serif;
}
#sidebar-login-btn i { font-size: 22px; }
#sidebar-login-btn:hover {
  background: rgba(255,255,255,0.05); color: #fff;
}

/* Tombol Logout (tampil saat sudah login) */
#sidebar-logout-btn {
  width: 36px; height: 36px; border-radius: 10px;
  background: transparent;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  color: #71717a; cursor: pointer; font-size: 17px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s;
}
#sidebar-logout-btn:hover { color: #ef4444; background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }

/* ── Toast global — sinkron dgn gaya builder ── */
.mcgg-toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(14px);
  background: rgba(10,10,10,0.95);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-left: 3px solid var(--clr-primary, #6366f1);
  color: #e4e4e7; padding: 11px 20px;
  border-radius: 10px; font-size: 13px; font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  z-index: 99999; pointer-events: none;
  opacity: 0;
  transition: opacity 0.22s, transform 0.22s;
  box-shadow: 0 12px 40px rgba(0,0,0,0.7);
  white-space: nowrap;
  backdrop-filter: blur(8px);
}
.mcgg-toast--show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ── Mobile ── */
@media (max-width: 480px) {
  #auth-modal { padding: 0; align-items: flex-end; }
  .am-box {
    border-radius: 20px 20px 0 0;
    max-width: 100%;
    padding: 24px 20px 28px;
    transform: translateY(40px);
  }
  #auth-modal.am--visible .am-box { transform: translateY(0); }
}
  /* ── Fix konflik atribut hidden vs display: flex ── */
[hidden] {
  display: none !important;
}
`;

