import {
  HERO_DB,
  EQUIP_POOL,
  SYNERGY_THRESHOLDS,
  GL_1G_IDS,
  GL_5G_IDS,
  getEquipRecs,
} from './hero-db.js';

import { 
  initAuth, requireAuth, onAuthChange, getSession, signOut, 
  SUPABASE_URL, SUPABASE_ANON_KEY 
} from './auth.js';
// Tambahkan getSession dan signOut jika belum ada di list import

// FIX: Import checkProfanity from moderation.js — replaces duplicate isToxic()
import { checkProfanity } from './moderation.js';
// ─── SUPABASE HELPERS (WAJIB ADA UNTUK PROFIL & DATABASE) ─────────────────────
async function sbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`);
  return res.json();
}

async function sbGetOne(table, params, token = null) {
  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}&limit=1`, { headers });
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

async function sbUpsert(table, body, token = null) {
  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation,resolution=merge-duplicates',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase UPSERT ${table} → ${res.status}`);
  }
  const rows = await res.json();
  return rows[0] ?? null;
}

// isToxic() REMOVED — replaced by checkProfanity() from moderation.js (DRY fix)
// Usage: checkProfanity(text).clean === false means toxic


// ─── SECURITY UTILS ────────────────────────────────────────────────────────────
// Escapes HTML special chars — wajib dipakai sebelum interpolasi ke innerHTML.
// Dipakai untuk data yang bisa datang dari URL (user-controlled input).
function sanitize(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Set semua trait valid dari HERO_DB — dipakai untuk validasi input URL.
// Dihitung sekali saat modul load, bukan setiap kali decodeFromURL dipanggil.
function buildAllTraits() {
  const s = new Set();
  HERO_DB.forEach(h => h.traits.forEach(t => s.add(t)));
  return s;
}
const ALL_TRAITS = buildAllTraits();

// Validasi heroId: harus ada di HERO_DB
function isValidHeroId(id) { return HERO_DB.some(h => h.id === id); }

// Validasi posisi board: format "row-col", angka dalam range
function isValidPos(pos) {
  const [r, c] = pos.split('-').map(Number);
  return Number.isInteger(r) && Number.isInteger(c) &&
         r >= 0 && r < 6 && c >= 0 && c < 7;
}

const BOARD_ROWS       = 6;
const BOARD_COLS       = 7;
const ENEMY_ROW_END    = 3;
const PLAYER_ROW_START = 3;

const State = {
  board:      {},
  filters:    { cost: 'all', search: '' },
  blessedPos: null,
};

function getActiveCount(traitName, rawCount) {
  const thr = SYNERGY_THRESHOLDS[traitName] || [2, 4];
  if (traitName === 'Mortal Rival') {
    return { activeCount: rawCount, activeTier: rawCount >= 1 ? 1 : 0, nextThreshold: 2, thr };
  }
  const activeCount   = Math.floor(rawCount / 2) * 2;
  const activeTier    = [...thr].reverse().find(t => t <= activeCount) || 0;
  const nextThreshold = thr.find(t => t > rawCount) || thr[thr.length - 1];
  return { activeCount, activeTier, nextThreshold, thr };
}

function generateBoard() {
  const boardEl = document.getElementById('chess-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_ROWS; r++) {
    const isEnemy  = r < ENEMY_ROW_END;
    const isPlayer = r >= PLAYER_ROW_START;
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement('div');
      cell.className    = 'arena-cell';
      cell.dataset.pos  = `${r}-${c}`;
      cell.dataset.zone = isEnemy ? 'enemy' : 'player';
      if (isEnemy)  cell.classList.add('arena-cell--enemy');
      if (isPlayer) cell.classList.add('arena-cell--player');
      cell.addEventListener('dragover',  e => { e.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', ()  => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const fromPos = e.dataTransfer.getData('fromPos');
        const heroId  = e.dataTransfer.getData('heroId');
        if (fromPos) {
          moveHeroOnBoard(fromPos, cell.dataset.pos);
        } else if (heroId) {
          addHeroToBoard(heroId, cell.dataset.pos);
        }
      });
      boardEl.appendChild(cell);
    }
  }
}

function addHeroToBoard(heroId, pos) {
  const hero = HERO_DB.find(h => h.id === heroId);
  if (!hero) return;
  const row  = Number(pos.split('-')[0]);
  const zone = row < ENEMY_ROW_END ? 'enemy' : 'player';
  if (zone === 'player' && !State.board[pos]) {
    const playerCount = Object.keys(State.board)
      .filter(k => Number(k.split('-')[0]) >= PLAYER_ROW_START).length;
    if (playerCount >= 10) { showToast('Area kita penuh! (maks 10 hero)'); return; }
  }
  State.board[pos] = { ...hero, instanceId: Date.now(), isBlessed: false, blessedTrait: null, zone };
  renderBoard();
  updateSynergies();
}

function moveHeroOnBoard(fromPos, toPos) {
  if (fromPos === toPos) return;
  const hero = State.board[fromPos];
  if (!hero) return;
  const toRow  = Number(toPos.split('-')[0]);
  const toZone = toRow < ENEMY_ROW_END ? 'enemy' : 'player';
  if (toZone === 'player' && !State.board[toPos]) {
    const playerCount = Object.keys(State.board)
      .filter(k => Number(k.split('-')[0]) >= PLAYER_ROW_START && k !== fromPos).length;
    if (playerCount >= 10) { showToast('Area kita penuh!'); return; }
  }
  const displaced = State.board[toPos];
  State.board[toPos] = { ...hero, zone: toZone };
  if (displaced) {
    const fromRow  = Number(fromPos.split('-')[0]);
    const fromZone = fromRow < ENEMY_ROW_END ? 'enemy' : 'player';
    State.board[fromPos] = { ...displaced, zone: fromZone };
  } else {
    delete State.board[fromPos];
  }
  const wasFromBlessed = State.blessedPos === fromPos;
  const wasToBlessed   = State.blessedPos === toPos;
  if (displaced) {
    if (wasFromBlessed)    State.blessedPos = toPos;
    else if (wasToBlessed) State.blessedPos = fromPos;
  } else {
    if (wasFromBlessed)    State.blessedPos = toPos;
  }
  renderBoard();
  updateSynergies();
}

function removeHero(pos) {
  if (!State.board[pos]) return;
  if (State.blessedPos === pos) State.blessedPos = null;
  delete State.board[pos];
  renderBoard();
  updateSynergies();
}

function autoPlace(heroId) {
  for (let r = PLAYER_ROW_START; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const key = `${r}-${c}`;
      if (!State.board[key]) { addHeroToBoard(heroId, key); return; }
    }
  }
  showToast('Area kita penuh!');
}

/**
 * renderBoard — Optimised incremental render.
 * Instead of wiping all tokens and rebuilding from scratch on every state change,
 * we iterate each cell and only mutate what actually changed:
 *  - Cell has a token but board[pos] is empty   → remove token
 *  - Cell has no token but board[pos] has hero   → create & attach token
 *  - Cell token exists and board[pos] has hero   → update in-place (style only)
 * This eliminates unnecessary DOM repaint/reflow for unchanged cells.
 */
function renderBoard() {
  document.querySelectorAll('.arena-cell').forEach(cell => {
    const pos    = cell.dataset.pos;
    const hero   = State.board[pos];
    let   token  = cell.querySelector('.hero-token');

    // ── Case 1: no hero for this cell — remove any existing token ──────────────
    if (!hero) {
      token?.remove();
      return;
    }

    // ── Case 2: token doesn't exist yet — create it ────────────────────────────
    if (!token) {
      token = document.createElement('div');
      token.className = 'hero-token';
      token.draggable = true;

      token.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('fromPos', cell.dataset.pos);
        e.dataTransfer.setData('heroId', '');
      });
      token.addEventListener('click',       e => { e.stopPropagation(); openHeroDetailModal(cell.dataset.pos); });
      token.addEventListener('contextmenu', e => { e.preventDefault(); removeHero(cell.dataset.pos); });

      cell.appendChild(token);
    }

    // ── Case 3: token exists — sync mutable attributes only ───────────────────
    token.title = hero.name;
    token.style.backgroundImage = `url(${hero.img})`;
    token.classList.toggle('hero-token--enemy', hero.zone === 'enemy');

    if (hero.isBlessed) {
      token.style.boxShadow   = '0 0 0 3px #eab308, 0 10px 20px rgba(0,0,0,0.6)';
      token.style.borderColor = '#eab308';
    } else {
      token.style.boxShadow   = '';
      token.style.borderColor = '';
    }
  });
}


const COST_COLORS = { 1:'#52525b', 2:'#15803d', 3:'#1d4ed8', 4:'#6d28d9', 5:'#b91c1c' };

function renderHeroPool() {
  const poolEl = document.getElementById('hero-pool');
  if (!poolEl) return;
  poolEl.innerHTML = '';
  const filtered = HERO_DB.filter(h => {
    const matchCost   = State.filters.cost === 'all' || h.cost.toString() === State.filters.cost;
    const matchSearch = State.filters.search === '' ||
      h.name.toLowerCase().includes(State.filters.search) ||
      h.traits.some(t => t.toLowerCase().includes(State.filters.search));
    return matchCost && matchSearch;
  });
  filtered.forEach(hero => {
    const card = document.createElement('div');
    card.className      = 'hero-card';
    card.draggable      = true;
    card.dataset.heroId = hero.id;
    card.title          = `${hero.name} · ${hero.traits.join(' / ')}`;
    card.innerHTML = `
      <div class="hero-card__img-wrap">
        <img src="${sanitize(hero.img)}" alt="${sanitize(hero.name)}" class="hero-card__img" loading="lazy">
        <span class="hero-card__cost" style="background:${COST_COLORS[hero.cost] ?? '#6366f1'}">${hero.cost}</span>
      </div>
      <div class="hero-card__info">
        <span class="hero-card__name">${sanitize(hero.name)}</span>
      </div>`;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('heroId', hero.id);
      e.dataTransfer.setData('fromPos', '');
    });
    card.addEventListener('click', () => autoPlace(hero.id));
    poolEl.appendChild(card);
  });
  const countEl = document.getElementById('hero-pool-count');
  if (countEl) countEl.textContent = `${filtered.length} hero`;
}

function updateSynergies() {
  const playerHeroes = Object.entries(State.board)
    .filter(([k]) => Number(k.split('-')[0]) >= PLAYER_ROW_START)
    .map(([, h]) => h);
  const seen   = new Set();
  const unique = playerHeroes.filter(h => seen.has(h.name) ? false : (seen.add(h.name), true));
  const tp     = {};
  unique.forEach(h => {
    h.traits.forEach(t => { tp[t] = (tp[t] || 0) + 1; });
    if (h.isBlessed && h.blessedTrait && h.traits.includes(h.blessedTrait)) tp[h.blessedTrait]++;
  });
  const gl1 = document.getElementById('gl-select-1g')?.value;
  const gl5 = document.getElementById('gl-select-5g')?.value;
  const boardIds = new Set(Object.values(State.board).map(h => h.id));
  [gl1, gl5].forEach(id => { if (id && boardIds.has(id)) tp['Glory League'] = (tp['Glory League'] || 0) + 1; });
  const hasChou  = unique.some(h => h.id === 'chou');
  const hasValir = unique.some(h => h.id === 'valir');
  let mortalActive = false;
  if      (hasChou && !hasValir) mortalActive = true;
  else if (hasValir && !hasChou) mortalActive = true;
  else if (hasChou && hasValir)  mortalActive = (tp['K.O.F'] || 0) >= 11;
  const activeTypeCount = Object.entries(tp).filter(([name, raw]) =>
    name === 'Mortal Rival' ? mortalActive : Math.floor(raw / 2) * 2 >= 2
  ).length;
  renderSynergyDisplay(tp, mortalActive);
  renderHeaderStats(unique.length, playerHeroes.reduce((s, h) => s + h.cost, 0));
  encodeToURL();
}

function renderSynergyDisplay(tp, mortalActive) {
  const el = document.getElementById('synergy-display');
  if (!el) return;

  if (Object.keys(tp).length === 0) {
    el.innerHTML = '<div class="empty-state"><i class="ph-duotone ph-circles-three-plus"></i><p>Tempatkan hero di area kita untuk menghitung sinergi</p></div>';
    return;
  }

  el.innerHTML = '';
  
  Object.entries(tp)
    .map(([name, rawCount]) => {
      const { activeCount, activeTier, nextThreshold } = getActiveCount(name, rawCount);
      const isActive = name === 'Mortal Rival' ? mortalActive : activeCount >= 2;
      return { name, rawCount, activeCount, activeTier, nextThreshold, isActive };
    })
    .sort((a, b) => b.activeCount - a.activeCount || b.rawCount - a.rawCount)
    .forEach(({ name, rawCount, activeCount, activeTier, isActive }) => {
      
      // Ambil data batas sinergi (misal: [2, 4, 6])
      const thr    = SYNERGY_THRESHOLDS[name] || [2, 4];
      const maxThr = thr[thr.length - 1] || 6; 
      
      // Progress bar dikunci persentasenya menuju level maksimal sinergi
      const displayPct = Math.min((rawCount / maxThr) * 100, 100);

      const tierColors = ['#6366f1','#a855f7','#eab308','#22c55e'];
      const tierIdx    = activeTier ? thr.indexOf(activeTier) : -1;
      const activeClr  = tierColors[Math.max(0, tierIdx)] || '#6366f1';

      // Titik indikator (pips) hanya menyala tegas jika threshold sudah terlewati
      const pips = thr.map(t => {
        const reached = activeCount >= t;
        return `<span class="syn-pip ${reached ? 'syn-pip--lit' : ''}" style="${reached ? 'background:' + activeClr + ';border-color:' + activeClr : ''}"></span>`;
      }).join('');

      const row = document.createElement('div');
      row.className = 'synergy-row' + (isActive ? ' synergy-row--active' : '');
      
      // UI HTML Bersih tanpa teks hint cerewet
      row.innerHTML = `
        <div class="syn-icon" title="${name}"></div>
        <div class="syn-info">
          <div class="syn-header">
            <span class="syn-name" style="color:${isActive ? '#fff' : '#52525b'}">${name.toUpperCase()}</span>
            <div class="syn-count-group">
              ${isActive ? `<span class="syn-active-badge" style="background:${activeClr}22;color:${activeClr};border-color:${activeClr}44">✦ ${activeCount} Aktif</span>` : ''}
              <span class="syn-count-raw" style="color:${isActive ? activeClr : '#71717a'}">
                ${rawCount} / ${maxThr}
              </span>
            </div>
          </div>
          <div class="syn-bar-bg">
            <div class="syn-bar-fill" style="width:${displayPct}%;background:${isActive ? activeClr : 'rgba(255,255,255,0.12)'};"></div>
          </div>
          <div class="syn-pips">${pips}</div>
        </div>`;
        
      el.appendChild(row);
    });
}

function renderHeaderStats(playerUniqueCount, totalGold) {
  const goldEl = document.getElementById('total-gold');
  const popEl  = document.getElementById('population-count');
  if (goldEl) goldEl.textContent = totalGold;
  if (popEl)  popEl.textContent  = `${playerUniqueCount}/10`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function openHeroDetailModal(pos) {
  const hero = State.board[pos];
  if (!hero) return;
  // FIX: Abort the previous modal's AbortController before removing it,
  // preventing dangling event listeners from accumulating on each modal open.
  if (openHeroDetailModal._activeAc) {
    openHeroDetailModal._activeAc.abort();
    openHeroDetailModal._activeAc = null;
  }
  document.getElementById('hero-detail-modal')?.remove();

  const COST_LABEL = { 1:'★ 1-Gold', 2:'★★ 2-Gold', 3:'★★★ 3-Gold', 4:'◆ 4-Gold', 5:'♛ 5-Gold' };
  const COST_CLR   = { 1:'#71717a', 2:'#16a34a', 3:'#2563eb', 4:'#7c3aed', 5:'#b91c1c' };
  const equips     = getEquipRecs(hero.traits);
  const costClr    = COST_CLR[hero.cost] || '#6366f1';

  const overlay = document.createElement('div');
  overlay.id = 'hero-detail-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(14px);padding:16px;';
  overlay.innerHTML = `
    <div style="background:linear-gradient(160deg,rgba(13,13,18,0.99) 0%,rgba(8,8,20,0.99) 100%);border:1px solid rgba(255,255,255,0.1);border-radius:24px;width:100%;max-width:400px;box-shadow:0 0 80px rgba(99,102,241,0.18),0 40px 80px rgba(0,0,0,0.95);overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;">
      <div style="background:linear-gradient(135deg,rgba(${hexToRgb(costClr)},0.18) 0%,transparent 60%);border-bottom:1px solid rgba(255,255,255,0.07);padding:22px 22px 18px;display:flex;align-items:center;gap:16px;">
        <div style="width:62px;height:62px;flex-shrink:0;border-radius:16px;overflow:hidden;border:2px solid ${costClr};box-shadow:0 0 18px ${costClr}55;">
          <img src="${sanitize(hero.img)}" alt="${sanitize(hero.name)}" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <h3 style="font-size:18px;font-weight:800;color:#fff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sanitize(hero.name)}</h3>
            ${hero.isBlessed ? '<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:rgba(234,179,8,0.2);color:#eab308;border:1px solid rgba(234,179,8,0.4);font-weight:700;">✦ BLESSED</span>' : ''}
          </div>
          <span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:${costClr}22;color:${costClr};border:1px solid ${costClr}44;text-transform:uppercase;letter-spacing:0.05em;">${COST_LABEL[hero.cost] || hero.cost + '-Gold'}</span>
        </div>
        <button id="hdm-close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);width:34px;height:34px;border-radius:10px;color:#71717a;font-size:16px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.06);padding:0 22px;">
        ${['info','equip','bless'].map((tab, i) => {
          const labels = { info:'Info', equip:'Equipment', bless:'Blessing' };
          const icons  = { info:'ph-info', equip:'ph-shield-star', bless:'ph-sparkle' };
          return `<button class="hdm-tab" data-tab="${tab}" style="background:transparent;border:none;color:${i===0?'#fff':'#52525b'};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;padding:10px 14px 9px;cursor:pointer;border-bottom:2px solid ${i===0?costClr:'transparent'};transition:0.2s;display:flex;align-items:center;gap:5px;font-family:inherit;"><i class="ph-bold ${icons[tab]}" style="font-size:13px;"></i>${labels[tab]}</button>`;
        }).join('')}
      </div>
      <div id="hdm-body" style="padding:20px 22px 22px;min-height:200px;max-height:55vh;overflow-y:auto;"></div>
      <div style="padding:14px 22px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;background:rgba(0,0,0,0.2);">
        <button id="hdm-remove" style="flex:1;padding:10px;cursor:pointer;font-family:inherit;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:12px;color:#f87171;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="ph-bold ph-trash" style="font-size:13px;"></i> Hapus dari Board
        </button>
      </div>
    </div>`;

  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${hero.name} detail`);
  document.body.appendChild(overlay);

  // ── AbortController ──────────────────────────────────────────────────────────
  // All event listeners added for this modal instance are registered with this
  // signal. Calling ac.abort() on ANY close path (X button, Remove, backdrop
  // click, Escape key) removes every listener simultaneously — no leaks possible.
  const ac = new AbortController();
  openHeroDetailModal._activeAc = ac; // FIX: track active controller for cleanup
  const { signal } = ac;

  function closeModal() {
    ac.abort();      // removes all signal-bound listeners in one call
    openHeroDetailModal._activeAc = null; // FIX: clear reference on normal close
    overlay.remove();
    // Return focus to the hero token that opened this modal
    document.querySelector(`.arena-cell[data-pos="${pos}"] .hero-token`)?.focus();
  }

  // ── Focus Trap ───────────────────────────────────────────────────────────────
  // While the modal is open, Tab/Shift+Tab must cycle only within the modal.
  // Elements behind the overlay remain in the DOM and would otherwise receive
  // focus, making the UI confusing and violating WCAG 2.1 Success Criterion 2.1.2.
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function getFocusable() {
    return [...overlay.querySelectorAll(FOCUSABLE)].filter(
      el => !el.disabled && el.offsetParent !== null
    );
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }, { signal });

  // Move focus into the modal's first focusable element
  requestAnimationFrame(() => getFocusable()[0]?.focus());

  const body = document.getElementById('hdm-body');

  function renderTab(tab) {
    overlay.querySelectorAll('.hdm-tab').forEach(btn => {
      const active       = btn.dataset.tab === tab;
      btn.style.color        = active ? '#fff' : '#52525b';
      btn.style.borderBottom = active ? `2px solid ${costClr}` : '2px solid transparent';
    });

    if (tab === 'info') {
      body.innerHTML = `
        <p style="font-size:9px;font-weight:800;color:#3f3f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Traits</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
          ${hero.traits.map(t => `<span style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);color:#a5b4fc;display:flex;align-items:center;gap:6px;"><i class="ph-bold ph-circles-three-plus" style="font-size:12px;"></i>${t}</span>`).join('')}
        </div>
        <p style="font-size:9px;font-weight:800;color:#3f3f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Aktifkan Blessing</p>
        <div id="hdm-info-bless-btns" style="display:flex;flex-direction:column;gap:7px;"></div>`;

      const container = body.querySelector('#hdm-info-bless-btns');
      hero.traits.forEach(trait => {
        const isActive = hero.isBlessed && hero.blessedTrait === trait;
        const btn = document.createElement('button');
        btn.style.cssText = `width:100%;padding:11px 14px;cursor:pointer;font-family:inherit;background:${isActive ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isActive ? '#eab308' : 'rgba(255,255,255,0.08)'};border-radius:11px;color:${isActive ? '#eab308' : '#e4e4e7'};font-size:12px;font-weight:700;display:flex;align-items:center;gap:9px;text-align:left;transition:0.15s;`;
        btn.innerHTML = `
          <i class="ph-bold ph-sparkle" style="font-size:14px;flex-shrink:0;color:${isActive ? '#eab308' : '#52525b'};"></i>
          <span style="flex:1;">${trait}</span>
          <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;background:${isActive ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)'};color:${isActive ? '#eab308' : '#52525b'};border:1px solid ${isActive ? 'rgba(234,179,8,0.35)' : 'rgba(255,255,255,0.07)'};">${isActive ? '★ AKTIF' : '+2 pts'}</span>`;
        btn.addEventListener('mouseenter', () => { if (!isActive) btn.style.background = 'rgba(234,179,8,0.07)'; });
        btn.addEventListener('mouseleave', () => { if (!isActive) btn.style.background = 'rgba(255,255,255,0.04)'; });
        btn.addEventListener('click', () => {
          if (isActive) {
            State.board[pos].isBlessed    = false;
            State.board[pos].blessedTrait = null;
            State.blessedPos = null;
          } else {
            if (State.blessedPos && State.blessedPos !== pos && State.board[State.blessedPos]) {
              State.board[State.blessedPos].isBlessed    = false;
              State.board[State.blessedPos].blessedTrait = null;
            }
            State.board[pos].isBlessed    = true;
            State.board[pos].blessedTrait = trait;
            State.blessedPos = pos;
          }
          renderBoard();
          updateSynergies();
          closeModal();
        });
        container.appendChild(btn);
      });

      } else if (tab === 'equip') {
      body.innerHTML = `
        <p style="font-size:9px;font-weight:800;color:#3f3f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">Rekomendasi Item</p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${equips.map((eq, i) => `
            <div style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
              
              <div style="width:32px;height:32px;border-radius:8px;flex-shrink:0;background:${['rgba(234,179,8,0.15)','rgba(148,163,184,0.12)','rgba(180,120,60,0.12)'][i]};border:1px solid ${['rgba(234,179,8,0.35)','rgba(148,163,184,0.3)','rgba(180,120,60,0.3)'][i]};display:flex;align-items:center;justify-content:center;overflow:hidden;">
                <img src="${sanitize(eq.icon)}" alt="${sanitize(eq.name)}" style="width:100%;height:100%;object-fit:cover;">
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:#e4e4e7;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sanitize(eq.name)}</div>
                <div style="font-size:10px;color:#52525b;line-height:1.4;">${sanitize(eq.desc)}</div>
              </div>
              <span style="font-size:9px;font-weight:900;color:${['#eab308','#94a3b8','#b47a3c'][i]};text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;">${['Core','2nd','3rd'][i]}</span>
            </div>`).join('')}
        </div>`;

    } else if (tab === 'bless') {
      const otherBlessedPos = State.blessedPos && State.blessedPos !== pos ? State.blessedPos : null;
      const otherHero       = otherBlessedPos ? State.board[otherBlessedPos] : null;
      body.innerHTML = `
        <p style="font-size:9px;font-weight:800;color:#3f3f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Pilih Trait untuk di-Bless</p>
        <p style="font-size:10px;color:#52525b;margin-bottom:14px;line-height:1.5;">Blessing memberi <strong style="color:#eab308">+2 poin</strong> ke trait yang dipilih. Hanya <strong style="color:#fff">1 hero</strong> yang bisa di-bless.</p>
        ${otherHero ? `<div style="margin-bottom:14px;padding:10px 14px;border-radius:10px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);font-size:10px;color:#a16207;line-height:1.5;">⚠ <strong style="color:#eab308">${sanitize(otherHero.name)}</strong> saat ini di-bless (${sanitize(otherHero.blessedTrait)}).</div>` : ''}
        <div id="hdm-bless-btns" style="display:flex;flex-direction:column;gap:8px;"></div>
        ${hero.isBlessed ? '<button id="hdm-bless-remove" style="width:100%;margin-top:12px;padding:10px;cursor:pointer;font-family:inherit;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:11px;color:#f87171;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="ph-bold ph-x-circle"></i> Hapus Blessing</button>' : ''}`;
      hero.traits.forEach(trait => {
        const isSel = hero.isBlessed && hero.blessedTrait === trait;
        const btn   = document.createElement('button');
        btn.dataset.trait = trait;
        btn.style.cssText = `width:100%;padding:12px 16px;cursor:pointer;font-family:inherit;background:${isSel ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isSel ? '#eab308' : 'rgba(255,255,255,0.08)'};border-radius:12px;color:${isSel ? '#eab308' : '#e4e4e7'};font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;text-align:left;transition:0.2s;`;
        btn.innerHTML = `<i class="ph-bold ph-sparkle" style="font-size:15px;flex-shrink:0;color:${isSel ? '#eab308' : '#52525b'};"></i><span style="flex:1;">${trait}</span><span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;background:${isSel ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)'};color:${isSel ? '#eab308' : '#52525b'};border:1px solid ${isSel ? 'rgba(234,179,8,0.35)' : 'rgba(255,255,255,0.07)'};">${isSel ? '★ AKTIF' : '+2 pts'}</span>`;
        btn.addEventListener('mouseenter', () => { if (!isSel) btn.style.background = 'rgba(234,179,8,0.07)'; });
        btn.addEventListener('mouseleave', () => { if (!isSel) btn.style.background = 'rgba(255,255,255,0.04)'; });
        btn.addEventListener('click', () => {
          if (otherBlessedPos && State.board[otherBlessedPos]) {
            State.board[otherBlessedPos].isBlessed    = false;
            State.board[otherBlessedPos].blessedTrait = null;
          }
          State.board[pos].isBlessed    = true;
          State.board[pos].blessedTrait = trait;
          State.blessedPos = pos;
          renderBoard();
          updateSynergies();
          renderTab('bless');
        });
        body.querySelector('#hdm-bless-btns').appendChild(btn);
      });
      body.querySelector('#hdm-bless-remove')?.addEventListener('click', () => {
        State.board[pos].isBlessed    = false;
        State.board[pos].blessedTrait = null;
        State.blessedPos = null;
        renderBoard();
        updateSynergies();
        renderTab('bless');
      });
    }
  }

  overlay.querySelectorAll('.hdm-tab').forEach(btn =>
    btn.addEventListener('click', () => renderTab(btn.dataset.tab), { signal }));

  document.getElementById('hdm-close').addEventListener('click',  closeModal, { signal });
  document.getElementById('hdm-remove').addEventListener('click', () => { removeHero(pos); closeModal(); }, { signal });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { signal });

  // Escape key — now also registered with signal so it's auto-removed on ANY close path
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); }, { signal });
  renderTab('info');
}

function initGloryLeagueDropdowns() {
  function populate(elId, whitelist) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<option value="">— Tidak ada —</option>';
    HERO_DB.filter(h => whitelist.includes(h.id)).forEach(h => {
      const opt       = document.createElement('option');
      opt.value       = h.id;
      opt.textContent = `${h.name} (${h.cost}★)`;
      el.appendChild(opt);
    });
    el.addEventListener('change', updateSynergies);
  }
  populate('gl-select-1g', GL_1G_IDS);
  populate('gl-select-5g', GL_5G_IDS);
}

function showToast(msg, type = 'info') {
  document.querySelectorAll('.mcgg-toast').forEach(t => t.remove());
  const colors = { info:'#6366f1', success:'#22c55e', error:'#ef4444', warn:'#eab308' };
  const clr    = colors[type] ?? colors.info;
  const t      = document.createElement('div');
  t.className  = 'mcgg-toast';
  t.innerHTML  = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${clr};margin-right:8px;flex-shrink:0"></span>${msg}`;
  t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(12px);background:#111;border:1px solid rgba(255,255,255,0.1);color:#e4e4e7;padding:11px 22px;border-radius:12px;font-size:13px;font-weight:600;font-family:inherit;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.22s,transform 0.22s;display:flex;align-items:center;box-shadow:0 16px 40px rgba(0,0,0,0.7);border-left:3px solid ${clr};`;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => t.remove(), 280);
  }, 3000);
}


function bindEvents() {
  document.getElementById('toggle-view')?.addEventListener('click', () =>
    document.getElementById('chess-board')?.classList.toggle('flat'));
  document.getElementById('clear-board')?.addEventListener('click', () => {
    State.board = {}; State.blessedPos = null;
    renderBoard(); updateSynergies();
  });
  document.getElementById('hero-search')?.addEventListener('input', e => {
    State.filters.search = e.target.value.trim().toLowerCase();
    renderHeroPool();
  });
  document.querySelectorAll('.filter-chip[data-cost]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-cost]').forEach(c => c.classList.remove('filter-chip--active'));
      chip.classList.add('filter-chip--active');
      State.filters.cost = chip.dataset.cost;
      renderHeroPool();
    });
  });
  document.getElementById('share-lineup')?.addEventListener('click', handleSaveLineup);
}

function bindProfileEvents() {
    // Desktop: Klik pada avatar di sidebar kiri
    document.querySelector('.sidebar__user')?.addEventListener('click', () => {
        if (typeof openProfileModal === 'function') openProfileModal();
    });

    // Mobile: Klik pada FAB profil (jika ada di HTML)
    document.getElementById('fab-profile')?.addEventListener('click', () => {
        if (typeof openProfileModal === 'function') openProfileModal();
    });
}

// ─── FITUR PROFIL VISUAL ──────────────────────────────────────────────────────────
function openProfileModal() {
  let modal = document.getElementById('profile-modal');
  if (!modal) modal = _buildProfileModal();

  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session) return;

  const uname  = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User';
  modal.querySelector('#pm-uname').textContent = `@${uname}`;
  modal.querySelector('#pm-email').textContent = session.user.email || '';
  modal.querySelector('#pm-initials').textContent = uname.slice(0,2).toUpperCase();

  const rankEl = modal.querySelector('#pm-rank');
  const cmdEl  = modal.querySelector('#pm-commander');
  const linEl  = modal.querySelector('#pm-lineup-display');

  // Helper merender JSON Lineup jadi visual gambar
  function renderVisualLineup(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data && data.heroes) {
        const imgs = data.heroes.map(id => {
          const h = HERO_DB.find(x => x.id === id);
          return h ? `<img src="${sanitize(h.img)}" title="${sanitize(h.name)}" style="width:34px;height:34px;border-radius:50%;border:2px solid #6366f1;object-fit:cover;">` : '';
        }).join('');
        linEl.innerHTML = `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${imgs}</div>
          <div style="font-size:11px;color:#eab308;font-weight:700;">✦ Sinergi: ${sanitize(data.synergies)}</div>`;
        return;
      }
    } catch(e) {}
    linEl.innerHTML = jsonStr ? `<span style="color:#a1a1aa">${sanitize(jsonStr)}</span>` : 'Belum ada lineup tersimpan.';
  }

  const local = _loadLocalProfile();
  if (local.rank)      rankEl.value = local.rank;
  if (local.commander) cmdEl.value  = local.commander;
  renderVisualLineup(local.lineup);

  if (typeof sbGetOne === 'function') {
    sbGetOne('profiles', `user_id=eq.${session.user.id}&select=mc_rank,fav_commander,fav_lineup`, session.access_token)
      .then(row => {
        if (!row) return;
        if (row.mc_rank)       rankEl.value = row.mc_rank;
        if (row.fav_commander) cmdEl.value  = row.fav_commander;
        renderVisualLineup(row.fav_lineup);
        _saveLocalProfile({ rank: row.mc_rank, commander: row.fav_commander, lineup: row.fav_lineup });
      }).catch(() => {});
  }

  modal.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('pm--open')));
  document.body.style.overflow = 'hidden';
}

function _buildProfileModal() {
  const el = document.createElement('div');
  el.id = 'profile-modal';
  el.innerHTML = `
    <div class="pm-backdrop"></div>
    <div class="pm-box">
      <button class="pm-x" id="pm-close">✕</button>
      <div class="pm-hero">
        <div class="pm-avatar"><span id="pm-initials">?</span></div>
        <div>
          <div class="pm-uname" id="pm-uname">—</div>
          <div class="pm-email" id="pm-email">—</div>
        </div>
      </div>
      <div class="pm-section"><i class="ph-bold ph-game-controller"></i> Profil Magic Chess</div>
      <div class="pm-row">
        <label class="pm-lbl">Rank Saat Ini</label>
        <select id="pm-rank" class="pm-sel">
          <option value="">— Pilih Rank —</option>
          ${MC_RANKS.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>
      <div class="pm-row">
        <label class="pm-lbl">Commander Favorit</label>
        <select id="pm-commander" class="pm-sel">
          <option value="">— Pilih Commander —</option>
          ${MC_COMMANDERS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="pm-row">
        <label class="pm-lbl">Lineup Favorit Terakhir</label>
        <div id="pm-lineup-display" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:11px;padding:12px;min-height:60px;color:#71717a;font-size:12px;display:flex;flex-direction:column;justify-content:center;">
          Belum ada lineup tersimpan.
        </div>
        <span class="pm-hint">Lineup otomatis ter-update saat kamu klik Simpan/Share di Builder.</span>
      </div>
      <div class="pm-foot">
        <button class="pm-btn pm-btn--logout" id="pm-logout"><i class="ph-bold ph-sign-out"></i> Logout</button>
        <button class="pm-btn pm-btn--save" id="pm-save"><i class="ph-bold ph-floppy-disk"></i> Simpan Rank</button>
      </div>
      <div class="pm-saved" id="pm-saved" hidden><i class="ph-bold ph-check-circle"></i> Profil tersimpan!</div>
    </div>`;
  document.body.appendChild(el);
  if (typeof _injectProfileCSS === 'function') _injectProfileCSS();

  el.querySelector('.pm-backdrop').addEventListener('click', _closeProfileModal);
  el.querySelector('#pm-close').addEventListener('click', _closeProfileModal);

  el.querySelector('#pm-logout').addEventListener('click', async () => {
    _closeProfileModal();
    if(typeof signOut === 'function') await signOut();
    showToast('Kamu telah logout.', 'info');
  });

  // Tombol Simpan di profil sekarang HANYA simpan rank & commander (Lineup disave dari halaman Builder)
  el.querySelector('#pm-save').addEventListener('click', async () => {
    const session = typeof getSession === 'function' ? getSession() : null;
    const rank    = el.querySelector('#pm-rank').value;
    const cmd     = el.querySelector('#pm-commander').value;

    const local = _loadLocalProfile();
    _saveLocalProfile({ ...local, rank, commander: cmd });

    if (session?.user) {
      sbUpsert('profiles', {
        user_id: session.user.id, mc_rank: rank || null, fav_commander: cmd || null
      }, session.access_token).catch(e => console.warn('[profile] sync:', e.message));
    }
    const ok = el.querySelector('#pm-saved');
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; _closeProfileModal(); }, 800);
  });

  return el;
}

function _closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.classList.remove('pm--open');
  document.body.style.overflow = '';
  setTimeout(() => { modal.style.display = 'none'; }, 280);
}


// ─── FITUR SIMPAN & BAGIKAN KE KOMUNITAS ──────────────────────────────────────
function handleSaveLineup() {
  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session) { showToast('⚠ Login dulu untuk menyimpan lineup!', 'warn'); return; }

  const playerHeroes = Object.entries(State.board)
    .filter(([k]) => Number(k.split('-')[0]) >= PLAYER_ROW_START).map(([, h]) => h);
  if (!playerHeroes.length) { showToast('Board kosong! Taruh hero dulu.', 'warn'); return; }

  const seen = new Set();
  const unique = playerHeroes.filter(h => seen.has(h.name) ? false : (seen.add(h.name), true));
  const tp = {};
  unique.forEach(h => {
    h.traits.forEach(t => { tp[t] = (tp[t] || 0) + 1; });
    if (h.isBlessed && h.blessedTrait) tp[h.blessedTrait]++;
  });

  const hasChou  = unique.some(h => h.id === 'chou');
  const hasValir = unique.some(h => h.id === 'valir');
  const mortalOk = (hasChou && !hasValir) || (hasValir && !hasChou) || ((hasChou && hasValir) && (tp['K.O.F'] || 0) >= 11);

  const activeSynergies = Object.entries(tp)
    .filter(([n, v]) => n === 'Mortal Rival' ? mortalOk : Math.floor(v / 2) * 2 >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `${n} x${n === 'Mortal Rival' ? v : Math.floor(v / 2) * 2}`)
    .join(', ');

  // KITA SIMPAN SEBAGAI OBJEK JSON AGAR BISA DIREKTUR JADI GAMBAR DI PROFIL
  const savedData = {
    heroes: unique.map(h => h.id),
    synergies: activeSynergies || 'Belum ada'
  };
  const lineupJSON = JSON.stringify(savedData);

  const local = _loadLocalProfile();
  local.lineup = lineupJSON;
  _saveLocalProfile(local);

  if (session?.user) {
    sbUpsert('profiles', {
      user_id: session.user.id, fav_lineup: lineupJSON
    }, session.access_token).catch(e => console.warn('[profile] sync:', e.message));
  }

  showToast('✓ Lineup berhasil disimpan ke Profil!', 'success');
  _showShareCommunityModal(unique, activeSynergies);
}

function _showShareCommunityModal(heroes, synergies) {
  document.getElementById('share-modal')?.remove();

  const el = document.createElement('div');
  el.id = 'share-modal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(14px);padding:16px;';

  // Hero images for download capture
  const heroImgs = heroes.map(h => `<img src="${sanitize(h.img)}" title="${sanitize(h.name)}" style="width:44px;height:44px;border-radius:8px;border:2px solid rgba(99,102,241,0.6);object-fit:cover;background:#1a1a2e;" loading="lazy">`).join('');

  // embedHTML stored in database 'body' field — must use flex-direction:row so feed card renders hero grid correctly
  const embedHTML = `<div style="background:#131317;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;font-family:'Plus Jakarta Sans',sans-serif;"><h4 style="margin:0 0 14px;color:#fff;font-size:15px;font-weight:800;">🔥 Lineup Magic Chess GoGo</h4><div style="display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:flex-start;">${heroes.map(h=>`<div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><img src="${sanitize(h.img)}" title="${sanitize(h.name)}" style="width:52px;height:52px;border-radius:10px;border:2px solid rgba(99,102,241,0.6);object-fit:cover;background:#1a1a2e;" loading="lazy"><span style="font-size:9px;color:#a1a1aa;font-weight:600;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">${sanitize(h.name)}</span></div>`).join('')}</div><div style="font-size:12px;color:#eab308;font-weight:700;">✦ Sinergi: ${synergies || 'Belum ada'}</div></div>`;

  // Capture area for html2canvas download
  const captureAreaHTML = `
    <div id="lineup-capture-area" style="background:#131317;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:15px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
      <h4 style="margin:0 0 14px;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;">🔥 Lineup Magic Chess GoGo</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${heroImgs}</div>
      <div style="font-size:12px;color:#eab308;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;">✦ Sinergi: ${synergies || 'Belum ada'}</div>
    </div>
  `;

  el.innerHTML = `
    <div style="background:#0c0c0e;border:1px solid rgba(255,255,255,0.1);border-radius:20px;width:100%;max-width:440px;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,0.8);font-family:'Plus Jakarta Sans',sans-serif;">
      <h3 style="color:#fff;margin:0 0 10px;font-size:18px;display:flex;align-items:center;gap:8px;">
        <i class="ph-bold ph-share-network" style="color:#a855f7;"></i> Pamer ke Komunitas
      </h3>
      <p style="color:#a1a1aa;font-size:13px;margin:0 0 16px;line-height:1.5;">Lineup kamu udah otomatis tersimpan di Profil! Silakan Download sebagai gambar atau Post langsung ke forum komunitas.</p>

      <input type="text" id="sm-title" placeholder="Tulis judul postingan... (cth: Auto Mythic pake ini!)" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;color:#fff;font-family:inherit;font-size:13px;margin-bottom:14px;box-sizing:border-box;outline:none;">

      ${captureAreaHTML}

      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <button id="sm-download" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.1);color:#a5b4fc;cursor:pointer;font-family:inherit;font-weight:700;transition:0.2s;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="ph-bold ph-download-simple"></i> Download Lineup
        </button>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="sm-cancel" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#e4e4e7;cursor:pointer;font-family:inherit;font-weight:700;">Tutup</button>
        <button id="sm-post" style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;cursor:pointer;font-family:inherit;font-weight:700;">Posting ke Forum</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('#sm-cancel').addEventListener('click', () => el.remove());

  // EVENT LISTENER DOWNLOAD GAMBAR (MENGGUNAKAN HTML2CANVAS)
  el.querySelector('#sm-download').addEventListener('click', () => {
    if (typeof html2canvas === 'undefined') {
      showToast('⚠ Error: Script html2canvas belum ditambahkan di HTML', 'error');
      return;
    }
    const target = el.querySelector('#lineup-capture-area');
    const btn = el.querySelector('#sm-download');
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Memproses...';
    
    // allowTaint & useCORS mencegah error gambar dari link luar
    html2canvas(target, { backgroundColor: '#131317', useCORS: true, allowTaint: true }).then(canvas => {
      const link = document.createElement('a');
      link.download = `MCGG-Lineup-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      btn.innerHTML = '<i class="ph-bold ph-download-simple"></i> Download Lineup';
      showToast('✓ Gambar berhasil diunduh!', 'success');
    }).catch(err => {
      showToast('⚠ Gagal render gambar', 'error');
      btn.innerHTML = '<i class="ph-bold ph-download-simple"></i> Download Lineup';
    });
  });

  // EVENT LISTENER POSTING KOMUNITAS
  el.querySelector('#sm-post').addEventListener('click', async () => {
    const titleInput = el.querySelector('#sm-title').value.trim();
    if (!titleInput) { showToast('Judul postingan harus diisi!', 'warn'); return; }

    // HAPUS INI: const BANNED = [...]; if (BANNED.some(...))
    // GANTI JADI INI:
    if (!checkProfanity(titleInput).clean) {
        showToast('⚠️ Waduh, bahasanya dijaga ya bang!', 'error'); 
        return;
    }

    const session = typeof getSession === 'function' ? getSession() : null;
    const btn = el.querySelector('#sm-post');
    btn.textContent = 'Memposting...'; btn.disabled = true;

    try {
      const uname = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User';
      // === KODE BYPASS SUPABASE ===
      const response = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          title: titleInput, 
          body: embedHTML, 
          author: uname, 
          author_initials: uname.slice(0, 2).toUpperCase(), // <-- Tambahin inisial (misal: "CH")
          user_id: session.user.id,
          category: 'guide', 
          tag: 'Lineup'
        })
      });

      if (!response.ok) {
        // Kita tangkap error lengkapnya dari Supabase
        const err = await response.json();
        console.error("🔎 DETAIL ERROR SUPABASE:", err);
        // Tampilkan pesan error spesifik beserta hint/detailnya ke Toast
        throw new Error(`${err.message} - ${err.details || err.hint || 'Cek console browser!'}`);
      }

      // === END KODE BYPASS ===
      showToast('✓ Berhasil diposting ke Komunitas!', 'success');
      el.remove();
    } catch (err) {
      showToast('Gagal memposting: ' + err.message, 'error');
      btn.textContent = 'Coba Lagi'; btn.disabled = false;
    }
  });
}

// --- DATA PROFIL MAGIC CHESS (WAJIB ADA AGAR TIDAK ERROR) ---
const MC_RANKS = [
  'Rookie I','Rookie II','Rookie III',
  'Elite I','Elite II','Elite III',
  'Master I','Master II','Master III',
  'Grandmaster I','Grandmaster II','Grandmaster III',
  'Epic I','Epic II','Epic III',
  'Legend I','Legend II','Legend III',
  'Mythic','Mythic Honor','Mythic Glory',
];
const MC_COMMANDERS = [
  'Tigreal','Freya','Minotaur','Gatotkaca','Johnson','Uranus','Belerick','Akai',
  'Hylos','Lolita','Franco','Atlas','Grock','Khufra','Edith','Benedetta',
  'Paquito','Yin','Chou','Fanny','Hayabusa','Lancelot','Gusion','Selena',
  'Karina','Harley','Lunox','Vale','Lylia','Mathilda','Alice','Cecilion',
  'Odette','Kagura','Pharsa','Yve','Angela','Floryn','Carmilla','Chang\'e',
  'Diggie','Popol & Kupa','Kimmy','Nana','Cyclops','Lesley','Beatrix',
  'Clint','Claude','Moskov','Miya','Layla','Yi Sun-shin','Hanabi','Granger',
  'Brody','Melissa','Irithel','Wanwan','Karrie','Roger','Balmond','Thamuz',
  'Aldous','Bane','Ruby','Sun','Lapu-Lapu','Zilong','Alpha','Terizla',
  'Argus','Dyrroth','Phoveus','Aulus','Xavier',
];

// Pastikan helper localStorage ini juga ada agar fitur Simpan jalan
const PROFILE_LS_KEY = 'mcgg_user_profile';
function _loadLocalProfile()   { try { return JSON.parse(localStorage.getItem(PROFILE_LS_KEY) || '{}'); } catch { return {}; } }
function _saveLocalProfile(d)  { try { localStorage.setItem(PROFILE_LS_KEY, JSON.stringify(d)); } catch (_) {} }

// ─── TOUCH DRAG-AND-DROP ────────────────────────────────────────────────────────
// HTML5 DnD API only works with a mouse. This adds equivalent touch support
// by translating touchstart/touchmove/touchend into the same board actions.
let touchDrag = null; // { fromPos?, heroId?, ghost }

function initTouchDnD() {
  const board   = document.getElementById('chess-board');
  const heroPool = document.getElementById('hero-pool');
  if (!board) return;

  // Helper: get the board cell (arena-cell) under a touch point
  function cellAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest('.arena-cell') ?? null;
  }

  // Helper: create a translucent ghost element that follows the finger
  function createGhost(sourceEl) {
    const ghost = sourceEl.cloneNode(true);
    ghost.style.cssText = `
      position: fixed; opacity: 0.7; pointer-events: none; z-index: 9999;
      width: ${sourceEl.offsetWidth}px; height: ${sourceEl.offsetHeight}px;
      border-radius: 50%; transform: translate(-50%, -50%); transition: none;
    `;
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(ghost, x, y) {
    ghost.style.left = `${x}px`;
    ghost.style.top  = `${y}px`;
  }

  function clearHighlight() {
    document.querySelectorAll('.arena-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  }

  // Touch on a hero token already on the board
  board.addEventListener('touchstart', e => {
    const token = e.target.closest('.hero-token');
    const cell  = e.target.closest('.arena-cell');
    if (!token || !cell) return;

    e.preventDefault();
    const t = e.touches[0];
    touchDrag = { fromPos: cell.dataset.pos, ghost: createGhost(token) };
    moveGhost(touchDrag.ghost, t.clientX, t.clientY);
  }, { passive: false });

  // Touch on a hero card in the pool
  // Menggunakan long-press 280ms agar scroll daftar hero tidak mati.
  // passive:true di touchstart = browser tetap bisa scroll; preventDefault hanya
  // dipanggil di touchmove SETELAH drag dikonfirmasi.
  if (heroPool) {
    let lpTimer  = null;
    let lpOrigin = null;

    heroPool.addEventListener('touchstart', e => {
      const card = e.target.closest('.hero-card');
      if (!card) return;
      const t = e.touches[0];
      lpOrigin = { x: t.clientX, y: t.clientY };
      lpTimer  = setTimeout(() => {
        lpTimer = null;
        touchDrag = { heroId: card.dataset.heroId, ghost: createGhost(card) };
        moveGhost(touchDrag.ghost, t.clientX, t.clientY);
        card.style.opacity = '0.45';
      }, 280);
    }, { passive: true });

    heroPool.addEventListener('touchmove', e => {
      if (!lpTimer) return;
      const t  = e.touches[0];
      const dx = Math.abs(t.clientX - lpOrigin.x);
      const dy = Math.abs(t.clientY - lpOrigin.y);
      if (dx > 8 || dy > 8) { clearTimeout(lpTimer); lpTimer = null; }
    }, { passive: true });

    heroPool.addEventListener('touchend', e => {
      clearTimeout(lpTimer); lpTimer = null;
      const card = e.target.closest('.hero-card');
      if (card) card.style.removeProperty('opacity');
    }, { passive: true });
  }

  document.addEventListener('touchmove', e => {
    if (!touchDrag) return;
    e.preventDefault();
    const t = e.touches[0];
    moveGhost(touchDrag.ghost, t.clientX, t.clientY);

    clearHighlight();
    const target = cellAtPoint(t.clientX, t.clientY);
    if (target) target.classList.add('drag-over');
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!touchDrag) return;
    const t = e.changedTouches[0];
    clearHighlight();
    touchDrag.ghost.remove();

    const target = cellAtPoint(t.clientX, t.clientY);
    if (target) {
      if (touchDrag.fromPos) {
        moveHeroOnBoard(touchDrag.fromPos, target.dataset.pos);
      } else if (touchDrag.heroId) {
        addHeroToBoard(touchDrag.heroId, target.dataset.pos);
      }
    }
    touchDrag = null;
  });

  document.addEventListener('touchcancel', () => {
    if (!touchDrag) return;
    clearHighlight();
    touchDrag.ghost.remove();
    touchDrag = null;
  });
}

// ─── URL STATE ─────────────────────────────────────────────────────────────────
// Format: ?comp=3-0:chou,3-1:valir&blessed=3-0:K.O.F&gl1=chou&gl5=valir
// Hanya menyimpan player-zone (rows >= PLAYER_ROW_START). replaceState dipakai
// agar tombol Back browser tidak spam per-placement.
function encodeToURL() {
  const params = new URLSearchParams();
  const comp = Object.entries(State.board)
    .filter(([pos]) => Number(pos.split('-')[0]) >= PLAYER_ROW_START)
    .map(([pos, hero]) => `${pos}:${hero.id}`)
    .join(',');
  if (comp) params.set('comp', comp);
  if (State.blessedPos && State.board[State.blessedPos]?.isBlessed) {
    const h = State.board[State.blessedPos];
    params.set('blessed', `${State.blessedPos}:${encodeURIComponent(h.blessedTrait)}`);
  }
  const gl1 = document.getElementById('gl-select-1g')?.value;
  const gl5 = document.getElementById('gl-select-5g')?.value;
  if (gl1) params.set('gl1', gl1);
  if (gl5) params.set('gl5', gl5);
  history.replaceState(null, '', params.toString()
    ? `${location.pathname}?${params}` : location.pathname);
}

function decodeFromURL() {
  const params = new URLSearchParams(location.search);
  if (!params.has('comp')) return;
  let placed = 0;
  params.get('comp').split(',').forEach(entry => {
    const [pos, heroId] = entry.split(':');
    // Validasi: pos harus format valid, heroId harus ada di HERO_DB
    if (pos && heroId && isValidPos(pos) && isValidHeroId(heroId)) {
      addHeroToBoard(heroId, pos); placed++;
    }
  });
  if (params.has('blessed')) {
    const colonIdx = params.get('blessed').indexOf(':');
    if (colonIdx !== -1) {
      const bPos     = params.get('blessed').slice(0, colonIdx);
      const rawTrait = params.get('blessed').slice(colonIdx + 1);
      const trait    = decodeURIComponent(rawTrait || '');
      // Validasi kritis: trait HARUS ada di ALL_TRAITS (whitelist dari HERO_DB)
      // Ini mencegah XSS — string arbitrary dari URL tidak bisa masuk ke State
      if (isValidPos(bPos) && ALL_TRAITS.has(trait) && State.board[bPos]) {
        if (State.blessedPos && State.board[State.blessedPos]) {
          State.board[State.blessedPos].isBlessed    = false;
          State.board[State.blessedPos].blessedTrait = null;
        }
        State.board[bPos].isBlessed    = true;
        State.board[bPos].blessedTrait = trait;
        State.blessedPos = bPos;
        renderBoard(); updateSynergies();
      }
    }
  }
  // GL dropdowns diisi setelah options sudah ada (initGloryLeagueDropdowns sudah dipanggil)
  requestAnimationFrame(() => {
    const gl1El = document.getElementById('gl-select-1g');
    const gl5El = document.getElementById('gl-select-5g');
    const gl1   = params.get('gl1');
    const gl5   = params.get('gl5');
    // Validasi: value harus heroId yang valid
    if (gl1El && gl1 && isValidHeroId(gl1)) { gl1El.value = gl1; updateSynergies(); }
    if (gl5El && gl5 && isValidHeroId(gl5)) { gl5El.value = gl5; updateSynergies(); }
  });
  if (placed > 0) showToast(`✓ ${placed} hero dimuat dari link!`, 'success');
}

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
function initKeyboardShortcuts() {
  let helpEl = null;

  function isTyping() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function toggleHelp() {
    if (helpEl) { helpEl.remove(); helpEl = null; return; }
    if (!document.getElementById('kb-anim-style')) {
      const s = document.createElement('style');
      s.id = 'kb-anim-style';
      s.textContent = `@keyframes kb-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
      document.head.appendChild(s);
    }
    const rows = [
      ['1–5',    'Filter hero by cost (1★–5★)'],
      ['0 / `',  'Tampilkan semua hero'],
      ['R',      'Reset board'],
      ['Ctrl+C', 'Salin lineup ke clipboard'],
      ['/',      'Fokus pencarian hero'],
      ['?',      'Toggle panduan ini'],
    ].map(([k, d]) => `
      <tr>
        <td style="padding:6px 0;white-space:nowrap">
          <kbd style="padding:2px 7px;border-radius:5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);font-size:11px;color:#e4e4e7;font-family:inherit">${k}</kbd>
        </td>
        <td style="padding:6px 0 6px 14px;font-size:12px;color:#a1a1aa">${d}</td>
      </tr>`).join('');
    helpEl = document.createElement('div');
    helpEl.setAttribute('role', 'dialog');
    helpEl.setAttribute('aria-label', 'Keyboard shortcuts');
    helpEl.style.cssText = 'position:fixed;bottom:32px;right:32px;z-index:99998;background:rgba(10,10,12,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:22px 26px;box-shadow:0 24px 64px rgba(0,0,0,0.8);backdrop-filter:blur(24px);font-family:inherit;animation:kb-in 0.2s ease';
    helpEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:10px;font-weight:900;color:#52525b;text-transform:uppercase;letter-spacing:0.1em">Keyboard Shortcuts</span>
        <button id="kb-close" aria-label="Tutup" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);width:24px;height:24px;border-radius:7px;color:#71717a;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <table style="border-collapse:collapse">${rows}</table>`;
    document.body.appendChild(helpEl);
    document.getElementById('kb-close')?.addEventListener('click', () => { helpEl?.remove(); helpEl = null; });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && helpEl)                    { helpEl.remove(); helpEl = null; return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey)       { e.preventDefault(); toggleHelp(); return; }
    if (isTyping()) return;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const s = document.getElementById('hero-search');
      s?.focus(); s?.select(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault(); copyLineupToClipboard(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ('12345'.includes(e.key)) {
      e.preventDefault();
      document.querySelector(`.filter-chip[data-cost="${e.key}"]`)?.click();
    } else if (e.key === '0' || e.key === '`') {
      e.preventDefault();
      document.querySelector('.filter-chip[data-cost="all"]')?.click();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (!Object.keys(State.board).length) { showToast('Board sudah kosong!', 'warn'); return; }
      State.board = {}; State.blessedPos = null;
      renderBoard(); updateSynergies();
      showToast('Board direset.', 'info');
    }
  });
}

// ─── OG META (title + og:tags) ─────────────────────────────────────────────────
// Catatan: og:image dinamis butuh SSR. Fungsi ini update <title> dan og:title/description
// yang berguna untuk UX (tab name) dan crawler yang menjalankan JS (e.g. Googlebot).
function initOGMeta() {
  function setMeta(prop, val, isName = false) {
    const attr = isName ? 'name' : 'property';
    let el = document.querySelector(`meta[${attr}="${prop}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  }
  function update() {
    const heroes = Object.entries(State.board)
      .filter(([p]) => Number(p.split('-')[0]) >= PLAYER_ROW_START).map(([, h]) => h);
    const seen   = new Set();
    const unique = heroes.filter(h => seen.has(h.name) ? false : (seen.add(h.name), true));
    const tp     = {};
    unique.forEach(h => { h.traits.forEach(t => { tp[t] = (tp[t] || 0) + 1; }); });
    const syns  = Object.entries(tp).filter(([, v]) => Math.floor(v / 2) * 2 >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => `${n}×${Math.floor(v / 2) * 2}`).join(', ');
    const names = unique.slice(0, 3).map(h => h.name).join(' · ');
    const title = names ? `${names} — MCGG Builder` : 'MCGG Lineup Builder';
    const desc  = syns
      ? `${unique.map(h => h.name).join(', ')} — ${syns} · MCGG Network`
      : 'Build dan share lineup Magic Chess kamu di MCGG Network.';
    document.title = title;
    setMeta('og:title', title);       setMeta('og:description', desc);
    setMeta('og:url', location.href);
    setMeta('twitter:title', title, true); setMeta('twitter:description', desc, true);
  }
  // updateSynergies sudah memanggil encodeToURL yang refleksikan perubahan board;
  // tapi OG perlu sumber sendiri karena update saat blessing/GL juga berubah.
  // MutationObserver di sini aman: hanya observe childList (token masuk/keluar),
  // bukan attributeOldValue/subtree style — tidak akan tembak saat boxShadow berubah.
  const board = document.getElementById('chess-board');
  if (board) {
    let timeoutId = null;
    const mo = new MutationObserver(() => {
      // Clear previous timeout to prevent race conditions
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        update();
        timeoutId = null;
      }, 150);
    });
    mo.observe(board, { childList: true });
    // Store observer reference for cleanup if needed
    board._ogObserver = mo;
  }
  update();
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inisialisasi Auth dan TUNGGU sampai selesai
  await initAuth();
  bindProfileEvents();

  // 2. Cek apakah sesi sudah ada
  onAuthChange(session => {
    if (session) {
      // Jika sudah login, baru render semua isi builder
      generateBoard();
      renderHeroPool();
      initGloryLeagueDropdowns();
      bindEvents();
      initTouchDnD();
      updateSynergies();
      decodeFromURL();
      initKeyboardShortcuts();
      initOGMeta();
    } else {
      // Jika belum, paksa login
      requireAuth(() => {
          location.reload(); // Reload jika baru saja berhasil login
      }, 'untuk mengakses Lineup Builder');
    }
  });
});
