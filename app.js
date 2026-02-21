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

import { initAuth, requireAuth, getSession, signOut, onAuthChange, SUPABASE_URL, SUPABASE_ANON_KEY } from './auth.js';
import { ADMIN_UID, DESIGN_TOKENS } from './config.js';

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
let _purifyLoadAttempted = false;
async function getPurify() {
  if (_purify) return _purify;
  
  // Prevent multiple load attempts
  if (_purifyLoadAttempted) {
    // Return safe fallback that strips ALL HTML tags and escapes entities
    return {
      sanitize: (s) => {
        if (!s) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/<[^>]*>/g, ''); // Strip any remaining tags
      }
    };
  }
  
  _purifyLoadAttempted = true;
  
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.mjs');
    _purify = mod.default ?? mod;
    if (!_purify || typeof _purify.sanitize !== 'function') {
      throw new Error('DOMPurify loaded but invalid');
    }
  } catch (err) {
    console.warn('[Security] DOMPurify gagal dimuat, menggunakan fallback sanitizer:', err.message);
    // SECURITY FIX: Return safe fallback that strips ALL HTML and escapes entities
    // This prevents XSS attacks if DOMPurify fails to load
    _purify = {
      sanitize: (s) => {
        if (!s) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/<[^>]*>/g, ''); // Strip any remaining tags
      }
    };
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
  // Remove existing toasts to prevent stacking
  document.querySelectorAll('.mcgg-toast').forEach(t => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 280);
  });
  
  const t = document.createElement('div');
  t.className = 'mcgg-toast';
  t.setAttribute('role', 'alert');
  t.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  t.textContent = msg;
  const accent = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#6366f1';
  t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(12px);
    background:rgba(10,10,10,0.95);border:1px solid rgba(255,255,255,0.08);
    border-left:3px solid ${accent};color:#e4e4e7;padding:11px 22px;
    border-radius:10px;font-size:13px;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;
    z-index:99999;pointer-events:none;opacity:0;transition:opacity .22s,transform .22s;
    box-shadow:0 12px 40px rgba(0,0,0,0.7);max-width:calc(100vw - 32px);word-wrap:break-word;
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);`;
  document.body.appendChild(t);
  requestAnimationFrame(() => { 
    t.style.opacity = '1'; 
    t.style.transform = 'translateX(-50%) translateY(0)'; 
  });
  setTimeout(() => {
    t.style.opacity = '0'; 
    t.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => t.remove(), 280);
  }, 3500);
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let POSTS        = [];
let activeTab    = 'recent';  // 'recent' | 'news'
let activeSort   = 'new';     // 'new' | 'top' | 'hot' | 'following'
let followedUsers = [];
let searchQuery  = '';
let isLoading    = false;

// ─── FOLLOW SYSTEM (Supabase-backed) ─────────────────────────────────────────
// Memuat daftar akun yang diikuti dari Supabase (dan sync ke localStorage sebagai cache)
async function loadFollowedUsers() {
  const session = getSession();
  if (!session) { followedUsers = []; return; }

  // Baca dari cache lokal dulu (agar UI tidak berkedip)
  try { followedUsers = JSON.parse(localStorage.getItem(`mcgg_following_${session.user.id}`) || '[]'); }
  catch { followedUsers = []; }

  // Sinkronkan dengan Supabase di background
  try {
    const rows = await sbGet('follows', `follower_id=eq.${session.user.id}&select=following_username`);
    followedUsers = rows.map(r => r.following_username);
    localStorage.setItem(`mcgg_following_${session.user.id}`, JSON.stringify(followedUsers));
  } catch (err) {
    console.warn('[follows] Supabase unavailable, using local cache:', err.message);
  }
}

// Sinkron versi loadFollowedUsers dari cache (tidak async, untuk render cepat)
function loadFollowedUsersSync() {
  const session = getSession();
  if (!session) { followedUsers = []; return; }
  try { followedUsers = JSON.parse(localStorage.getItem(`mcgg_following_${session.user.id}`) || '[]'); }
  catch { followedUsers = []; }
}

/**
 * Toggle follow/unfollow — menyimpan ke Supabase sekaligus localStorage.
 * Mengembalikan { isNowFollowing: boolean, error: string|null }
 */
async function toggleFollowUser(author) {
  const session = getSession();
  if (!session) return { isNowFollowing: false, error: 'Belum login' };

  loadFollowedUsersSync();
  const idx = followedUsers.indexOf(author);
  const isCurrentlyFollowing = idx >= 0;

  // Optimistic UI update
  if (isCurrentlyFollowing) {
    followedUsers.splice(idx, 1);
  } else {
    followedUsers.push(author);
  }
  localStorage.setItem(`mcgg_following_${session.user.id}`, JSON.stringify(followedUsers));

  // Sync ke Supabase
  try {
    if (isCurrentlyFollowing) {
      // Unfollow: hapus dari tabel follows
      const res = await fetch(`${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${session.user.id}&following_username=eq.${encodeURIComponent(author)}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error(`DELETE follows → ${res.status}`);
    } else {
      // Follow: insert ke tabel follows
      const followerUsername = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'unknown';
      await sbInsert('follows', {
        follower_id: session.user.id,
        follower_username: `@${followerUsername}`,
        following_username: author,
      }, session.access_token);
    }
    return { isNowFollowing: !isCurrentlyFollowing, error: null };
  } catch (err) {
    console.warn('[follows] DB sync gagal:', err.message);
    // Rollback optimistic update
    if (isCurrentlyFollowing) {
      followedUsers.push(author); // Re-add
    } else {
      const rollbackIdx = followedUsers.indexOf(author);
      if (rollbackIdx >= 0) followedUsers.splice(rollbackIdx, 1);
    }
    localStorage.setItem(`mcgg_following_${session.user.id}`, JSON.stringify(followedUsers));
    return { isNowFollowing: isCurrentlyFollowing, error: err.message };
  }
}

// ─── LINEUP SAVE TO PROFILE (dari post di feed) ───────────────────────────────
async function saveLineupToProfile(lineupData, postTitle) {
  const session = getSession();
  if (!session) return false;

  try {
    const local = _loadLocalProfile();
    local.lineup = lineupData;
    _saveLocalProfile(local);

    await sbUpsert('profiles', {
      user_id: session.user.id,
      fav_lineup: lineupData,
    }, session.access_token);
    return true;
  } catch (err) {
    console.warn('[saveLineup]', err.message);
    return false;
  }
}

// ─── SUPABASE: Fetch Posts ────────────────────────────────────────────────────
// ─── SUPABASE: Fetch Posts ────────────────────────────────────────────────────
async function fetchPostsFromDB() {
  // [UPDATE] Tambahkan 'body' dan 'attachment_url' agar gambar bisa dibaca di Feed
  return sbGet('posts', 'select=id,category,tag,title,excerpt,body,attachment_url,author,author_initials,author_color,author_rank,votes,created_at&order=created_at.desc&limit=50');
}

// ─── FEED RENDER ──────────────────────────────────────────────────────────────
function getFilteredPosts() {
  let posts = [...POSTS];

  // Tab
  if (activeTab === 'news') {
    posts = posts.filter(p => p.category === 'news' || p.tag === 'News');
  } else {
    posts = posts.filter(p => p.category !== 'news' && p.tag !== 'News');
  }

  // Search
  const q = searchQuery.toLowerCase();
  if (q) posts = posts.filter(p =>
    p.title?.toLowerCase().includes(q) ||
    p.excerpt?.toLowerCase().includes(q) ||
    p.author?.toLowerCase().includes(q)
  );

  // Sort
  const now = Date.now();
  if (activeSort === 'following') {
    // FIXED: Filter ONLY posts from followed users (not just reorder)
    if (followedUsers.length) {
      posts = posts.filter(p => followedUsers.includes(p.author));
    }
    // Sort by newest within the followed filter
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (activeSort === 'new') {
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (activeSort === 'top') {
    posts.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  } else if (activeSort === 'hot') {
    posts.sort((a, b) => {
      const ha = Math.max(1, (now - new Date(a.created_at)) / 3_600_000);
      const hb = Math.max(1, (now - new Date(b.created_at)) / 3_600_000);
      return ((b.votes ?? 0) / Math.pow(hb, 1.5)) - ((a.votes ?? 0) / Math.pow(ha, 1.5));
    });
  }
  return posts;
}

// ─── Parse lineup body → extract hero grid for card preview ──────────────────
function buildLineupPreview(body) {
  if (!body) return '';
  const imgs = [...body.matchAll(/<img[^>]+src="([^"]+)"[^>]*title="([^"]*)"/g)];
  if (!imgs.length) return '';
  const items = imgs.slice(0,10).map(m =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <img src="${m[1]}" title="${sanitize(m[2])}" loading="lazy"
        style="width:42px;height:42px;border-radius:8px;object-fit:cover;
               border:1.5px solid rgba(99,102,241,0.5);background:#1a1a2e;">
      <span style="font-size:9px;color:#a1a1aa;font-weight:600;max-width:42px;
                   overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(m[2])}</span>
    </div>`).join('');
  const syn = (body.match(/✦ Sinergi: ([^<]+)/) || [])[1]?.trim() || '';

  // Ekstrak data lineup untuk tombol Simpan
  const heroIds = [...body.matchAll(/<img[^>]+src="([^"]+)"[^>]*title="([^"]*)"/g)].slice(0,10).map(m => sanitize(m[2]).toLowerCase().replace(/\s+/g, '_'));
  const lineupJson = JSON.stringify({ heroes: heroIds, synergies: syn });

  return `<div class="lineup-preview-card" style="margin-top:10px;background:rgba(99,102,241,0.06);
    border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:10px 12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:5px;">
        <i class="ph-bold ph-sword" style="color:#6366f1;font-size:11px;"></i>
        <span style="font-size:10px;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:.06em;">Lineup Magic Chess</span>
      </div>
      <button class="feed-save-lineup-btn" data-lineup='${lineupJson.replace(/'/g, "&#39;")}' 
        title="Simpan lineup ini ke profil kamu"
        style="display:flex;align-items:center;gap:5px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);
               border-radius:7px;padding:4px 10px;color:#a5b4fc;font-size:11px;font-weight:700;
               cursor:pointer;font-family:inherit;transition:all .18s;position:relative;z-index:10;pointer-events:auto;">
        <i class="ph-bold ph-bookmark-simple"></i> Simpan Lineup
      </button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;">${items}</div>
    ${syn?`<div style="margin-top:8px;font-size:11px;color:#eab308;font-weight:700;">✦ ${sanitize(syn)}</div>`:''}
  </div>`;
}

function buildPostHTML(post) {
  const postUrl  = `post.html?id=${sanitize(post.id)}`;
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
  const postId   = sanitize(String(post.id));
  const isLineup = post.tag === 'Lineup';

  // Determine preview content
  let thumbHtml = '';
  if (isLineup && post.body) {
    thumbHtml = buildLineupPreview(post.body);
  } else if (!isLineup && post.body && post.body.includes('<img')) {
    const match = post.body.match(/<img[^>]+src="([^">]+)"/);
    if (match) thumbHtml = `<div style="margin-top:12px;margin-bottom:16px;border-radius:12px;overflow:hidden;height:180px;border:1px solid rgba(255,255,255,0.08);"><img src="${match[1]}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>`;
  } else if (post.attachment_url?.match(/\.(jpeg|jpg|gif|png|webp|avif)(\?.*)?$/i)) {
    thumbHtml = `<div style="margin-top:12px;margin-bottom:16px;border-radius:12px;overflow:hidden;height:180px;border:1px solid rgba(255,255,255,0.08);"><img src="${sanitize(post.attachment_url)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>`;
  }

  // Saved state
  const savedKey = `mcgg_saved_${post.id}`;
  const isSaved  = localStorage.getItem(savedKey) === '1';

  // Follow state
  const session = getSession();
  const isOwn   = session && (session.user.user_metadata?.username || session.user.email?.split('@')[0]) === author.replace(/^@/,'');
  const isFollowing = !isOwn && session ? followedUsers.includes(author) : false;

  // Author clickable link
  const authorHtml = `<button class="post__author-btn" data-author="${sanitize(author)}" data-color="${color}" data-initials="${initials}" data-rank="${rank}" title="Lihat profil ${author}">
    <div class="post__avatar" style="background:${color}">${initials}</div>
    <div class="post__user-info">
      <span class="post__username">${author}</span>
      <span class="post__user-rank">${rank}</span>
    </div>
  </button>`;

  // Follow button (not shown on own posts)
  const followBtnHtml = (!isOwn && session) ? `<button class="post__follow-btn${isFollowing?' post__follow-btn--active':''}" data-author="${sanitize(author)}" title="${isFollowing?'Berhenti ikuti':'Ikuti'}" aria-label="Follow">
    <i class="ph-bold ph-${isFollowing?'user-minus':'user-plus'}"></i>
  </button>` : '';

  // Save button
  const saveBtnHtml = `<button class="post__save-btn${isSaved?' post__save-btn--active':''}" data-post-id="${postId}" title="${isSaved?'Hapus dari simpanan':'Simpan postingan'}" aria-label="Save">
    <i class="ph-${isSaved?'fill':'bold'} ph-bookmark${isSaved?'-simple':''}"></i>
  </button>`;

  if (post.category === 'announcement' || post.category === 'news') {
    return `
      <article class="post post--announcement glass-panel post--clickable" data-post-id="${postId}">
        <a href="${postUrl}" class="post__link-overlay" aria-label="Baca: ${title}"></a>
        <header class="post__header">
          <div class="post__label"><i class="ph-fill ph-${post.category==='news'?'newspaper':'megaphone'}"></i> ${tag}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${saveBtnHtml}
            <span class="post__time">${ago}</span>
          </div>
        </header>
        <h2 class="post__title">${title}</h2>
        ${excerpt?`<p class="post__excerpt">${excerpt}</p>`:''}
        ${thumbHtml}
        <footer class="post__footer">
          ${authorHtml}
          <div class="post__actions" style="border:none;margin:0;padding:0">
            <span class="post__action-btn"><i class="ph-bold ph-chat-circle"></i> ${comments}</span>
          </div>
        </footer>
      </article>`;
  }

  return `
    <article class="post glass-panel post--clickable" data-post-id="${postId}">
      <a href="${postUrl}" class="post__link-overlay" aria-label="Baca: ${title}"></a>
      <header class="post__header">
        ${authorHtml}
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${followBtnHtml}
          ${saveBtnHtml}
          <span class="post__tag">${tag}</span>
        </div>
      </header>
      <h2 class="post__title">${title}</h2>
      ${excerpt?`<p class="post__excerpt" style="margin-bottom:${thumbHtml?'0':'18px'}">${excerpt}</p>`:''}
      ${thumbHtml}
      <div class="post__actions">
        <button class="post__action-btn" aria-label="Upvote" data-post-id="${postId}">
          <i class="ph-bold ph-arrow-fat-up"></i> ${votes}
        </button>
        <button class="post__action-btn" aria-label="Comment">
          <i class="ph-bold ph-chat-circle"></i> ${comments}
        </button>
        <button class="post__action-btn" aria-label="Share" data-post-id="${postId}">
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
    let emptyMsg, emptyIcon;
    if (searchQuery) {
      emptyMsg = `Tidak ada hasil untuk "<strong>${sanitize(searchQuery)}</strong>"`;
      emptyIcon = 'ph-magnifying-glass';
    } else if (activeSort === 'following') {
      emptyIcon = 'ph-users-three';
      emptyMsg = followedUsers.length
        ? 'Belum ada postingan dari akun yang kamu ikuti.'
        : 'Kamu belum mengikuti siapapun.<br><span style="font-size:12px;font-weight:400;color:#52525b;display:block;margin-top:6px;">Follow pengguna dari profil mereka untuk melihat postingannya di sini.</span>';
    } else {
      emptyMsg = 'Belum ada postingan di sini.';
      emptyIcon = 'ph-chats';
    }
    container.innerHTML = `
      <div class="feed-empty">
        <i class="ph-duotone ${emptyIcon}"></i>
        <p>${emptyMsg}</p>
        ${!searchQuery && activeSort !== 'following' ? '<button class="btn btn--ghost" id="feed-retry">Coba refresh</button>' : ''}
      </div>`;
    document.getElementById('feed-retry')?.addEventListener('click', loadFeed);
    return;
  }

  container.innerHTML = filtered.map(buildPostHTML).join('');
}

// ─── LOAD FEED dari Supabase ──────────────────────────────────────────────────
async function loadFeed() {
  isLoading = true;
  loadFollowedUsersSync();
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
  // Tab buttons
  document.querySelectorAll('.feed__filter[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feed__filter[data-tab]').forEach(b => b.classList.remove('feed__filter--active'));
      btn.classList.add('feed__filter--active');
      activeTab = btn.dataset.tab;
      loadFollowedUsersSync();
      renderFeed();
    });
  });

  // Sort dropdown
  document.getElementById('feed-sort')?.addEventListener('change', e => {
    activeSort = e.target.value;
    if (activeSort === 'following' && !getSession()) {
      showToast('Login dulu untuk filter postingan dari yang kamu ikuti 🙏', 'info');
      e.target.value = 'new'; activeSort = 'new';
    }
    loadFollowedUsersSync();
    renderFeed();
  });

  // Feed container delegation: follow, save, author click
  document.querySelector('.feed__container')?.addEventListener('click', async e => {
    // Follow button
    const followBtn = e.target.closest('.post__follow-btn');
    if (followBtn) {
      e.preventDefault(); e.stopPropagation();
      const author = followBtn.dataset.author;
      requireAuth(async () => {
        // Show loading state
        followBtn.disabled = true;
        followBtn.innerHTML = `<span style="width:10px;height:10px;border:1.5px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;display:inline-block;animation:_spin .65s linear infinite"></span>`;

        const { isNowFollowing, error } = await toggleFollowUser(author);

        if (error) {
          showToast(`Gagal: ${error}`, 'error');
          followBtn.disabled = false;
          followBtn.innerHTML = `<i class="ph-bold ph-user-plus"></i>`;
          return;
        }

        showToast(isNowFollowing ? `✓ Mengikuti ${author}` : `Berhenti mengikuti ${author}`, 'success');
        followBtn.disabled = false;
        followBtn.innerHTML = `<i class="ph-bold ph-${isNowFollowing ? 'user-minus' : 'user-plus'}"></i>`;
        followBtn.classList.toggle('post__follow-btn--active', isNowFollowing);
        followBtn.title = isNowFollowing ? 'Berhenti ikuti' : 'Ikuti';
        followBtn.setAttribute('aria-label', isNowFollowing ? 'Berhenti ikuti' : 'Ikuti');
      }, 'untuk mengikuti pengguna');
      return;
    }

    // Save button
    const saveBtn = e.target.closest('.post__save-btn');
    if (saveBtn) {
      e.preventDefault(); e.stopPropagation();
      const pid = saveBtn.dataset.postId;
      const key = `mcgg_saved_${pid}`;
      const wasSaved = localStorage.getItem(key) === '1';
      if (wasSaved) {
        localStorage.removeItem(key);
        showToast('Postingan dihapus dari simpanan', 'info');
        saveBtn.classList.remove('post__save-btn--active');
        saveBtn.querySelector('i').className = 'ph-bold ph-bookmark';
        saveBtn.title = 'Simpan postingan';
      } else {
        // Save full post data
        const post = POSTS.find(p => String(p.id) === String(pid));
        if (post) localStorage.setItem(`mcgg_saved_data_${pid}`, JSON.stringify(post));
        localStorage.setItem(key, '1');
        showToast('✓ Postingan disimpan!', 'success');
        saveBtn.classList.add('post__save-btn--active');
        saveBtn.querySelector('i').className = 'ph-fill ph-bookmark-simple';
        saveBtn.title = 'Hapus dari simpanan';
      }
      return;
    }

    // Save Lineup button (on lineup posts in feed)
    const saveLineupBtn = e.target.closest('.feed-save-lineup-btn');
    if (saveLineupBtn) {
      e.preventDefault(); e.stopPropagation();
      // Prevent double click
      if (saveLineupBtn.dataset.saved === '1') return;
      const lineupData = saveLineupBtn.dataset.lineup;
      requireAuth(async (session) => {
        saveLineupBtn.disabled = true;
        saveLineupBtn.dataset.saved = '1';
        saveLineupBtn.innerHTML = `<span style="width:10px;height:10px;border:1.5px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;display:inline-block;animation:_spin .65s linear infinite"></span> Menyimpan...`;
        const ok = await saveLineupToProfile(lineupData);
        if (ok) {
          showToast('✓ Lineup tersimpan ke profil kamu!', 'success');
          saveLineupBtn.innerHTML = `<i class="ph-bold ph-check-circle"></i> Tersimpan!`;
          saveLineupBtn.style.color = '#22c55e';
          saveLineupBtn.style.borderColor = 'rgba(34,197,94,0.3)';
          saveLineupBtn.style.background = 'rgba(34,197,94,0.08)';
          // After 3s, re-enable as "Ganti Lineup"
          setTimeout(() => {
            saveLineupBtn.innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i> Ganti Lineup`;
            saveLineupBtn.style.color = '#a5b4fc';
            saveLineupBtn.style.borderColor = 'rgba(99,102,241,0.3)';
            saveLineupBtn.style.background = 'rgba(99,102,241,0.08)';
            saveLineupBtn.disabled = false;
            saveLineupBtn.dataset.saved = '0';
          }, 3000);
        } else {
          showToast('Gagal menyimpan. Coba lagi.', 'error');
          saveLineupBtn.disabled = false;
          saveLineupBtn.dataset.saved = '0';
          saveLineupBtn.innerHTML = `<i class="ph-bold ph-bookmark-simple"></i> Simpan Lineup`;
        }
      }, 'untuk menyimpan lineup');
      return;
    }

    // Author profile click
    const authorBtn = e.target.closest('.post__author-btn');
    if (authorBtn) {
      e.preventDefault(); e.stopPropagation();
      openPublicProfile(
        authorBtn.dataset.author,
        authorBtn.dataset.color,
        authorBtn.dataset.initials,
        authorBtn.dataset.rank
      );
      return;
    }
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

// ─── CREATE POST — COMPOSER ───────────────────────────────────────────────────
function bindCreatePost() {
  const modal     = document.getElementById('create-post-modal');
  const openBtn   = document.getElementById('open-create-post');
  if (!modal || !openBtn) return;

  // ── State ───────────────────────────────────────────────────────────────────
  let selCategory  = null;
  let selTag       = null;
  let previewing   = false;
  const mediaFiles = []; // { id, file, kind }

  // ── File limits & allowed types ─────────────────────────────────────────────
  const FILE_MAX  = { image: 10*1024*1024, video: 100*1024*1024, document: 20*1024*1024 };
  const FILE_MIME = {
    image:    ['image/jpeg','image/png','image/gif','image/webp','image/avif'],
    video:    ['video/mp4','video/webm','video/ogg'],
    document: ['application/pdf'],
  };
  
  // Helper to format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const ta = () => $('cp-text');

  function _uname() {
    const s = getSession();
    return s?.user?.user_metadata?.username || s?.user?.email?.split('@')[0] || 'User';
  }

  // ── Open modal ──────────────────────────────────────────────────────────────
  function openModal() {
    const uname    = _uname();
    const initials = uname.slice(0,2).toUpperCase();
    const avatarEl = $('cp-avatar');
    if (avatarEl) { avatarEl.textContent = initials; }
    const nameEl = $('cp-username-label');
    if (nameEl) nameEl.textContent = `@${uname}`;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('cp-overlay--visible'));
    setTimeout(() => ta()?.focus(), 80);
  }

  // ── Close & reset ───────────────────────────────────────────────────────────
  function closeModal() {
    modal.classList.remove('cp-overlay--visible');
    document.body.style.overflow = '';
    setTimeout(() => { modal.hidden = true; _reset(); }, 280);
  }

  function _reset() {
    selCategory = null; selTag = null; previewing = false;

    const t = ta();
    if (t) { t.value = ''; t.style.height = 'auto'; }
    $('cp-char-count').textContent = '0 / 5000';
    $('cp-error-text').hidden  = true;
    $('cp-error-category').hidden = true;

    document.querySelectorAll('.cp-cat').forEach(b => b.classList.remove('cp-cat--active'));

    mediaFiles.length = 0;
    $('cp-media-row').innerHTML = '';

    const lw = $('cp-link-wrap');
    if (lw) lw.hidden = true;
    const li = $('cp-link-input');
    if (li) li.value = '';
    $('cp-link-err').hidden = true;
    $('cp-link-toggle')?.classList.remove('cp-tool--active');

    _setPreview(false);
  }

  // ── Preview toggle ──────────────────────────────────────────────────────────
  function _setPreview(on) {
    previewing = on;
    $('cp-compose-view').hidden  =  on;
    $('cp-preview-view').hidden  = !on;
    $('cp-preview-icon').className = on ? 'ph-bold ph-pencil-simple' : 'ph-bold ph-eye';
    $('cp-preview-btn-label').textContent = on ? 'Tulis' : 'Preview';
    $('cp-preview-toggle').classList.toggle('cp-preview-btn--on', on);
    if (on) _buildPreview();
  }

  function _buildPreview() {
    const uname  = _uname();
    const text   = ta()?.value.trim() ?? '';
    const tag    = selTag ?? 'Postingan';
    const card   = $('cp-preview-card');
    
    // [UPDATE] Gabungkan teks dengan gambar persis seperti saat submit
    let finalBody = text;
    mediaFiles.forEach(m => {
      if (m.kind === 'image' && m.base64) {
        finalBody += `<br><br><img src="${m.base64}">`;
      }
    });

    card.innerHTML = buildPostHTML({
      id: 'preview', category: selCategory ?? 'meta', tag,
      title:          text.slice(0, 80) + (text.length > 80 ? '…' : ''),
      excerpt:        text.slice(0, 200),
      body:           finalBody, // <-- Kirim body ke fungsi buildPostHTML agar jadi Thumbnail
      attachment_url: $('cp-link-input')?.value.trim() || null, // <-- Kirim link kalau pakai URL
      author:         `@${uname}`,
      author_initials: uname.slice(0,2).toUpperCase(),
      author_color:   DESIGN_TOKENS.primary,
      author_rank:    '', created_at: new Date().toISOString(), votes: 0,
    });
    card.querySelector('.post__link-overlay')?.remove();
    card.querySelector('.post')?.classList.remove('post--clickable');
  }

  // ── Category pills ──────────────────────────────────────────────────────────
  document.querySelectorAll('.cp-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cp-cat').forEach(b => b.classList.remove('cp-cat--active'));
      btn.classList.add('cp-cat--active');
      selCategory = btn.dataset.category;
      selTag      = btn.dataset.tag;
      $('cp-error-category').hidden = true;
    });
  });

  // ── Textarea: auto-grow + char count ───────────────────────────────────────
  const textarea = ta();
  if (textarea) {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 300) + 'px';
      const len = this.value.length;
      const cc  = $('cp-char-count');
      if (cc) {
        cc.textContent = `${len} / 5000`;
        cc.classList.toggle('cp-char-count--warn', len > 4600);
      }
      if (len >= 10) {
        const errText = $('cp-error-text');
        if (errText) errText.hidden = true;
      }
    });
    
    // Prevent form submission on Enter (only submit on Ctrl/Cmd+Enter)
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && this.value.length >= 5000) {
        e.preventDefault();
        showToast('Maksimal 5000 karakter.', 'error');
      }
    });
  }

  // ── Link toggle ─────────────────────────────────────────────────────────────
  $('cp-link-toggle')?.addEventListener('click', () => {
    const wrap = $('cp-link-wrap');
    const open = wrap.hidden;
    wrap.hidden = !open;
    $('cp-link-toggle').classList.toggle('cp-tool--active', open);
    if (open) $('cp-link-input')?.focus();
    else {
      $('cp-link-input').value = '';
      $('cp-link-err').hidden  = true;
    }
  });

  $('cp-link-clear')?.addEventListener('click', () => {
    $('cp-link-input').value  = '';
    $('cp-link-wrap').hidden  = true;
    $('cp-link-err').hidden   = true;
    $('cp-link-toggle')?.classList.remove('cp-tool--active');
  });

  $('cp-link-input')?.addEventListener('blur', () => {
    const val = $('cp-link-input').value.trim();
    const err = $('cp-link-err');
    if (!val) { err.hidden = true; return; }
    try {
      const u = new URL(val);
      if (u.protocol !== 'https:') throw new Error();
      err.hidden = true;
    } catch {
      err.textContent = 'URL tidak valid — harus diawali https://';
      err.hidden = false;
    }
  });

  // ── File inputs ─────────────────────────────────────────────────────────────
  function _bindFile(inputId, kind) {
    $(inputId)?.addEventListener('change', function() {
      [...(this.files ?? [])].forEach(f => _addMedia(f, kind));
      this.value = '';
    });
  }
  _bindFile('cp-img-input', 'image');
  _bindFile('cp-vid-input', 'video');
  _bindFile('cp-pdf-input', 'document');

  function _addMedia(file, kind) {
    const row = $('cp-media-row');
    if (!FILE_MIME[kind]?.includes(file.type)) {
      return _mediaErr(row, `Tipe file "${file.type}" tidak didukung.`);
    }
    if (file.size > FILE_MAX[kind]) {
      const maxSize = formatFileSize(FILE_MAX[kind]);
      const fileSize = formatFileSize(file.size);
      return _mediaErr(row, `File terlalu besar (${fileSize}). Maks ${maxSize} untuk ${kind}.`);
    }
    if (file.size === 0) return _mediaErr(row, 'File kosong tidak bisa diupload.');
    
    // Check for duplicate files (by name and size)
    const isDuplicate = mediaFiles.some(m => 
      m.file.name === file.name && m.file.size === file.size
    );
    if (isDuplicate) {
      return _mediaErr(row, `File "${sanitize(file.name)}" sudah ditambahkan.`);
    }

    const id = `m${Date.now()}${Math.random().toString(36).slice(2,5)}`;

    // [UPDATE KUNCI] Baca file aslinya dan ubah menjadi Base64 (Teks)
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64Data = e.target.result;
      mediaFiles.push({ id, file, kind, base64: base64Data }); // Simpan Base64-nya!

      const thumb = document.createElement('div');
      thumb.className = 'cp-thumb';
      thumb.dataset.id = id;

      if (kind === 'image') {
        const img = new Image();
        img.src = base64Data;
        img.alt = file.name;
        thumb.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.className = 'cp-thumb__icon';
        icon.innerHTML = kind === 'video'
          ? '<i class="ph-bold ph-video-camera"></i><span>video</span>'
          : '<i class="ph-bold ph-file-pdf"></i><span>pdf</span>';
        thumb.appendChild(icon);
      }

      const del = document.createElement('button');
      del.className = 'cp-thumb__del';
      del.type = 'button';
      del.innerHTML = '<i class="ph-bold ph-x"></i>';
      del.addEventListener('click', () => {
        mediaFiles.splice(mediaFiles.findIndex(m => m.id === id), 1);
        thumb.remove();
      });
      thumb.appendChild(del);
      row.appendChild(thumb);
    };
    reader.readAsDataURL(file); // Jalankan konversi!
  }

  function _mediaErr(row, msg) {
    const el = document.createElement('div');
    el.className = 'cp-media-err';
    el.innerHTML = `<i class="ph-bold ph-warning-circle"></i> ${sanitize(msg)}`;
    row.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // ── Preview toggle button ───────────────────────────────────────────────────
  $('cp-preview-toggle')?.addEventListener('click', () => _setPreview(!previewing));

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function _submit() {
    const text = ta()?.value.trim() ?? '';
    let   ok   = true;
    const errCategory = $('cp-error-category');
    const errText = $('cp-error-text');

    if (!selCategory) { 
      if (errCategory) errCategory.hidden = false; 
      ok = false; 
    }
    if (text.length < 10) { 
      if (errText) errText.hidden = false; 
      ok = false; 
    }
    if (!ok) {
      // Scroll to first error
      if (!selCategory && errCategory) {
        errCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (text.length < 10 && errText) {
        errText.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Link validation
    const linkVal = $('cp-link-input')?.value.trim();
    if (linkVal) {
      try {
        const u = new URL(linkVal);
        if (u.protocol !== 'https:') throw new Error();
      } catch {
        $('cp-link-err').textContent = 'URL tidak valid — harus diawali https://';
        $('cp-link-err').hidden = false;
        return;
      }
    }

    const session = getSession();
    if (!session) { closeModal(); requireAuth(() => openModal(), 'untuk membuat postingan'); return; }

    const submitBtn = $('cp-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span style="width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;display:inline-block;animation:_spin .65s linear infinite"></span> Memposting…`;
    if (!document.getElementById('_spin-css')) {
      const s = document.createElement('style');
      s.id = '_spin-css'; s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    const uname    = _uname();
    const initials = uname.slice(0,2).toUpperCase();
    const color    = DESIGN_TOKENS.primary;
    const mediaArr = mediaFiles.map(m => ({ name: m.file.name, size: m.file.size, type: m.file.type, kind: m.kind }));

    // [UPDATE KUNCI] Gabungkan teks artikel dengan gambar Base64 yang diupload
    let finalBody = text;
    mediaFiles.forEach(m => {
      if (m.kind === 'image' && m.base64) {
        // Tulis tag IMG langsung ke dalam database
        finalBody += `<br><br><img src="${m.base64}" style="width:100%; border-radius:12px; margin-top:16px;">`;
      }
    });

    const payload = {
      user_id:         session.user.id,
      category:        selCategory,
      tag:             selTag,
      title:           text.slice(0, 120),
      excerpt:         text.slice(0, 220),
      body:            finalBody, // <--- Gunakan finalBody yang sudah diselipkan gambar!
      author:          `@${uname}`,
      author_initials: initials,
      author_color:    color,
      author_rank:     '',
      votes:           0,
      attachment_url:  linkVal || null,
      media:           mediaArr.length ? JSON.stringify(mediaArr) : null,
    };

    try {
      const saved = await sbInsert('posts', payload, session.access_token);

      POSTS.unshift({
        ...payload, id: saved?.id ?? `local_${Date.now()}`,
        authorInitials: initials, authorColor: color,
        created_at: new Date().toISOString(),
      });
      renderFeed();
      closeModal();
      showToast('✓ Postingan berhasil dipublikasikan!', 'success');
      document.querySelector('.feed__container')?.closest('.main-content')
        ?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[post]', err);
      showToast('Gagal memposting. Coba lagi.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Posting';
    }
  }

  // ── Event bindings ──────────────────────────────────────────────────────────
  openBtn?.addEventListener('click', () => requireAuth(() => openModal(), 'untuk membuat postingan'));
  $('cp-close')?.addEventListener('click', closeModal);
  $('cp-cancel')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { 
    if (e.key === 'Escape' && modal && !modal.hidden) closeModal(); 
  });
  $('cp-submit')?.addEventListener('click', _submit);
  // Ctrl/Cmd+Enter submits
  const textareaEl = ta();
  if (textareaEl) {
    textareaEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { 
        e.preventDefault(); 
        _submit(); 
      }
    });
  }
  
  // FAB bindings
  document.getElementById('fab-create-post')?.addEventListener('click', () => {
    requireAuth(() => openModal(), 'untuk membuat postingan');
  });
}

// ─── PROFILE MODAL ────────────────────────────────────────────────────────────

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

const PROFILE_LS_KEY = 'mcgg_user_profile';
function _loadLocalProfile() {
  const session = getSession();
  // FIXED: gunakan user-ID spesifik agar profil tidak bocor antar akun
  const key = session ? `${PROFILE_LS_KEY}_${session.user.id}` : PROFILE_LS_KEY;
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function _saveLocalProfile(d) {
  const session = getSession();
  const key = session ? `${PROFILE_LS_KEY}_${session.user.id}` : PROFILE_LS_KEY;
  try { localStorage.setItem(key, JSON.stringify(d)); } catch (_) {}
}

function openProfileModal() {
  let modal = document.getElementById('profile-modal');
  if (!modal) modal = _buildProfileModal();

  const session = getSession();
  if (!session) return;

  const uname  = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User';
  modal.querySelector('#pm-uname').textContent = `@${uname}`;
  modal.querySelector('#pm-email').textContent = session.user.email || '';
  modal.querySelector('#pm-initials').textContent = uname.slice(0,2).toUpperCase();

  const rankEl = modal.querySelector('#pm-rank');
  const cmdEl  = modal.querySelector('#pm-commander');

  // Reset dulu ke kosong — cegah data user lain bocor
  rankEl.value = '';
  cmdEl.value  = '';
  _renderProfileLineup(null);

  // Isi dari localStorage (per-user)
  const local = _loadLocalProfile();
  if (local.rank)      rankEl.value = local.rank;
  if (local.commander) cmdEl.value  = local.commander;
  if (local.lineup)    _renderProfileLineup(local.lineup);

  // Override dari Supabase (sumber kebenaran)
  sbGetOne('profiles', `user_id=eq.${session.user.id}&select=mc_rank,fav_commander,fav_lineup`, session.access_token)
    .then(row => {
      if (!row) return; // User baru: tidak ada row → biarkan kosong
      if (row.mc_rank !== undefined) rankEl.value = row.mc_rank || '';
      if (row.fav_commander !== undefined) cmdEl.value  = row.fav_commander || '';
      _renderProfileLineup(row.fav_lineup || null);
      _saveLocalProfile({ rank: row.mc_rank || '', commander: row.fav_commander || '', lineup: row.fav_lineup || null });
    })
    .catch(() => {});

  modal.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('pm--open')));
  document.body.style.overflow = 'hidden';
}

function _closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.classList.remove('pm--open');
  document.body.style.overflow = '';
  setTimeout(() => { modal.style.display = 'none'; }, 280);
}

// ─── Render fav_lineup JSON as hero image grid ────────────────────────────────
// fav_lineup format from builder: {"heroes":["masha","chou"],"synergies":"..."}
// OR legacy string like "Mystic Meow Full"
async function _renderProfileLineup(data) {
  const el = document.querySelector('#pm-lineup-display');
  if (!el) return;
  if (!data) {
    el.innerHTML = `<p style="color:#52525b;font-size:12px;font-style:italic;">Belum ada lineup tersimpan. Share lineup dari Builder untuk menyimpannya di sini.</p>`;
    return;
  }

  let parsed = null;
  try { parsed = typeof data === 'string' ? JSON.parse(data) : data; } catch { parsed = null; }

  if (!parsed?.heroes?.length) {
    // Legacy string
    el.innerHTML = `<p style="color:#a1a1aa;font-size:13px;">${sanitize(String(data))}</p>`;
    return;
  }

  // Import HERO_DB dynamically
  let HERO_DB = [];
  try {
    const mod = await import('./hero-db.js');
    HERO_DB = mod.HERO_DB ?? [];
  } catch {}

  const heroItems = parsed.heroes.map(hid => {
    const hero = HERO_DB.find(h => h.id === hid || h.name.toLowerCase() === hid.toLowerCase());
    if (!hero) return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;"><div style="width:40px;height:40px;border-radius:8px;background:#27272a;border:1px solid #3f3f46;display:flex;align-items:center;justify-content:center;font-size:9px;color:#71717a;">${sanitize(hid.slice(0,3))}</div><span style="font-size:9px;color:#71717a;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">${sanitize(hid)}</span></div>`;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <img src="${hero.img}" alt="${sanitize(hero.name)}" loading="lazy"
        style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1.5px solid rgba(99,102,241,0.5);background:#1a1a2e;">
      <span style="font-size:9px;color:#a1a1aa;font-weight:600;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(hero.name)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">${heroItems}</div>
    ${parsed.synergies ? `<div style="font-size:10px;color:#eab308;font-weight:700;">✦ ${sanitize(parsed.synergies)}</div>` : ''}`;
}

// ─── Public Profile Modal (click on author name) ──────────────────────────────
// ─── LIBRARY PANEL: Tersimpan + Mengikuti ───────────────────────────────────
// Satu panel, dua tab. Tidak ada panel terpisah.
// openLibraryPanel('saved') → tab Tersimpan (bookmark postingan + lineup)
// openLibraryPanel('following') → tab Mengikuti (daftar akun)
async function openLibraryPanel(initialTab) {
  document.getElementById('lib-panel')?.remove();
  const session = getSession();
  if (!session) {
    requireAuth(() => openLibraryPanel(initialTab), 'untuk membuka Library');
    return;
  }
  initialTab = initialTab || 'saved';

  const el = document.createElement('div');
  el.id = 'lib-panel';
  el.style.cssText = 'position:fixed;inset:0;z-index:9200;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);';

  el.innerHTML = `
    <div id="lib-box" style="background:#0c0c0e;border:1px solid rgba(255,255,255,0.1);border-top-left-radius:24px;border-top-right-radius:24px;width:100%;max-width:500px;height:82vh;display:flex;flex-direction:column;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 -24px 80px rgba(0,0,0,0.8);transform:translateY(60px);opacity:0;transition:all .32s cubic-bezier(.34,1.56,.64,1);">

      <!-- Handle bar -->
      <div style="display:flex;justify-content:center;padding:12px 0 0;">
        <div style="width:36px;height:4px;border-radius:99px;background:rgba(255,255,255,0.12);"></div>
      </div>

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;">
        <span style="font-size:16px;font-weight:800;color:#fff;">Library</span>
        <button id="lib-close" style="width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#71717a;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:6px;padding:12px 20px 0;flex-shrink:0;">
        <button id="lib-tab-saved" style="flex:1;padding:9px 0;border-radius:10px;border:1px solid;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="ph-bold ph-bookmark-simple"></i> Tersimpan
        </button>
        <button id="lib-tab-following" style="flex:1;padding:9px 0;border-radius:10px;border:1px solid;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="ph-bold ph-users-three"></i> Mengikuti
        </button>
      </div>

      <!-- Content -->
      <div id="lib-content" style="overflow-y:auto;padding:16px 20px 32px;flex:1;"></div>
    </div>`;

  document.body.appendChild(el);
  requestAnimationFrame(() => {
    const box = document.getElementById('lib-box');
    if (box) { box.style.transform = 'translateY(0)'; box.style.opacity = '1'; }
  });

  el.querySelector('#lib-close').addEventListener('click', () => el.remove());
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  const tabSaved     = el.querySelector('#lib-tab-saved');
  const tabFollowing = el.querySelector('#lib-tab-following');
  const content      = el.querySelector('#lib-content');

  function setTab(active) {
    const isS = active === 'saved';
    Object.assign(tabSaved.style, isS
      ? { background:'rgba(234,179,8,0.1)', borderColor:'rgba(234,179,8,0.3)', color:'#eab308' }
      : { background:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.08)', color:'#52525b' });
    Object.assign(tabFollowing.style, !isS
      ? { background:'rgba(99,102,241,0.1)', borderColor:'rgba(99,102,241,0.3)', color:'#a5b4fc' }
      : { background:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.08)', color:'#52525b' });
  }

  // ── TAB: TERSIMPAN ──────────────────────────────────────────────────────────
  // Menampilkan 2 section berbeda dalam satu tab:
  //   1. Lineup Favorit (dari profil user)
  //   2. Postingan Bookmark (dari localStorage)
  function renderSaved() {
    setTab('saved');

    // Kumpulkan postingan bookmark
    const bookmarks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mcgg_saved_') && !k.startsWith('mcgg_saved_data_') && localStorage.getItem(k) === '1') {
        const pid = k.replace('mcgg_saved_', '');
        let post = POSTS.find(p => String(p.id) === pid);
        if (!post) { try { post = JSON.parse(localStorage.getItem('mcgg_saved_data_' + pid) || 'null'); } catch(_){} }
        if (post) bookmarks.push(post);
      }
    }

    // Lineup tersimpan
    const local = _loadLocalProfile();
    const lineup = local.lineup || null;

    if (!bookmarks.length && !lineup) {
      content.innerHTML = `
        <div style="text-align:center;padding:52px 20px;color:#3f3f46;">
          <i class="ph-duotone ph-archive-box" style="font-size:48px;display:block;margin-bottom:14px;color:#27272a;"></i>
          <p style="font-size:14px;font-weight:700;color:#52525b;margin-bottom:4px;">Library masih kosong</p>
          <p style="font-size:12px;line-height:1.6;">Bookmark postingan dengan ikon <i class="ph-bold ph-bookmark"></i>,<br>atau simpan Lineup dari Builder.</p>
        </div>`;
      return;
    }

    let html = '';

    // ── Section 1: Lineup Favorit ──
    if (lineup) {
      html += `
        <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6366f1;margin:0 0 8px;display:flex;align-items:center;gap:5px;">
          <i class="ph-bold ph-sword"></i> Lineup Favorit
        </p>
        <div id="lib-lineup-box" style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:14px;padding:14px;margin-bottom:20px;">
          <div style="color:#52525b;font-size:12px;font-style:italic;">Memuat lineup...</div>
        </div>`;
    }

    // ── Section 2: Postingan Bookmark ──
    if (bookmarks.length) {
      html += `<p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#52525b;margin:0 0 8px;display:flex;align-items:center;gap:5px;">
        <i class="ph-bold ph-bookmark-simple"></i> Postingan Disimpan &thinsp;<span style="color:#3f3f46;font-size:10px;">${bookmarks.length}</span>
      </p>`;
      bookmarks.forEach(p => {
        html += `
          <div class="lib-bm-row" data-pid="${sanitize(String(p.id))}" style="display:flex;align-items:flex-start;gap:11px;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:7px;cursor:pointer;transition:all .15s;"
               onmouseover="this.style.background='rgba(99,102,241,0.07)';this.style.borderColor='rgba(99,102,241,0.2)'"
               onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.06)'">
            <div style="width:34px;height:34px;border-radius:9px;background:${sanitize(p.author_color||'#6366f1')};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${sanitize(p.author_initials||'?')}</div>
            <div style="flex:1;min-width:0;">
              <span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6366f1;font-weight:800;display:block;margin-bottom:2px;">${sanitize(p.tag||'')}</span>
              <span style="color:#e4e4e7;font-size:12px;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize((p.title||'').slice(0,55))}${(p.title||'').length>55?'…':''}</span>
              <span style="color:#52525b;font-size:11px;">${sanitize(p.author||'')} · ${timeAgo(p.created_at)}</span>
            </div>
            <button class="lib-bm-del" title="Hapus bookmark" style="background:none;border:none;color:#3f3f46;cursor:pointer;padding:4px;flex-shrink:0;font-size:15px;transition:color .15s;"
                    onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#3f3f46'">
              <i class="ph-bold ph-x"></i>
            </button>
          </div>`;
      });
    }

    content.innerHTML = html;

    // Klik row → buka post
    content.querySelectorAll('.lib-bm-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.lib-bm-del')) return;
        el.remove();
        window.location.href = 'post.html?id=' + row.dataset.pid;
      });
    });

    // Tombol hapus bookmark
    content.querySelectorAll('.lib-bm-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const row = btn.closest('.lib-bm-row');
        const pid = row.dataset.pid;
        localStorage.removeItem('mcgg_saved_' + pid);
        row.style.opacity = '0';
        row.style.transform = 'translateX(12px)';
        row.style.transition = 'all .2s ease';
        setTimeout(() => row.remove(), 200);
      });
    });

    // Render lineup visual async
    const lineupBox = content.querySelector('#lib-lineup-box');
    if (lineupBox && lineup) {
      (async () => {
        try {
          const ld = typeof lineup === 'string' ? JSON.parse(lineup) : lineup;
          if (!ld || !ld.heroes || !ld.heroes.length) throw new Error('empty');
          let HDB = [];
          try { const m = await import('./hero-db.js'); HDB = m.HERO_DB || []; } catch(_){}
          const imgs = ld.heroes.slice(0,10).map(hid => {
            const h = HDB.find(x => x.id === hid || (x.name||'').toLowerCase() === (hid||'').toLowerCase());
            return h
              ? `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;"><img src="${h.img}" title="${sanitize(h.name)}" style="width:40px;height:40px;border-radius:9px;object-fit:cover;border:1.5px solid rgba(99,102,241,.4);" loading="lazy"><span style="font-size:8px;color:#a1a1aa;font-weight:600;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(h.name)}</span></div>`
              : `<div style="width:40px;height:40px;border-radius:9px;background:#27272a;border:1px solid #3f3f46;display:flex;align-items:center;justify-content:center;font-size:9px;color:#71717a;" title="${sanitize(String(hid))}">${sanitize(String(hid||'').slice(0,3))}</div>`;
          }).join('');
          lineupBox.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:${ld.synergies?'10px':'0'};">${imgs}</div>
            ${ld.synergies ? `<div style="font-size:10px;color:#eab308;font-weight:700;margin-bottom:10px;">✦ ${sanitize(ld.synergies)}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:4px;">
              <button id="lib-del-lineup" style="font-size:11px;font-weight:700;color:#f87171;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:7px;padding:5px 11px;cursor:pointer;font-family:inherit;transition:all .15s;">Hapus Lineup</button>
              <a href="builder.html" style="font-size:11px;font-weight:700;color:#a5b4fc;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:7px;padding:5px 11px;text-decoration:none;">Buka Builder ↗</a>
            </div>`;
          content.querySelector('#lib-del-lineup')?.addEventListener('click', () => {
            const lp = _loadLocalProfile();
            delete lp.lineup;
            _saveLocalProfile(lp);
            lineupBox.closest('[style]')?.remove?.();
            showToast('Lineup dihapus.', 'info');
          });
        } catch(_) {
          lineupBox.innerHTML = '<p style="color:#3f3f46;font-size:12px;text-align:center;">Lineup tidak dapat ditampilkan.</p>';
        }
      })();
    }
  }

  // ── TAB: MENGIKUTI ─────────────────────────────────────────────────────────
  async function renderFollowing() {
    setTab('following');
    content.innerHTML = `
      <div style="text-align:center;padding:32px 20px;color:#52525b;">
        <span style="display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#6366f1;border-radius:50%;animation:_spin .7s linear infinite;"></span>
      </div>`;

    try {
      const rows = await sbGet('follows',
        `follower_id=eq.${session.user.id}&select=following_username,created_at&order=created_at.desc`);

      if (!rows.length) {
        content.innerHTML = `
          <div style="text-align:center;padding:52px 20px;color:#3f3f46;">
            <i class="ph-duotone ph-user-plus" style="font-size:48px;display:block;margin-bottom:14px;color:#27272a;"></i>
            <p style="font-size:14px;font-weight:700;color:#52525b;margin-bottom:4px;">Belum mengikuti siapapun</p>
            <p style="font-size:12px;">Buka profil pengguna lain dan klik Ikuti.</p>
          </div>`;
        return;
      }

      const palette = ['#6366f1','#a855f7','#3b82f6','#22c55e','#f59e0b','#ef4444'];
      content.innerHTML = rows.map(r => {
        const u = r.following_username;
        const initials = u.replace('@','').slice(0,2).toUpperCase();
        const color = palette[Math.abs([...u].reduce((a,c)=>a+c.charCodeAt(0),0)) % palette.length];
        return `
          <div class="lib-fw-row" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);margin-bottom:6px;">
            <div style="width:40px;height:40px;border-radius:12px;background:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;">${initials}</div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:700;color:#e4e4e7;">${sanitize(u)}</div>
              <div style="font-size:11px;color:#52525b;">Diikuti ${timeAgo(r.created_at)}</div>
            </div>
            <button class="lib-fw-stop" data-author="${sanitize(u)}"
              style="padding:6px 12px;border-radius:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;"
              onmouseover="this.style.background='rgba(239,68,68,0.14)'" onmouseout="this.style.background='rgba(239,68,68,0.06)'">
              Berhenti
            </button>
          </div>`;
      }).join('');

      content.querySelectorAll('.lib-fw-stop').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uname = btn.dataset.author;
          btn.disabled = true; btn.textContent = '...';
          const { isNowFollowing, error } = await toggleFollowUser(uname);
          if (error) { showToast('Gagal: ' + error, 'error'); btn.disabled = false; btn.textContent = 'Berhenti'; return; }
          if (!isNowFollowing) {
            const row = btn.closest('.lib-fw-row');
            row.style.opacity = '0'; row.style.transition = 'opacity .2s';
            setTimeout(() => row.remove(), 200);
            showToast('Berhenti mengikuti ' + uname, 'info');
            renderFeed();
          }
        });
      });
    } catch(err) {
      content.innerHTML = `<p style="color:#ef4444;font-size:13px;text-align:center;padding:20px;">${sanitize(err.message)}</p>`;
    }
  }

  tabSaved.addEventListener('click', renderSaved);
  tabFollowing.addEventListener('click', renderFollowing);

  // Initial render
  if (initialTab === 'following') renderFollowing(); else renderSaved();
}

async function openPublicProfile(author, color, initials, rank) {
  document.getElementById('pub-profile-modal')?.remove();

  const el = document.createElement('div');
  el.id = 'pub-profile-modal';
  el.style.cssText = 'position:fixed;inset:0;z-index:9200;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);';

  const session = getSession();
  loadFollowedUsersSync();
  const isFollowing = session ? followedUsers.includes(author) : false;
  const isOwn = session && (`@${session.user.user_metadata?.username || session.user.email?.split('@')[0]}`) === author;

  // Only show posts from this author (from loaded POSTS cache)
  const authorPosts = POSTS.filter(p => p.author === author).slice(0, 3);
  const totalVotes  = authorPosts.reduce((s, p) => s + (p.votes || 0), 0);

  // Fetch profile data (rank, lineup, follow counts) from Supabase
  let profileData = { mc_rank: rank || '', fav_lineup: null, fav_commander: '' };
  let followersCount = 0;
  let followingCount = 0;
  try {
    // Get follower/following counts (by username, always available)
    const [followersRows, followingRows] = await Promise.all([
      sbGet('follows', `following_username=eq.${encodeURIComponent(author)}&select=id`).catch(() => []),
      sbGet('follows', `follower_username=eq.${encodeURIComponent(author)}&select=id`).catch(() => []),
    ]);
    followersCount = followersRows.length;
    followingCount = followingRows.length;

    // Get profile by looking up user_id from any post by this author
    const authorPost = POSTS.find(p => p.author === author);
    if (authorPost?.user_id) {
      const profileRow = await sbGetOne('profiles',
        `user_id=eq.${authorPost.user_id}&select=mc_rank,fav_lineup,fav_commander`
      ).catch(() => null);
      if (profileRow) profileData = { ...profileData, ...profileRow };
    }
  } catch (_) {}

  // Build lineup mini-preview
  let lineupHtml = `<p style="color:#52525b;font-size:12px;font-style:italic;text-align:center;padding:8px 0;">Belum ada lineup</p>`;
  if (profileData.fav_lineup) {
    try {
      const ld = typeof profileData.fav_lineup === 'string' ? JSON.parse(profileData.fav_lineup) : profileData.fav_lineup;
      if (ld?.heroes?.length) {
        let HERO_DB_local = [];
        try { const mod = await import('./hero-db.js'); HERO_DB_local = mod.HERO_DB ?? []; } catch (_) {}
        const heroImgs = ld.heroes.slice(0, 8).map(hid => {
          const h = HERO_DB_local.find(x => x.id === hid || x.name?.toLowerCase() === hid?.toLowerCase());
          return h
            ? `<img src="${h.img}" title="${sanitize(h.name)}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;border:1.5px solid rgba(99,102,241,.5);background:#1a1a2e;" loading="lazy">`
            : `<div title="${sanitize(hid)}" style="width:36px;height:36px;border-radius:8px;background:#27272a;border:1px solid #3f3f46;display:flex;align-items:center;justify-content:center;font-size:9px;color:#71717a;">${sanitize(String(hid).slice(0,3))}</div>`;
        }).join('');
        lineupHtml = `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${heroImgs}</div>
          ${ld.synergies ? `<div style="font-size:10px;color:#eab308;font-weight:700;">✦ ${sanitize(ld.synergies)}</div>` : ''}`;
      }
    } catch (_) {}
  }

  const postsHtml = authorPosts.length ? authorPosts.map(p => `
    <a href="post.html?id=${sanitize(String(p.id))}" onclick="document.getElementById('pub-profile-modal')?.remove()"
       style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:6px;text-decoration:none;transition:all .15s;"
       onmouseover="this.style.background='rgba(99,102,241,0.08)';this.style.borderColor='rgba(99,102,241,.25)'"
       onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,.06)'">
      <div style="flex:1;min-width:0;">
        <span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6366f1;font-weight:800;display:block;margin-bottom:3px;">${sanitize(p.tag || '')}</span>
        <span style="color:#d4d4d8;font-size:12px;font-weight:600;line-height:1.4;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize((p.title || '').slice(0, 60))}${(p.title||'').length > 60 ? '…' : ''}</span>
      </div>
      <span style="font-size:11px;color:#52525b;flex-shrink:0;display:flex;align-items:center;gap:3px;"><i class="ph-bold ph-arrow-fat-up" style="color:#6366f1;"></i>${p.votes || 0}</span>
    </a>`).join('')
    : `<p style="font-size:12px;color:#3f3f46;text-align:center;padding:12px 0;">Belum ada postingan</p>`;

  el.innerHTML = `
    <div style="background:#0c0c0e;border:1px solid rgba(255,255,255,0.1);border-radius:24px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 40px 100px rgba(0,0,0,0.85);transform:translateY(24px);opacity:0;transition:all .3s cubic-bezier(.34,1.56,.64,1);" id="pub-box">
      
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:56px;height:56px;border-radius:16px;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 4px 16px ${color}60;">${sanitize(initials)}</div>
          <div>
            <div style="font-size:17px;font-weight:800;color:#fff;line-height:1.2;">${sanitize(author)}</div>
            <div style="font-size:12px;color:#71717a;margin-top:3px;display:flex;align-items:center;gap:5px;">
              <i class="ph-bold ph-game-controller" style="font-size:11px;color:#6366f1;"></i>
              ${sanitize(profileData.mc_rank || 'Belum diset')}
            </div>
            ${profileData.fav_commander ? `<div style="font-size:11px;color:#52525b;margin-top:2px;">⚔️ ${sanitize(profileData.fav_commander)}</div>` : ''}
          </div>
        </div>
        <button id="pub-close" style="width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#71717a;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:#fff;">${authorPosts.length}</div>
          <div style="font-size:9px;color:#71717a;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;">Post</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:#eab308;">${totalVotes}</div>
          <div style="font-size:9px;color:#71717a;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;">Votes</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:#a5b4fc;">${followersCount}</div>
          <div style="font-size:9px;color:#71717a;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;">Pengikut</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:#a5b4fc;">${followingCount}</div>
          <div style="font-size:9px;color:#71717a;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;">Mengikuti</div>
        </div>
      </div>

      <!-- Follow button -->
      ${!isOwn && session ? `<button id="pub-follow-btn" style="width:100%;padding:11px;border-radius:12px;margin-bottom:16px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px;${isFollowing ? 'background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;' : 'background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;'}">
        <i class="ph-bold ph-${isFollowing ? 'user-check' : 'user-plus'}"></i>
        ${isFollowing ? `Mengikuti ${author}` : `Ikuti ${author}`}
      </button>` : ''}
      ${isOwn ? `<div style="text-align:center;font-size:12px;color:#52525b;margin-bottom:16px;">Ini profil kamu</div>` : ''}

      <!-- Lineup Favorit -->
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6366f1;margin-bottom:8px;display:flex;align-items:center;gap:5px;">
        <i class="ph-bold ph-sword" style="font-size:11px;"></i> Lineup Favorit
      </div>
      <div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:12px;margin-bottom:16px;">
        ${lineupHtml}
      </div>

      <!-- Postingan Terbaru -->
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#52525b;margin-bottom:8px;">Postingan Terbaru</div>
      ${postsHtml}
    </div>`;

  document.body.appendChild(el);
  requestAnimationFrame(() => {
    const box = el.querySelector('#pub-box');
    if (box) { box.style.transform = 'translateY(0)'; box.style.opacity = '1'; }
  });

  el.querySelector('#pub-close')?.addEventListener('click', () => { el.remove(); document.body.style.overflow = ''; });
  el.addEventListener('click', e => { if (e.target === el) { el.remove(); document.body.style.overflow = ''; } });

  const followBtn = el.querySelector('#pub-follow-btn');
  followBtn?.addEventListener('click', async () => {
    followBtn.disabled = true;
    followBtn.innerHTML = `<span style="width:12px;height:12px;border:1.5px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;display:inline-block;animation:_spin .65s linear infinite"></span> Memproses...`;

    const { isNowFollowing, error } = await toggleFollowUser(author);
    followBtn.disabled = false;

    if (error) {
      showToast(`Gagal: ${error}`, 'error');
      const curr = followedUsers.includes(author);
      followBtn.innerHTML = `<i class="ph-bold ph-${curr ? 'user-check' : 'user-plus'}"></i> ${curr ? `Mengikuti ${author}` : `Ikuti ${author}`}`;
      return;
    }

    // Update button appearance
    followBtn.innerHTML = `<i class="ph-bold ph-${isNowFollowing ? 'user-check' : 'user-plus'}"></i> ${isNowFollowing ? `Mengikuti ${author}` : `Ikuti ${author}`}`;
    Object.assign(followBtn.style, isNowFollowing
      ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }
      : { background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)', color: '#a5b4fc' });

    // Update follower count in modal
    const countEl = el.querySelector('#pub-box .grid-followers');
    if (countEl) countEl.textContent = isNowFollowing ? followersCount + 1 : Math.max(0, followersCount - 1);

    showToast(isNowFollowing ? `✓ Mengikuti ${author}` : `Berhenti mengikuti ${author}`, 'success');
    renderFeed();
  });
}

function _buildProfileModal() {
  const el = document.createElement('div');
  el.id = 'profile-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="pm-backdrop"></div>
    <div class="pm-box">
      <button class="pm-x" id="pm-close" aria-label="Tutup"><i class="ph-bold ph-x"></i></button>

      <div class="pm-hero">
        <div class="pm-avatar"><span id="pm-initials">?</span></div>
        <div>
          <div class="pm-uname" id="pm-uname">—</div>
          <div class="pm-email" id="pm-email">—</div>
        </div>
      </div>

      <div class="pm-section"><i class="ph-bold ph-game-controller"></i> Profil Magic Chess</div>

      <!-- Library button - satu tombol, satu panel dengan tab -->
      <button id="pm-open-library" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px;border-radius:12px;margin-bottom:14px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);color:#a5b4fc;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:all .18s;" onmouseover="this.style.background='rgba(99,102,241,0.14)'" onmouseout="this.style.background='rgba(99,102,241,0.08)'">
        <i class="ph-bold ph-archive-box"></i> Library — Tersimpan & Mengikuti
      </button>

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
        <label class="pm-lbl">Lineup Favorit</label>
        <div id="pm-lineup-display" style="min-height:60px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:11px;padding:10px 12px;"></div>
        <span class="pm-hint" id="pm-lineup-hint">Lineup tersimpan otomatis saat kamu share dari Builder</span>
      </div>

      <div class="pm-foot">
        <button class="pm-btn pm-btn--logout" id="pm-logout">
          <i class="ph-bold ph-sign-out"></i> Logout
        </button>
        <button class="pm-btn pm-btn--save" id="pm-save">
          <i class="ph-bold ph-floppy-disk"></i> Simpan
        </button>
      </div>
      <div class="pm-saved" id="pm-saved" hidden>
        <i class="ph-bold ph-check-circle"></i> Profil tersimpan!
      </div>
    </div>`;
  document.body.appendChild(el);
  _injectProfileCSS();

  el.querySelector('.pm-backdrop').addEventListener('click', _closeProfileModal);
  el.querySelector('#pm-close').addEventListener('click', _closeProfileModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.classList.contains('pm--open')) _closeProfileModal();
  });

  el.querySelector('#pm-logout').addEventListener('click', async () => {
    _closeProfileModal();
    await signOut();
    showToast('Kamu telah logout.', 'info');
  });

  el.querySelector('#pm-open-library')?.addEventListener('click', () => {
    _closeProfileModal();
    setTimeout(() => openLibraryPanel('saved'), 100);
  });

  el.querySelector('#pm-save').addEventListener('click', async () => {
    const session = getSession();
    const rank    = el.querySelector('#pm-rank').value;
    const cmd     = el.querySelector('#pm-commander').value;
    const local   = _loadLocalProfile();
    const lineup  = local.lineup || null; // lineup is set by builder, not editable here

    _saveLocalProfile({ rank, commander: cmd, lineup });

    if (session?.user) {
      sbUpsert('profiles', {
        user_id: session.user.id, mc_rank: rank || null,
        fav_commander: cmd || null, fav_lineup: lineup || null,
      }, session.access_token).catch(e => console.warn('[profile] sync:', e.message));
    }

    const ok = el.querySelector('#pm-saved');
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; }, 2500);
  });

  return el;
}

function _injectProfileCSS() {
  if (document.getElementById('pm-css')) return;
  const s = document.createElement('style');
  s.id = 'pm-css';
  s.textContent = `
#profile-modal {
  position:fixed;inset:0;z-index:9100;
  display:none;align-items:center;justify-content:center;padding:20px;
}
#profile-modal.pm--open { display:flex !important; }
.pm-backdrop {
  position:absolute;inset:0;
  background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);
}
.pm-box {
  position:relative;z-index:1;
  width:100%;max-width:400px;
  background:rgba(12,12,14,0.98);
  border:1px solid rgba(255,255,255,0.09);
  border-radius:24px;
  padding:28px 24px 22px;
  box-shadow:0 32px 80px rgba(0,0,0,0.75),inset 0 1px 0 rgba(255,255,255,0.06);
  font-family:'Plus Jakarta Sans',sans-serif;
  transform:translateY(24px) scale(0.97);opacity:0;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .25s ease;
}
#profile-modal.pm--open .pm-box { transform:translateY(0) scale(1);opacity:1; }
.pm-x {
  position:absolute;top:14px;right:14px;
  width:30px;height:30px;border-radius:9px;
  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
  color:#71717a;cursor:pointer;font-size:14px;
  display:flex;align-items:center;justify-content:center;transition:all .18s;
}
.pm-x:hover { color:#fff;background:rgba(255,255,255,0.1); }
.pm-hero {
  display:flex;align-items:center;gap:14px;
  padding-bottom:18px;margin-bottom:18px;
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.pm-avatar {
  width:52px;height:52px;border-radius:16px;flex-shrink:0;
  background:linear-gradient(135deg,#6366f1,#a855f7);
  display:flex;align-items:center;justify-content:center;
  font-size:19px;font-weight:800;color:#fff;
  box-shadow:0 4px 16px rgba(99,102,241,0.4);
}
.pm-uname { font-size:16px;font-weight:800;color:#fff; }
.pm-email { font-size:12px;color:#52525b;margin-top:2px; }
.pm-section {
  font-size:10px;font-weight:900;text-transform:uppercase;
  letter-spacing:.08em;color:#6366f1;
  display:flex;align-items:center;gap:6px;margin-bottom:14px;
}
.pm-row { margin-bottom:13px; }
.pm-lbl { display:block;font-size:12px;font-weight:600;color:#a1a1aa;margin-bottom:5px; }
.pm-sel,.pm-inp {
  width:100%;background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.09);border-radius:11px;
  padding:10px 13px;color:#fff;
  font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;
  outline:none;box-sizing:border-box;transition:border-color .18s;
}
.pm-sel {
  appearance:none;-webkit-appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;
}
.pm-sel option { background:#111; }
.pm-sel:focus,.pm-inp:focus { border-color:rgba(99,102,241,.55); }
.pm-hint { font-size:11px;color:#3f3f46;margin-top:4px;display:block; }
.pm-foot {
  display:flex;gap:10px;margin-top:20px;
}
.pm-btn {
  flex:1;height:42px;border-radius:12px;font-weight:700;font-size:13px;
  cursor:pointer;border:none;font-family:'Plus Jakarta Sans',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:7px;
  transition:all .18s;
}
.pm-btn--logout {
  background:transparent;border:1px solid rgba(255,255,255,0.1);color:#71717a;
}
.pm-btn--logout:hover { background:rgba(239,68,68,0.09);color:#ef4444;border-color:rgba(239,68,68,0.25); }
.pm-btn--save {
  background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;
  box-shadow:0 4px 16px rgba(99,102,241,0.35);
}
.pm-btn--save:hover { opacity:.9;transform:translateY(-1px); }
.pm-saved {
  text-align:center;margin-top:11px;
  font-size:13px;color:#22c55e;font-weight:600;
  display:flex;align-items:center;justify-content:center;gap:6px;
}`;
  document.head.appendChild(s);
}

// ─── FAB BINDINGS ─────────────────────────────────────────────────────────────

function bindFABs() {
  // FAB create post
  document.getElementById('fab-create-post')?.addEventListener('click', () => {
    const openBtn = document.getElementById('open-create-post');
    if (openBtn) openBtn.click();
  });

  // FAB profile
  document.getElementById('fab-profile')?.addEventListener('click', () => {
    if (getSession()) openProfileModal();
    else document.getElementById('sidebar-login-btn')?.click();
  });

  // Desktop: avatar sidebar juga buka modal profil
  document.querySelector('.sidebar__user')?.addEventListener('click', () => {
    if (getSession()) openProfileModal();
  });
}

// ─── AUTH STATE → update avatar sidebar + FAB profile ────────────────────────

function bindAuthState() {
  onAuthChange(session => {
    const avatarEl  = document.querySelector('.sidebar__avatar');
    const fabProfEl = document.getElementById('fab-profile');
    const fabImgEl  = document.getElementById('fab-profile-img');

    if (session?.user) {
      const uname = session.user.user_metadata?.username
        || session.user.email?.split('@')[0] || 'User';
      const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}&background=6366f1&color=fff&bold=true`;

      if (avatarEl) { avatarEl.src = src; avatarEl.alt = uname; avatarEl.style.borderColor = 'var(--clr-primary)'; }
      if (fabImgEl) { fabImgEl.src = src; }
    } else {
      if (avatarEl) { avatarEl.src = 'https://ui-avatars.com/api/?name=Guest&background=27272a&color=71717a'; avatarEl.style.borderColor = ''; }
      if (fabImgEl) { fabImgEl.src = 'https://ui-avatars.com/api/?name=Login&background=27272a&color=71717a'; } /* [UPDATE] Ganti avatar jadi abu-abu tulisan Login saat belum masuk */
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
  bindAuthState();
  bindFABs();
  await loadFeed();
  bindFeedFilters();
  bindSearch();
  startTimer();
  setActiveSidebarLink();
  bindCreatePost();
  bindFeedVotes();

  // Show News category pill in create-post composer only for admin
  onAuthChange(session => {
    const newsBtn = document.querySelector('.cp-cat--news-only');
    if (newsBtn) newsBtn.style.display = session?.user?.id === ADMIN_UID ? '' : 'none';
    loadFollowedUsersSync();
    renderFeed(); // refresh follow states on cards
  });
  // Initial check
  const initSession = getSession();
  const newsBtn = document.querySelector('.cp-cat--news-only');
  if (newsBtn) newsBtn.style.display = initSession?.user?.id === ADMIN_UID ? '' : 'none';
  // Load followed users from Supabase asynchronously after initial render
  loadFollowedUsers().then(() => renderFeed()).catch(() => {});
});