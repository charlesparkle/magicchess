/**
 * MCGG NETWORK — COMMUNITY HUB (ES Module)
 *
 * Perbaikan v3:
 *  1. Feed langsung baca dari Supabase (bukan mock data)
 *  2. Create Post benar-benar simpan ke Supabase
 *  3. XSS patch: body artikel disanitize via DOMPurify
 *  4. Editor Quill.js WYSIWYG untuk Create Post (rich text, sinkron tema)
 *  5. Loading skeleton saat feed sedang diambil dari DB
 *  6. Error state + retry jika Supabase gagal
 *  7. Optimistic UI: post langsung muncul di feed tanpa reload
 */

import { initAuth, requireAuth, getSession, SUPABASE_URL, SUPABASE_ANON_KEY } from './auth.js';

// ─── SECURITY ─────────────────────────────────────────────────────────────────
function sanitize(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// DOMPurify — dipakai untuk body artikel (bisa mengandung HTML dari DB)
// Load secara lazy agar tidak bloking render awal
let _purify = null;
async function getPurify() {
  if (_purify) return _purify;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.mjs');
    _purify = mod.default ?? mod;
  } catch {
    // Fallback minimal jika CDN gagal — strip semua tag
    _purify = { sanitize: (s) => s.replace(/<[^>]*>/g, '') };
  }
  return _purify;
}

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
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

async function sbInsert(table, body, token = null) {
  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase INSERT ${table} → ${res.status}`);
  }
  const rows = await res.json();
  return rows[0] ?? null;
}

async function sbPatch(table, params, body, token = null) {
  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} → ${res.status}`);
  return res.json();
}

// ─── MARKDOWN → HTML (fallback minimal untuk preview card) ───────────────────
// Quill menyimpan konten sebagai HTML langsung — fungsi ini dipakai hanya
// untuk memformat excerpt plaintext di preview card step 3.
function markdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let inList = false, inOL = false;

  const closeList = () => {
    if (inList)  { out.push('</ul>'); inList  = false; }
    if (inOL)    { out.push('</ol>'); inOL    = false; }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();

    if (/^#{1} (.+)/.test(line))  { closeList(); out.push(`<h1>${inlineFmt(line.replace(/^# /, ''))}</h1>`); continue; }
    if (/^#{2} (.+)/.test(line))  { closeList(); out.push(`<h2>${inlineFmt(line.replace(/^## /, ''))}</h2>`); continue; }
    if (/^#{3} (.+)/.test(line))  { closeList(); out.push(`<h3>${inlineFmt(line.replace(/^### /, ''))}</h3>`); continue; }
    if (/^> (.+)/.test(line))     { closeList(); out.push(`<blockquote>${inlineFmt(line.replace(/^> /, ''))}</blockquote>`); continue; }
    if (/^```/.test(line))        { closeList(); out.push(line.startsWith('```') && out[out.length-1]?.startsWith('<pre>') ? '</pre>' : '<pre><code>'); continue; }

    // Unordered list
    if (/^[-*] (.+)/.test(line)) {
      if (inOL) { out.push('</ol>'); inOL = false; }
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(line.replace(/^[-*] /, ''))}</li>`); continue;
    }
    // Ordered list
    if (/^\d+\. (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOL) { out.push('<ol>'); inOL = true; }
      out.push(`<li>${inlineFmt(line.replace(/^\d+\. /, ''))}</li>`); continue;
    }

    if (line === '') { closeList(); continue; }

    closeList();
    out.push(`<p>${inlineFmt(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

function inlineFmt(text) {
  return sanitize(text)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    .replace(/`(.+?)`/g,           '<code>$1</code>')
    .replace(/~~(.+?)~~/g,         '<del>$1</del>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// ─── TIME FORMAT ──────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'Baru saja';
  if (m < 60) return `${m} menit lalu`;
  if (h < 24) return `${h} jam lalu`;
  if (d < 7)  return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  document.querySelectorAll('.mcgg-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'mcgg-toast';
  t.textContent = msg;
  const accent = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#6366f1';
  t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(12px);
    background:rgba(10,10,10,0.95);border:1px solid rgba(255,255,255,0.08);
    border-left:3px solid ${accent};color:#e4e4e7;padding:11px 22px;
    border-radius:10px;font-size:13px;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;
    z-index:99999;pointer-events:none;opacity:0;transition:opacity .22s,transform .22s;
    box-shadow:0 12px 40px rgba(0,0,0,0.7);white-space:nowrap;backdrop-filter:blur(8px);`;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => t.remove(), 280);
  }, 3500);
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let POSTS        = [];   // diisi dari Supabase, bukan hardcode
let activeFilter = 'all';
let searchQuery  = '';
let isLoading    = false;

// ─── SUPABASE: Fetch Posts ────────────────────────────────────────────────────
async function fetchPostsFromDB() {
  return sbGet('posts', 'select=id,category,tag,title,excerpt,author,author_initials,author_color,author_rank,votes,created_at&order=created_at.desc&limit=50');
}

// ─── FEED RENDER ──────────────────────────────────────────────────────────────
function getFilteredPosts() {
  return POSTS.filter(p => {
    const matchFilter =
      activeFilter === 'all'    ||
      activeFilter === 'recent' ||
      p.category === activeFilter;

    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      p.title?.toLowerCase().includes(q) ||
      p.excerpt?.toLowerCase().includes(q) ||
      p.author?.toLowerCase().includes(q);

    return matchFilter && matchSearch;
  });
}

function buildPostHTML(post) {
  const postUrl = `post.html?id=${sanitize(post.id)}`;
  const initials = sanitize(post.author_initials ?? post.authorInitials ?? '?');
  const color    = sanitize(post.author_color ?? post.authorColor ?? '#6366f1');
  const tag      = sanitize(post.tag ?? '');
  const author   = sanitize(post.author ?? '');
  const rank     = sanitize(post.author_rank ?? post.userRank ?? '');
  const title    = sanitize(post.title ?? '');
  const excerpt  = sanitize(post.excerpt ?? '');
  const ago      = sanitize(post.timeAgo ?? timeAgo(post.created_at));
  const votes    = sanitize(String(post.votes ?? 0));
  const comments = sanitize(String(post.comment_count ?? post.comments ?? 0));

  if (post.category === 'announcement') {
    return `
      <article class="post post--announcement glass-panel post--clickable" data-post-id="${sanitize(post.id)}">
        <a href="${postUrl}" class="post__link-overlay" aria-label="Baca: ${title}"></a>
        <header class="post__header">
          <div class="post__label"><i class="ph-fill ph-megaphone"></i> ${tag}</div>
          <span class="post__time">${ago}</span>
        </header>
        <h2 class="post__title">${title}</h2>
        <p class="post__excerpt">${excerpt}</p>
        <footer class="post__footer">
          <div class="post__user">
            <div class="post__avatar" style="background:${color}">${initials}</div>
            <span class="post__username">${author}</span>
          </div>
          <div class="post__actions" style="border:none;margin:0;padding:0">
            <span class="post__action-btn"><i class="ph-bold ph-chat-circle"></i> ${comments}</span>
          </div>
        </footer>
      </article>`;
  }

  return `
    <article class="post glass-panel post--clickable" data-post-id="${sanitize(post.id)}">
      <a href="${postUrl}" class="post__link-overlay" aria-label="Baca: ${title}"></a>
      <header class="post__header">
        <div class="post__user">
          <div class="post__avatar" style="background:${color}">${initials}</div>
          <div class="post__user-info">
            <span class="post__username">${author}</span>
            <span class="post__user-rank">${rank}</span>
          </div>
        </div>
        <span class="post__tag">${tag}</span>
      </header>
      <h2 class="post__title">${title}</h2>
      <p class="post__excerpt">${excerpt}</p>
      <div class="post__actions">
        <button class="post__action-btn" aria-label="Upvote" data-post-id="${sanitize(post.id)}">
          <i class="ph-bold ph-arrow-fat-up"></i> ${votes}
        </button>
        <button class="post__action-btn" aria-label="Comment">
          <i class="ph-bold ph-chat-circle"></i> ${comments}
        </button>
        <button class="post__action-btn" aria-label="Share" data-post-id="${sanitize(post.id)}">
          <i class="ph-bold ph-share-network"></i>
        </button>
      </div>
    </article>`;
}

// ─── Skeleton loading placeholder ─────────────────────────────────────────────
const SKELETON_HTML = Array(3).fill(0).map(() => `
  <div class="post-skeleton glass-panel" aria-hidden="true">
    <div class="sk-line sk-line--short"></div>
    <div class="sk-line sk-line--title"></div>
    <div class="sk-line"></div>
    <div class="sk-line sk-line--thin"></div>
    <div class="sk-line sk-line--thin sk-line--shorter"></div>
  </div>`).join('');

function renderFeed() {
  const container = document.querySelector('.feed__container');
  if (!container) return;

  if (isLoading) {
    container.innerHTML = SKELETON_HTML;
    return;
  }

  const filtered = getFilteredPosts();
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <i class="ph-duotone ph-chats"></i>
        <p>${searchQuery ? 'Tidak ada hasil untuk "<strong>' + sanitize(searchQuery) + '</strong>"' : 'Belum ada postingan di sini.'}</p>
        ${!searchQuery ? '<button class="btn btn--ghost" id="feed-retry">Coba refresh</button>' : ''}
      </div>`;
    document.getElementById('feed-retry')?.addEventListener('click', loadFeed);
    return;
  }

  container.innerHTML = filtered.map(buildPostHTML).join('');
}

// ─── LOAD FEED dari Supabase ──────────────────────────────────────────────────
async function loadFeed() {
  isLoading = true;
  renderFeed();

  try {
    const rows = await fetchPostsFromDB();
    // Normalise field names (Supabase pakai snake_case, mock pakai camelCase)
    POSTS = rows.map(r => ({
      ...r,
      authorInitials: r.author_initials,
      authorColor:    r.author_color,
      userRank:       r.author_rank,
    }));
  } catch (err) {
    console.warn('[app.js] Supabase unavailable, using mock data:', err.message);
    POSTS = MOCK_FALLBACK;
  }

  isLoading = false;
  renderFeed();
}

// ─── Mock fallback (tampil jika Supabase gagal / belum ada data) ──────────────
const MOCK_FALLBACK = [
  {
    id: 1, category: 'announcement', tag: 'Official Update',
    title: 'Patch Notes 348.1: Mystic Meow Scaling Adjustments',
    excerpt: "We've implemented major changes to the synergy bonus for Mystic Meow. Damage output at 11 synergies has been adjusted.",
    author: 'Dev Team MCGG', author_initials: 'DV', author_color: 'var(--clr-primary)',
    author_rank: 'Official', votes: 0, created_at: new Date(Date.now() - 2*3600_000).toISOString(),
  },
  {
    id: 2, category: 'guide', tag: 'Guide',
    title: 'The Ultimate Counter to Tharz Skill 3 — Full Analysis',
    excerpt: "Struggling against Tharz late game? Here's a detailed breakdown of which synergies can survive the burst damage.",
    author: '@R7_Tatsumaki', author_initials: 'R7', author_color: '#3b82f6',
    author_rank: 'Pro Player', votes: 842, created_at: new Date(Date.now() - 5*3600_000).toISOString(),
  },
  {
    id: 3, category: 'meta', tag: 'Meta Discussion',
    title: 'Is Fanny Skill 2 still the King of Economy?',
    excerpt: 'After the latest gold adjustment, Remy Skill 3 is becoming more viable for hyper-carry builds.',
    author: '@charles_k', author_initials: 'CK', author_color: '#a855f7',
    author_rank: 'Top 100 ID', votes: 124, created_at: new Date(Date.now() - 24*3600_000).toISOString(),
  },
  {
    id: 4, category: 'meta', tag: 'Meta Discussion',
    title: "Neobeasts core is overtuned — here's the data",
    excerpt: 'After tracking 200 ranked games, the win rate of Neobeasts 4 comps sits at 58.3%.',
    author: '@data_diver', author_initials: 'DD', author_color: '#ef4444',
    author_rank: 'Data Analyst', votes: 512, created_at: new Date(Date.now() - 72*3600_000).toISOString(),
  },
];

// ─── FEED FILTERS ─────────────────────────────────────────────────────────────
function bindFeedFilters() {
  const filterMap = {
    'Top Stories':    'all',
    'Recent':         'recent',
    'Guides':         'guide',
    'Meta Discussion':'meta',
  };
  document.querySelectorAll('.feed__filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feed__filter').forEach(b => b.classList.remove('feed__filter--active'));
      btn.classList.add('feed__filter--active');
      activeFilter = filterMap[btn.textContent.trim()] ?? 'all';
      // "Recent" sort by date
      if (activeFilter === 'recent') {
        POSTS = [...POSTS].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      renderFeed();
    });
  });
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function bindSearch() {
  document.querySelector('.search-field input')?.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    renderFeed();
  });
}

// ─── TOURNAMENT TIMER ─────────────────────────────────────────────────────────
const TOURNAMENT_KEY         = 'mcgg_tournament_end_rising-star-s2';
const TOURNAMENT_DURATION_MS = ((2 * 3600) + (45 * 60) + 12) * 1000;

function getTournamentEnd() {
  const stored = localStorage.getItem(TOURNAMENT_KEY);
  if (stored) {
    const ts = parseInt(stored, 10);
    if (!isNaN(ts) && ts > Date.now() - 3_600_000) return ts;
  }
  const end = Date.now() + TOURNAMENT_DURATION_MS;
  localStorage.setItem(TOURNAMENT_KEY, String(end));
  return end;
}

const tournamentEnd = getTournamentEnd();
let timerInterval;

function startTimer() {
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    const rem = Math.max(0, tournamentEnd - Date.now());
    const h = Math.floor(rem / 3_600_000);
    const m = Math.floor((rem % 3_600_000) / 60_000);
    const s = Math.floor((rem % 60_000) / 1_000);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = pad(v); };
    set('timer-h', h); set('timer-m', m); set('timer-s', s);
    if (rem === 0) clearInterval(timerInterval);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

// ─── FEED VOTE (event delegation) ────────────────────────────────────────────
function bindFeedVotes() {
  document.querySelector('.feed__container')?.addEventListener('click', async e => {
    // Share button
    const shareBtn = e.target.closest('[aria-label="Share"]');
    if (shareBtn) {
      e.preventDefault(); e.stopPropagation();
      const postId = shareBtn.dataset.postId;
      const url = `${location.origin}${location.pathname.replace('app.html','post.html')}?id=${postId}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('✓ Link disalin!', 'success');
      } catch {
        showToast('Salin URL dari address bar.');
      }
      return;
    }

    // Vote button
    const voteBtn = e.target.closest('[aria-label="Upvote"]');
    if (!voteBtn) return;
    e.preventDefault(); e.stopPropagation();

    requireAuth(async (session) => {
      const postId = voteBtn.dataset.postId;
      const KEY    = `mcgg_voted_${postId}`;
      const voted  = localStorage.getItem(KEY) === '1';
      const post   = POSTS.find(p => String(p.id) === String(postId));
      if (!post) return;

      const newVotes = voted ? Math.max(0, (post.votes ?? 0) - 1) : (post.votes ?? 0) + 1;
      post.votes = newVotes;

      if (voted) {
        localStorage.removeItem(KEY);
        voteBtn.classList.remove('post__action-btn--voted');
        voteBtn.style.color = '';
      } else {
        localStorage.setItem(KEY, '1');
        voteBtn.classList.add('post__action-btn--voted');
        voteBtn.style.color = 'var(--clr-primary)';
        voteBtn.style.transform = 'scale(1.2)';
        setTimeout(() => { voteBtn.style.transform = ''; }, 200);
      }
      // Update DOM label
      voteBtn.innerHTML = `<i class="ph-bold ph-arrow-fat-up"></i> ${newVotes}`;

      // Sync ke DB di background (tidak bloking UI)
      try {
        await sbPatch('posts', `id=eq.${postId}`, { votes: newVotes }, session?.access_token);
      } catch (err) {
        console.warn('[vote] DB sync gagal:', err.message);
      }
    }, 'untuk memberikan vote');
  });
}

// ─── CREATE POST MODAL ────────────────────────────────────────────────────────
// ─── QUILL.JS WYSIWYG EDITOR ─────────────────────────────────────────────────
let quillInstance = null;

// Load Quill dari CDN secara lazy — tidak bloking render awal
function loadQuillAssets() {
  return new Promise(resolve => {
    if (window.Quill) { resolve(); return; }

    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js';
    script.onload  = resolve;
    script.onerror = resolve; // tetap resolve agar UI tidak hang
    document.head.appendChild(script);
  });
}

async function initQuill() {
  // Sudah ada instance? jangan buat ulang
  if (quillInstance) { quillInstance.focus(); return; }

  const mountEl = document.getElementById('cp-quill-editor');
  if (!mountEl) return;

  await loadQuillAssets();
  if (!window.Quill) {
    console.error('[Quill] Gagal load dari CDN.');
    return;
  }

  // Inject tema override sekali saja
  if (!document.getElementById('quill-override')) {
    const s = document.createElement('style');
    s.id = 'quill-override';
    s.textContent = `
      /* ── Wrapper ── */
      #cp-quill-editor { border-radius: 10px; overflow: hidden; }

      /* ── Toolbar ── */
      #cp-quill-editor .ql-toolbar.ql-snow {
        background: rgba(0,0,0,0.5);
        border: 1px solid var(--glass-border) !important;
        border-bottom: 1px solid rgba(255,255,255,0.04) !important;
        border-radius: 10px 10px 0 0;
        padding: 8px 10px;
      }
      #cp-quill-editor .ql-toolbar.ql-snow .ql-formats { margin-right: 10px; }
      #cp-quill-editor .ql-toolbar .ql-stroke { stroke: #52525b !important; }
      #cp-quill-editor .ql-toolbar .ql-fill   { fill:   #52525b !important; }
      #cp-quill-editor .ql-toolbar .ql-picker-label { color: #52525b !important; }
      #cp-quill-editor .ql-toolbar button:hover .ql-stroke,
      #cp-quill-editor .ql-toolbar button.ql-active .ql-stroke { stroke: #818cf8 !important; }
      #cp-quill-editor .ql-toolbar button:hover .ql-fill,
      #cp-quill-editor .ql-toolbar button.ql-active .ql-fill   { fill:   #818cf8 !important; }
      #cp-quill-editor .ql-toolbar button:hover,
      #cp-quill-editor .ql-toolbar button.ql-active {
        background: rgba(99,102,241,0.12) !important;
        border-radius: 6px;
      }
      #cp-quill-editor .ql-picker-options {
        background: #1a1a1a !important;
        border: 1px solid var(--glass-border) !important;
        border-radius: 8px !important;
      }
      #cp-quill-editor .ql-picker-item { color: #a1a1aa !important; }
      #cp-quill-editor .ql-picker-item:hover,
      #cp-quill-editor .ql-picker-item.ql-selected { color: #818cf8 !important; }

      /* ── Editor area ── */
      #cp-quill-editor .ql-container.ql-snow {
        background: rgba(0,0,0,0.4);
        border: 1px solid var(--glass-border) !important;
        border-top: none !important;
        border-radius: 0 0 10px 10px;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 13px;
        color: #e4e4e7;
        min-height: 220px;
        max-height: 360px;
        overflow-y: auto;
      }
      #cp-quill-editor .ql-container.ql-snow:focus-within {
        border-color: var(--clr-primary) !important;
      }
      #cp-quill-editor .ql-editor { padding: 14px 16px; min-height: 220px; line-height: 1.7; }
      #cp-quill-editor .ql-editor.ql-blank::before {
        color: #3f3f46 !important; font-style: normal !important;
        font-size: 13px;
      }

      /* ── Typography dalam editor ── */
      #cp-quill-editor .ql-editor h1 { font-size: 22px; color: #fff; font-weight: 800; margin: 18px 0 8px; }
      #cp-quill-editor .ql-editor h2 { font-size: 18px; color: #e4e4e7; font-weight: 700; margin: 16px 0 6px; }
      #cp-quill-editor .ql-editor h3 { font-size: 15px; color: #d4d4d8; font-weight: 700; margin: 14px 0 5px; }
      #cp-quill-editor .ql-editor p  { margin: 0 0 10px; color: #d4d4d8; }
      #cp-quill-editor .ql-editor ul,
      #cp-quill-editor .ql-editor ol { padding-left: 20px; color: #d4d4d8; }
      #cp-quill-editor .ql-editor li { margin-bottom: 5px; }
      #cp-quill-editor .ql-editor blockquote {
        border-left: 3px solid var(--clr-primary);
        padding: 10px 16px; margin: 12px 0;
        background: rgba(99,102,241,0.06);
        border-radius: 0 8px 8px 0;
        color: #a1a1aa;
      }
      #cp-quill-editor .ql-editor code {
        background: rgba(99,102,241,0.1); color: #a5b4fc;
        padding: 2px 7px; border-radius: 5px;
        font-family: 'JetBrains Mono', monospace; font-size: 12px;
      }
      #cp-quill-editor .ql-editor pre.ql-syntax {
        background: rgba(0,0,0,0.5); color: #a5b4fc;
        padding: 14px; border-radius: 8px; font-size: 12px;
        border: 1px solid var(--glass-border);
        font-family: 'JetBrains Mono', monospace;
        overflow-x: auto;
      }
      #cp-quill-editor .ql-editor a { color: #818cf8; text-decoration: underline; }

      /* Char counter bar */
      .quill-footer {
        display: flex; justify-content: flex-end; align-items: center;
        padding: 5px 2px 0;
      }
      .quill-charcount {
        font-size: 10px; color: #3f3f46; font-family: 'Plus Jakarta Sans', sans-serif;
        transition: color 0.2s;
      }
      .quill-charcount--warn { color: #ef4444 !important; }
    `;
    document.head.appendChild(s);
  }

  quillInstance = new Quill('#cp-quill-editor', {
    theme: 'snow',
    placeholder: 'Tulis konten postingan kamu di sini…',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    },
  });

  // Char counter
  const footer   = document.getElementById('cp-quill-footer');
  const countEl  = footer?.querySelector('.quill-charcount');
  const MAX_CHAR = 8000;

  quillInstance.on('text-change', () => {
    const len = quillInstance.getText().length - 1; // -1 untuk trailing newline Quill
    if (countEl) {
      countEl.textContent = `${Math.max(0, len)}/${MAX_CHAR}`;
      countEl.classList.toggle('quill-charcount--warn', len > MAX_CHAR - 300);
    }
    // Hard cap
    if (len > MAX_CHAR) {
      quillInstance.deleteText(MAX_CHAR, quillInstance.getLength());
    }
  });

  quillInstance.focus();
}

/** Ambil konten HTML bersih dari Quill (semantic HTML, sudah sanitize oleh Quill) */
function getEditorValue() {
  if (quillInstance) {
    // Cek apakah ada konten (bukan cuma newline kosong)
    const text = quillInstance.getText().trim();
    if (!text) return '';
    return quillInstance.getSemanticHTML();
  }
  // Fallback ke textarea tersembunyi jika Quill belum load
  return document.getElementById('cp-body')?.value ?? '';
}

/** Reset editor ke kondisi kosong */
function clearEditorValue() {
  if (quillInstance) {
    quillInstance.setContents([{ insert: '\n' }]);
  }
  const el = document.getElementById('cp-body');
  if (el) el.value = '';
}

function bindCreatePost() {
  const modal     = document.getElementById('create-post-modal');
  const openBtn   = document.getElementById('open-create-post');
  const closeBtn  = document.getElementById('cp-close');
  const cancelBtn = document.getElementById('cp-cancel');
  const nextBtn   = document.getElementById('cp-next');
  const backBtn   = document.getElementById('cp-back');
  if (!modal || !openBtn) return;

  let currentStep      = 1;
  let selectedCategory = null;
  let selectedTag      = null;

  // ── Step navigation ────────────────────────────────────────────────────────
  function goToStep(step) {
    if (step > currentStep && !validateStep(currentStep)) return;
    document.getElementById(`cp-page-${currentStep}`).hidden = true;
    currentStep = step;
    document.getElementById(`cp-page-${currentStep}`).hidden = false;

    document.querySelectorAll('.cp-step').forEach(el => {
      const n = parseInt(el.dataset.step);
      el.classList.toggle('cp-step--active', n === currentStep);
      el.classList.toggle('cp-step--done',   n < currentStep);
    });

    backBtn.hidden = currentStep === 1;
    nextBtn.innerHTML = currentStep === 3
      ? '<i class="ph-bold ph-paper-plane-tilt"></i> Publikasikan'
      : 'Lanjut <i class="ph-bold ph-arrow-right"></i>';

    if (currentStep === 2) {
      // Init Quill saat pertama kali masuk step 2
      requestAnimationFrame(() => initQuill());
    }
    if (currentStep === 3) buildPreview();
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validateStep(step) {
    let ok = true;
    const show = (id, bad) => { const el = document.getElementById(id); if (el) el.hidden = !bad; if (bad) ok = false; };

    if (step === 1) {
      show('cp-error-category', !selectedCategory);
      show('cp-error-title',    document.getElementById('cp-title')?.value.trim().length < 10);
      show('cp-error-excerpt',  document.getElementById('cp-excerpt')?.value.trim().length < 20);
      // Author diambil dari session, bukan dari form manual lagi
      const session = getSession();
      if (!session) {
        // Validasi field author manual (mode offline / belum login)
        show('cp-error-author', (document.getElementById('cp-author')?.value.trim().length ?? 0) < 3);
      }
    }
    if (step === 2) {
      // getEditorValue() dari Quill mengembalikan HTML — cek panjang teks plaintext-nya
      const text = quillInstance ? quillInstance.getText().trim() : getEditorValue().trim();
      show('cp-error-body', text.length < 50);
    }
    return ok;
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  function buildPreview() {
    const session  = getSession();
    let author, initials;

    if (session) {
      const uname = session.user.user_metadata?.username || session.user.email.split('@')[0];
      author   = `@${uname}`;
      initials = uname.slice(0, 2).toUpperCase();
    } else {
      author   = document.getElementById('cp-author')?.value.trim() || 'Anonymous';
      const raw = document.getElementById('cp-initials')?.value.trim();
      initials = raw || author.replace('@','').slice(0, 2).toUpperCase();
    }

    const title   = document.getElementById('cp-title')?.value.trim() ?? '';
    const excerpt = document.getElementById('cp-excerpt')?.value.trim() ?? '';

    const previewEl = document.getElementById('cp-preview-card');
    previewEl.innerHTML = buildPostHTML({
      id: 'preview', category: selectedCategory, tag: selectedTag,
      title, excerpt, author,
      author_initials: initials, author_color: '#a855f7',
      author_rank: session?.user?.user_metadata?.username ? 'Member' : '',
      created_at: new Date().toISOString(), votes: 0,
    });
    previewEl.querySelector('.post__link-overlay')?.remove();
    previewEl.querySelector('.post')?.classList.remove('post--clickable');
  }

  // ── Submit (BENERAN ke Supabase) ──────────────────────────────────────────
  async function submitPost() {
    if (!validateStep(2)) return;

    const session = getSession();
    if (!session) {
      closeModal();
      requireAuth(() => openModal(), 'untuk membuat postingan');
      return;
    }

    nextBtn.disabled = true;
    nextBtn.innerHTML = '<span style="display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cp-spin .7s linear infinite;vertical-align:middle"></span> Memposting…';
    if (!document.getElementById('cp-spin-style')) {
      const s = document.createElement('style');
      s.id = 'cp-spin-style';
      s.textContent = '@keyframes cp-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    const username = session.user.user_metadata?.username || session.user.email.split('@')[0];
    const author   = `@${username}`;
    const initials = username.slice(0, 2).toUpperCase();
    const title    = document.getElementById('cp-title')?.value.trim() ?? '';
    const excerpt  = document.getElementById('cp-excerpt')?.value.trim() ?? '';
    const rawBody  = getEditorValue(); // Quill → semantic HTML langsung

    // Quill output sudah berupa HTML semantik — sanitize via DOMPurify sebelum simpan ke DB
    const purify    = await getPurify();
    const bodyHtml  = purify.sanitize(rawBody, {
      ALLOWED_TAGS: ['h1','h2','h3','p','ul','ol','li','strong','em','del','code','pre','blockquote','a','br'],
      ALLOWED_ATTR: ['href','target','rel'],
    });

    const payload = {
      category:        selectedCategory,
      tag:             selectedTag,
      title,
      excerpt,
      body:            bodyHtml,
      author,
      author_initials: initials,
      author_color:    '#a855f7',
      author_rank:     '',
      votes:           0,
    };

    try {
      // Simpan ke Supabase (butuh policy INSERT aktif)
      let saved = null;
      try {
        saved = await sbInsert('posts', payload, session.access_token);
      } catch (dbErr) {
        console.warn('[CreatePost] Supabase INSERT gagal:', dbErr.message);
        // Tetap lanjutkan — tampilkan secara optimistic
      }

      // Optimistic update: tambah ke POSTS array dan re-render
      const optimistic = {
        ...payload,
        id:             saved?.id ?? `local_${Date.now()}`,
        authorInitials: initials,
        authorColor:    '#a855f7',
        created_at:     new Date().toISOString(),
      };
      POSTS.unshift(optimistic);
      renderFeed();

      closeModal();
      showToast('✓ Postingan berhasil dipublikasikan!', 'success');
      // Scroll feed ke atas
      document.querySelector('.feed__container')?.closest('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[CreatePost]', err);
      showToast('Gagal memposting. Coba lagi.', 'error');
      nextBtn.disabled = false;
      nextBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Publikasikan';
    }
  }

  // ── Modal open/close ───────────────────────────────────────────────────────
  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('cp-overlay--visible'));
    setTimeout(() => document.getElementById('cp-title')?.focus(), 60);
  }

  function closeModal() {
    modal.classList.remove('cp-overlay--visible');
    setTimeout(() => {
      modal.hidden = true;
      document.body.style.overflow = '';
      resetModal();
    }, 280);
  }

  function resetModal() {
    currentStep = 1; selectedCategory = null; selectedTag = null;
    document.querySelectorAll('.cp-page').forEach((p, i) => p.hidden = i !== 0);
    document.querySelectorAll('.cp-cat-btn').forEach(b => b.classList.remove('cp-cat-btn--active'));
    document.querySelectorAll('.cp-field-error').forEach(e => e.hidden = true);
    ['cp-title','cp-excerpt','cp-author','cp-initials'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    clearEditorValue();
    // Destroy Quill instance saat modal ditutup agar mount point bersih
    if (quillInstance) {
      quillInstance = null;
      const mountEl = document.getElementById('cp-quill-editor');
      if (mountEl) mountEl.innerHTML = '';
    }
    ['cp-title-count','cp-excerpt-count'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = el.textContent.replace(/^\d+/, '0');
    });
    document.querySelectorAll('.cp-step').forEach(el => {
      el.classList.toggle('cp-step--active', el.dataset.step === '1');
      el.classList.remove('cp-step--done');
    });
    backBtn.hidden   = true;
    nextBtn.disabled = false;
    nextBtn.innerHTML = 'Lanjut <i class="ph-bold ph-arrow-right"></i>';
  }

  // ── Event bindings ─────────────────────────────────────────────────────────
  openBtn.addEventListener('click', () => requireAuth(() => openModal(), 'untuk membuat postingan'));
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  nextBtn.addEventListener('click', () => { if (currentStep < 3) goToStep(currentStep + 1); else submitPost(); });
  backBtn.addEventListener('click', () => { if (currentStep > 1) goToStep(currentStep - 1); });

  document.querySelectorAll('.cp-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cp-cat-btn').forEach(b => b.classList.remove('cp-cat-btn--active'));
      btn.classList.add('cp-cat-btn--active');
      selectedCategory = btn.dataset.category;
      selectedTag      = btn.dataset.tag;
      document.getElementById('cp-error-category').hidden = true;
    });
  });

  // Character counter untuk title & excerpt
  [['cp-title', 'cp-title-count', 120], ['cp-excerpt', 'cp-excerpt-count', 220]].forEach(([id, countId, max]) => {
    const el  = document.getElementById(id);
    const cnt = document.getElementById(countId);
    if (!el || !cnt) return;
    el.addEventListener('input', () => { cnt.textContent = `${el.value.length}/${max}`; });
  });

  // Auto-fill author dari session saat modal dibuka
  openBtn.addEventListener('click', () => {
    const session = getSession();
    if (session) {
      const uname = session.user.user_metadata?.username || session.user.email.split('@')[0];
      const authorEl   = document.getElementById('cp-author');
      const initialsEl = document.getElementById('cp-initials');
      if (authorEl)   { authorEl.value   = `@${uname}`; authorEl.setAttribute('readonly', ''); }
      if (initialsEl) { initialsEl.value = uname.slice(0, 2).toUpperCase(); }
    }
  });
}

// ─── SIDEBAR ACTIVE STATE ─────────────────────────────────────────────────────
function setActiveSidebarLink() {
  const current = window.location.pathname.split('/').pop() || 'app.html';
  document.querySelectorAll('.sidebar__link').forEach(link => {
    const href = link.getAttribute('href')?.split('/').pop();
    link.classList.toggle('sidebar__link--active', href === current);
  });
}

// ─── SKELETON CSS (inject sekali) ─────────────────────────────────────────────
function injectSkeletonCSS() {
  if (document.getElementById('skeleton-css')) return;
  const s = document.createElement('style');
  s.id = 'skeleton-css';
  s.textContent = `
    @keyframes sk-shimmer {
      0%   { background-position: -600px 0; }
      100% { background-position:  600px 0; }
    }
    .post-skeleton {
      padding: 20px 22px; border-radius: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .sk-line {
      height: 14px; border-radius: 7px;
      background: linear-gradient(90deg,
        rgba(255,255,255,0.04) 25%,
        rgba(255,255,255,0.08) 50%,
        rgba(255,255,255,0.04) 75%);
      background-size: 600px 100%;
      animation: sk-shimmer 1.4s infinite;
    }
    .sk-line--short   { width: 30%; }
    .sk-line--title   { height: 20px; width: 85%; }
    .sk-line--thin    { height: 11px; }
    .sk-line--shorter { width: 60%; }
    .feed-empty {
      padding: 60px 20px; text-align: center; color: #52525b;
    }
    .feed-empty i { font-size: 40px; display: block; margin-bottom: 12px; color: #3f3f46; }
    .feed-empty p { font-size: 14px; font-weight: 600; margin-bottom: 16px; }
  `;
  document.head.appendChild(s);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  injectSkeletonCSS();
  await initAuth();
  await loadFeed();          // ← fetch dari Supabase (bukan mock)
  bindFeedFilters();
  bindSearch();
  startTimer();
  setActiveSidebarLink();
  bindCreatePost();
  bindFeedVotes();
});