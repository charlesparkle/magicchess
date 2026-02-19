/**
 * post.js — Halaman Detail Postingan (ES Module)
 */

import { initAuth, requireAuth, getSession } from './auth.js';

/**
 * ─── SETUP SUPABASE (wajib sebelum deploy) ───────────────────────────────────
 * 1. Buat project di https://supabase.com (gratis)
 * 2. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di bawah
 * 3. Jalankan SQL berikut di Supabase SQL Editor:
 *
 * -- Tabel posts
 * CREATE TABLE posts (
 * id          BIGSERIAL PRIMARY KEY,
 * category    TEXT NOT NULL CHECK (category IN ('announcement','guide','meta')),
 * tag         TEXT NOT NULL,
 * title       TEXT NOT NULL,
 * excerpt     TEXT,
 * body        TEXT,          -- konten lengkap artikel (Markdown atau plain text)
 * author      TEXT NOT NULL,
 * author_initials TEXT NOT NULL,
 * author_color    TEXT DEFAULT '#6366f1',
 * author_rank     TEXT,
 * votes       INT  DEFAULT 0,
 * created_at  TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Tabel comments
 * CREATE TABLE comments (
 * id          BIGSERIAL PRIMARY KEY,
 * post_id     BIGINT REFERENCES posts(id) ON DELETE CASCADE,
 * author      TEXT NOT NULL,
 * author_initials TEXT NOT NULL,
 * author_color    TEXT DEFAULT '#6366f1',
 * body        TEXT NOT NULL,
 * created_at  TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Row Level Security: baca terbuka untuk semua
 * ALTER TABLE posts    ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public read posts"    ON posts    FOR SELECT USING (true);
 * CREATE POLICY "Public read comments" ON comments FOR SELECT USING (true);
 * CREATE POLICY "Public insert comments" ON comments FOR INSERT WITH CHECK (true);
 *
 * ─── MODE OFFLINE / DEMO ──────────────────────────────────────────────────────
 * Kalau SUPABASE_URL masih kosong (''), script otomatis pakai MOCK_POSTS
 * sehingga halaman tetap bisa dipreview tanpa koneksi ke Supabase.
 */

// ── Konfigurasi Supabase ───────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://wsbpdvglzcfsujduvbcs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYnBkdmdsemNmc3VqZHV2YmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0ODcxNzIsImV4cCI6MjA4NzA2MzE3Mn0.AeKhJYSn4n8ckdYa4i8QW4Mv6h-BRWtugkBRfICPMnI';

const USE_MOCK = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// Set ID komentar yang sudah dirender — mencegah duplikasi saat Realtime
// mendeliver komentar yang baru saja kita kirim sendiri
const renderedCommentIds = new Set();

// ── Supabase Realtime ─────────────────────────────────────────────────────────
// Menggunakan Supabase Realtime v2 via WebSocket langsung (tanpa SDK besar).
// Protocol: wss://<project>.supabase.co/realtime/v1/websocket
// Docs: https://supabase.com/docs/guides/realtime/postgres-changes
let realtimeSocket   = null;
let realtimeChannel  = null;
let realtimeHeartbeat = null;

function initRealtimeComments(postId) {
  if (USE_MOCK) return; // Realtime tidak tersedia di mode mock

  const wsUrl = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;
  const channelId = `comments:post_${postId}`;

  function connect() {
    realtimeSocket = new WebSocket(wsUrl);

    realtimeSocket.onopen = () => {
      // Join channel — subscribe ke postgres_changes pada tabel comments
      const joinMsg = {
        topic: `realtime:${channelId}`,
        event: 'phx_join',
        payload: {
          config: {
            broadcast:  { self: false },
            presence:   { key: '' },
            postgres_changes: [{
              event:  'INSERT',
              schema: 'public',
              table:  'comments',
              filter: `post_id=eq.${postId}`,
            }],
          },
        },
        ref: '1',
      };
      realtimeSocket.send(JSON.stringify(joinMsg));

      // Heartbeat setiap 30 detik agar koneksi tidak di-drop
      realtimeHeartbeat = setInterval(() => {
        if (realtimeSocket?.readyState === WebSocket.OPEN) {
          realtimeSocket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
        }
      }, 30_000);

      setRealtimeIndicator('live');
    };

    realtimeSocket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // Abaikan pesan sistem (join_ref, heartbeat, dll)
        if (msg.event !== 'postgres_changes') return;

        const record = msg.payload?.data?.record;
        if (!record) return;

        // Dedupe: jangan render kalau ID sudah ada (komentar yang kita kirim sendiri)
        if (renderedCommentIds.has(record.id)) return;

        appendComment(record, true); // true = animasi slide-in
      } catch {
        // Abaikan parse error (heartbeat reply, dll)
      }
    };

    realtimeSocket.onerror = () => {
      setRealtimeIndicator('error');
    };

    realtimeSocket.onclose = () => {
      clearInterval(realtimeHeartbeat);
      setRealtimeIndicator('reconnecting');
      // Reconnect otomatis setelah 3 detik
      setTimeout(() => {
        if (document.visibilityState !== 'hidden') connect();
      }, 3000);
    };
  }

  connect();

  // Cleanup saat user navigasi pergi
  window.addEventListener('beforeunload', () => {
    clearInterval(realtimeHeartbeat);
    realtimeSocket?.close();
  });

  // Pause saat tab tidak aktif, resume saat kembali
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && realtimeSocket?.readyState === WebSocket.CLOSED) {
      connect();
    }
  });
}

// ── Realtime status indicator ─────────────────────────────────────────────────
function setRealtimeIndicator(state) {
  const el = document.getElementById('realtime-indicator');
  if (!el) return;
  const states = {
    live:         { dot: '#22c55e', text: 'Live',          pulse: true  },
    reconnecting: { dot: '#eab308', text: 'Reconnecting…', pulse: false },
    error:        { dot: '#ef4444', text: 'Offline',        pulse: false },
  };
  const s = states[state] ?? states.error;
  el.innerHTML = `<span class="rt-dot" style="background:${s.dot};${s.pulse ? 'animation:rt-pulse 2s infinite;' : ''}"></span>${s.text}`;
}

// ── Append satu komentar ke DOM ───────────────────────────────────────────────
// Dipakai oleh: renderComments (initial load) + Realtime INSERT handler
function buildCommentEl(c, animate = false) {
  const div = document.createElement('div');
  div.className = 'comment-item' + (animate ? ' comment-item--new' : '');
  div.dataset.commentId = c.id;
  div.innerHTML = `
    <div class="comment-item__avatar" style="background:${sanitize(c.author_color ?? '#6366f1')}">
      ${sanitize(c.author_initials ?? '?')}
    </div>
    <div class="comment-item__body">
      <div class="comment-item__header">
        <span class="comment-item__author">${sanitize(c.author)}</span>
        <span class="comment-item__time">${timeAgo(c.created_at)}</span>
      </div>
      <p class="comment-item__text">${sanitize(c.body)}</p>
    </div>`;
  return div;
}

function appendComment(c, animate = false) {
  const listEl  = document.getElementById('comment-list');
  const emptyEl = document.getElementById('comments-empty');
  const countEl = document.getElementById('comment-count');
  if (!listEl) return;

  renderedCommentIds.add(c.id);
  emptyEl && (emptyEl.hidden = true);
  const el = buildCommentEl(c, animate);
  listEl.appendChild(el);

  // Update counter
  const prev = parseInt(countEl?.textContent, 10) || 0;
  if (countEl) countEl.textContent = prev + 1;

  // Scroll ke komentar baru
  if (animate) {
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    // Fade out highlight setelah 2 detik
    setTimeout(() => el.classList.add('comment-item--settled'), 2000);
  }
}

// ── Mock data (dipakai saat Supabase belum dikonfigurasi) ─────────────────────
const MOCK_POSTS = [
  {
    id: 1,
    category: 'announcement',
    tag: 'Official Update',
    title: 'Patch Notes 348.1: Mystic Meow Scaling Adjustments',
    excerpt: "We've implemented major changes to the synergy bonus for Mystic Meow.",
    body: `<h2>Overview</h2>
<p>Patch 348.1 membawa perubahan besar pada mekanisme <strong>Mystic Meow</strong>. Setelah monitoring intensif selama dua minggu turnamen, kami menemukan bahwa sinergi ini memberikan keunggulan yang terlalu signifikan pada tahap akhir pertandingan.</p>
<h2>Perubahan Utama</h2>
<ul>
  <li><strong>Damage output di 11 sinergi</strong>: dikurangi dari 35% menjadi 28%</li>
  <li><strong>Scaling per hero</strong>: cap maksimum turun dari 15 menjadi 12 stack</li>
  <li><strong>Durasi buff</strong>: tetap sama (8 detik per gelombang)</li>
</ul>
<h2>Alasan Perubahan</h2>
<p>Data menunjukkan win rate Mystic Meow 11 di Diamond+ mencapai <strong>67.3%</strong> — jauh di atas ambang batas sehat (55%). Ini membuat meta menjadi sangat sempit dan mengurangi keragaman komposisi yang kompetitif.</p>
<blockquote>Tujuan kami bukan untuk menghapus Mystic Meow dari meta, melainkan membuatnya seimbang dengan sinergi lain.</blockquote>
<h2>Jadwal Berlaku</h2>
<p>Patch ini sudah aktif per <strong>19 Februari 2026</strong>. Season 5 tidak terdampak (sudah terkunci).</p>`,
    author: 'Dev Team MCGG',
    author_initials: 'Dev',
    author_color: 'var(--clr-primary)',
    author_rank: 'Official',
    votes: 0,
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    comments: [
      { id: 1, author: '@R7_Tatsumaki', author_initials: 'R7', author_color: '#3b82f6', body: 'Perubahan yang sudah lama ditunggu. 67% win rate memang tidak sehat untuk kompetitif.', created_at: new Date(Date.now() - 1 * 3600_000).toISOString() },
      { id: 2, author: '@charles_k',    author_initials: 'CK', author_color: '#a855f7', body: 'Semoga 9-sinergi masih viable setelah ini. Saya tidak mau rebuild seluruh roster.', created_at: new Date(Date.now() - 30 * 60_000).toISOString() },
    ],
  },
  {
    id: 2,
    category: 'guide',
    tag: 'Guide',
    title: 'The Ultimate Counter to Tharz Skill 3 — Full Analysis',
    excerpt: "Struggling against Tharz late game? Here's the breakdown.",
    body: `<h2>Kenapa Tharz Skill 3 Berbahaya?</h2>
<p>Tharz Skill 3 adalah kemampuan burst AOE yang memiliki radius efek terluas di season ini. Pada tahap late-game (level 8+), single cast-nya bisa menghabisi 60–80% HP hero 2-gold jika tidak ada mitigasi yang tepat.</p>
<h2>Counter #1: Positioning Backline</h2>
<p>Cara paling efektif adalah menempatkan <strong>tank di baris terdepan</strong> dengan jarak yang rapat. Ini memaksa Tharz menarget frontline, bukan support di belakang.</p>
<h2>Counter #2: Sinergi yang Tahan Burst</h2>
<ul>
  <li><strong>Armor synergy 4+</strong>: memberikan flat damage reduction 30%</li>
  <li><strong>Shield synergy</strong>: absorb hit pertama sepenuhnya</li>
  <li><strong>Regen synergy</strong>: recovery setelah burst — kurang efektif tapi tetap membantu</li>
</ul>
<h2>Counter #3: Timing Stun</h2>
<p>Skill 3 Tharz memiliki cast time 0.8 detik. Jika kamu bisa men-stun Tharz <em>sebelum</em> cast selesai, skill-nya akan gagal dan masuk cooldown. Hero dengan interrupt cepat: Chou Skill 2, Karrie Skill 1.</p>
<blockquote>Spoiler: positioning tank di backline adalah counter paling reliable untuk semua level play.</blockquote>`,
    author: '@R7_Tatsumaki',
    author_initials: 'R7',
    author_color: '#3b82f6',
    author_rank: 'Pro Player',
    votes: 842,
    created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    comments: [],
  },
  {
    id: 3,
    category: 'meta',
    tag: 'Meta Discussion',
    title: 'Is Fanny Skill 2 still the King of Economy?',
    excerpt: 'After the latest gold adjustment, Remy Skill 3 is becoming more viable.',
    body: `<p>Setelah patch gold adjustment minggu lalu, saya mulai tracking ulang semua hero ekonomi di Diamond+. Hasilnya cukup mengejutkan.</p>
<h2>Data Terbaru (200 game)</h2>
<ul>
  <li><strong>Fanny Skill 2</strong>: +3.2 gold/ronde rata-rata</li>
  <li><strong>Remy Skill 3</strong>: +3.0 gold/ronde rata-rata (naik dari +2.1)</li>
  <li><strong>Franco Skill 1</strong>: +2.4 gold/ronde</li>
</ul>
<p>Gap antara Fanny dan Remy sudah sangat tipis. Di beberapa setup hyper-carry, Remy bahkan lebih efisien karena bisa di-pair dengan sinergi yang Fanny tidak bisa.</p>
<h2>Kesimpulan</h2>
<p>Fanny masih king, tapi mahkotanya mulai goyah. Kalau patch berikutnya buff Remy sedikit lagi, meta ekonomi bisa bergeser signifikan.</p>`,
    author: '@charles_k',
    author_initials: 'CK',
    author_color: '#a855f7',
    author_rank: 'Top 100 ID',
    votes: 124,
    created_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
    comments: [
      { id: 3, author: '@meta_monk', author_initials: 'MM', author_color: '#22c55e', body: 'Data yang bagus. Tapi perlu dicatat Fanny punya flexibility lebih di positioning board.', created_at: new Date(Date.now() - 20 * 3600_000).toISOString() },
    ],
  },
  {
    id: 4,
    category: 'guide',
    tag: 'Guide',
    title: 'Season 5 Economy Guide: Maximising Gold Efficiency',
    excerpt: 'A comprehensive breakdown of the new gold economy system.',
    body: '<p>Coming soon...</p>',
    author: '@meta_monk',
    author_initials: 'MM',
    author_color: '#22c55e',
    author_rank: 'Analyst',
    votes: 310,
    created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
    comments: [],
  },
  {
    id: 5,
    category: 'meta',
    tag: 'Meta Discussion',
    title: "Neobeasts core is overtuned — here's the data",
    excerpt: 'Win rate of Neobeasts 4 comps sits at 58.3%.',
    body: '<p>Coming soon...</p>',
    author: '@data_diver',
    author_initials: 'DD',
    author_color: '#ef4444',
    author_rank: 'Data Analyst',
    votes: 512,
    created_at: new Date(Date.now() - 72 * 3600_000).toISOString(),
    comments: [],
  },
];

// ── DOMPurify — lazy load dari CDN (untuk body artikel user-generated) ────────
let _purify = null;
async function getPurify() {
  if (_purify) return _purify;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.mjs');
    _purify = mod.default ?? mod;
  } catch {
    // Fallback minimal jika CDN gagal
    _purify = {
      sanitize: (s) => s
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, ''),
    };
  }
  return _purify;
}

// ── Security: sanitize helper ─────────────────────────────────────────────────
function sanitize(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Time formatting ───────────────────────────────────────────────────────────
function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'Baru saja';
  if (m < 60) return `${m} menit lalu`;
  if (h < 24) return `${h} jam lalu`;
  if (d < 7)  return `${d} hari lalu`;
  return new Date(isoString).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

// ── Supabase fetch helpers ────────────────────────────────────────────────────
async function supabaseGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

async function supabasePost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

// ── Data fetching (Supabase atau Mock) ────────────────────────────────────────
async function fetchPost(id) {
  if (USE_MOCK) {
    const post = MOCK_POSTS.find(p => p.id === Number(id));
    if (!post) throw new Error('Post tidak ditemukan');
    return post;
  }
  const rows = await supabaseGet('posts', `id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!rows.length) throw new Error('Post tidak ditemukan');
  return rows[0];
}

async function fetchComments(postId) {
  if (USE_MOCK) {
    const post = MOCK_POSTS.find(p => p.id === Number(postId));
    return post?.comments ?? [];
  }
  return supabaseGet('comments', `post_id=eq.${encodeURIComponent(postId)}&select=*&order=created_at.asc`);
}

async function fetchRelated(category, excludeId) {
  if (USE_MOCK) {
    return MOCK_POSTS.filter(p => p.category === category && p.id !== Number(excludeId)).slice(0, 4);
  }
  return supabaseGet(
    'posts',
    `category=eq.${encodeURIComponent(category)}&id=neq.${encodeURIComponent(excludeId)}&select=id,title,tag&order=created_at.desc&limit=4`
  );
}

async function postComment(postId, body) {
  const session = getSession();
  const username = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'guest';
  const initials = username.slice(0, 2).toUpperCase();
  const color    = '#a855f7';

  if (USE_MOCK) {
    return [{ id: Date.now(), post_id: postId, author: `@${username}`, author_initials: initials, author_color: color, body, created_at: new Date().toISOString() }];
  }
  return supabasePost('comments', { post_id: postId, author: `@${username}`, author_initials: initials, author_color: color, body });
}

// ── OG Meta updater ───────────────────────────────────────────────────────────
function updateOGMeta(post) {
  const title = `${sanitize(post.title)} — MCGG Network`;
  const desc  = post.excerpt || 'Baca diskusi lengkapnya di MCGG Network.';

  document.title = title;

  const setMeta = (prop, val, isName = false) => {
    const attr = isName ? 'name' : 'property';
    let el = document.querySelector(`meta[${attr}="${prop}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };

  setMeta('og:title',       title);
  setMeta('og:description', desc);
  setMeta('og:url',         window.location.href);
  setMeta('twitter:title',       title, true);
  setMeta('twitter:description', desc,  true);
}

// ── Render functions ──────────────────────────────────────────────────────────
async function renderPost(post) {
  // State transitions
  document.getElementById('state-loading').hidden = true;
  document.getElementById('state-loaded').hidden  = false;

  // Breadcrumb
  document.getElementById('breadcrumb-category').textContent = post.tag;

  // Meta bar
  const tagEl = document.getElementById('article-tag');
  tagEl.textContent = post.tag;
  tagEl.className   = `article-tag article-tag--${post.category}`;
  document.getElementById('article-time').textContent = timeAgo(post.created_at);

  // Judul
  document.getElementById('article-title').textContent = post.title;

  // Author bar
  const avatarEl = document.getElementById('author-avatar');
  avatarEl.textContent = post.author_initials ?? post.authorInitials ?? '?';
  avatarEl.style.background = post.author_color ?? post.authorColor ?? '#6366f1';
  document.getElementById('author-name').textContent = post.author;
  document.getElementById('author-rank').textContent = post.author_rank ?? post.userRank ?? '';
  document.getElementById('vote-count').textContent  = post.votes ?? 0;

  // Sidebar author widget
  const sbAvatar = document.getElementById('sidebar-author-avatar');
  sbAvatar.textContent = post.author_initials ?? post.authorInitials ?? '?';
  sbAvatar.style.background = post.author_color ?? post.authorColor ?? '#6366f1';
  document.getElementById('sidebar-author-name').textContent = post.author;
  document.getElementById('sidebar-author-rank').textContent = post.author_rank ?? post.userRank ?? '';

  // Body artikel — XSS-safe via DOMPurify
  // post.body bisa mengandung HTML dari user (Create Post). WAJIB disanitize.
  const bodyEl = document.getElementById('article-body');
  if (post.body) {
    const purify = await getPurify();
    bodyEl.innerHTML = purify.sanitize(post.body, {
      ALLOWED_TAGS: [
        'h1','h2','h3','h4','p','ul','ol','li',
        'strong','em','del','code','pre','blockquote',
        'a','br','hr','img',
      ],
      ALLOWED_ATTR: ['href','target','rel','src','alt','class'],
      // Blokir href berbahaya (javascript:, data:, dll)
      ALLOW_DATA_ATTR: false,
    });
  } else {
    bodyEl.innerHTML = `<p style="color:#52525b;font-style:italic">Konten artikel belum tersedia.</p>`;
  }

  // OG meta
  updateOGMeta(post);
}

function renderComments(comments) {
  const loadingEl = document.getElementById('comments-loading');
  const emptyEl   = document.getElementById('comments-empty');
  const countEl   = document.getElementById('comment-count');

  if (loadingEl) loadingEl.hidden = true;
  if (countEl)   countEl.textContent = comments.length;

  if (!comments.length) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  // Render semua komentar awal — tanpa animasi, daftarkan ID ke renderedCommentIds
  comments.forEach(c => appendComment(c, false));
}

function renderRelated(posts) {
  const el = document.getElementById('related-list');
  if (!posts.length) {
    el.innerHTML = '<p style="font-size:12px;color:#3f3f46;padding:8px 0">Tidak ada postingan terkait.</p>';
    return;
  }
  el.innerHTML = posts.map(p => `
    <a href="post.html?id=${sanitize(p.id)}" class="related-item">
      <span class="related-item__tag">${sanitize(p.tag)}</span><br>
      ${sanitize(p.title)}
    </a>`).join('');
}

function showError(message) {
  document.getElementById('state-loading').hidden = true;
  document.getElementById('state-error').hidden   = false;
  document.getElementById('error-message').textContent = message;
  document.title = 'Error | MCGG Network';
}

// ── Vote interactivity ────────────────────────────────────────────────────────
function bindVote(postId, currentVotes) {
  const btn     = document.getElementById('vote-btn');
  const countEl = document.getElementById('vote-count');
  const KEY     = `mcgg_voted_${postId}`;
  let voted     = localStorage.getItem(KEY) === '1';
  let count     = currentVotes;

  if (voted) btn.classList.add('vote-btn--active');

  btn.addEventListener('click', () => {
    requireAuth(() => {
      if (voted) {
        voted = false; count--;
        localStorage.removeItem(KEY);
        btn.classList.remove('vote-btn--active');
      } else {
        voted = true; count++;
        localStorage.setItem(KEY, '1');
        btn.classList.add('vote-btn--active');
        btn.style.transform = 'scale(1.15)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
      }
      countEl.textContent = count;
    }, 'untuk memberikan vote');
  });
}

// ── Share button ──────────────────────────────────────────────────────────────
function bindShare() {
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('✓ Link disalin!');
    } catch {
      showToast('Salin URL dari address bar browser kamu.');
    }
  });
}

function showToast(msg) {
  document.querySelectorAll('.mcgg-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'mcgg-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(12px);background:#111;border:1px solid rgba(255,255,255,0.1);color:#e4e4e7;padding:11px 22px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.2s,transform 0.2s;border-left:3px solid #6366f1;box-shadow:0 16px 40px rgba(0,0,0,0.7);';
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)'; setTimeout(() => t.remove(), 280); }, 3000);
}

// ── Comment form ──────────────────────────────────────────────────────────────
function bindCommentForm(postId) {
  const input     = document.getElementById('comment-input');
  const submitBtn = document.getElementById('submit-comment');
  const charCount = document.getElementById('char-count');
  const avatarEl  = document.querySelector('.comment-form__avatar');

  // Update avatar dari session
  const session = getSession();
  if (session && avatarEl) {
    const username = session.user.user_metadata?.username || session.user.email.split('@')[0];
    avatarEl.textContent = username.slice(0, 2).toUpperCase();
  }

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    const len = input.value.length;
    charCount.textContent = `${len}/1000`;
    submitBtn.disabled = len < 3;
  });

  submitBtn.addEventListener('click', () => {
    requireAuth(() => _doSubmitComment(postId, input, submitBtn, charCount), 'untuk mengirim komentar');
  });
}

async function _doSubmitComment(postId, input, submitBtn, charCount) {
  const text = input.value.trim();
  if (text.length < 3) return;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="ph-bold ph-spinner"></i> Mengirim...';
  try {
    const [newComment] = await postComment(postId, text);
    appendComment(newComment, true);
    input.value = ''; input.style.height = 'auto'; charCount.textContent = '0/1000';
    showToast('✓ Komentar dikirim!');
  } catch (err) {
    showToast('Gagal mengirim komentar. Coba lagi.');
    console.error('[post.js] comment error:', err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Kirim';
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  const params = new URLSearchParams(window.location.search);
  const rawId  = params.get('id');

  // Validasi: id harus berupa angka positif
  const id = rawId && /^\d+$/.test(rawId) ? rawId : null;

  if (!id) {
    showError('URL tidak valid. Tidak ada ID postingan yang ditemukan.');
    return;
  }

  // Fetch post + komentar + related secara paralel
  try {
    const [post, comments, related] = await Promise.all([
      fetchPost(id),
      fetchComments(id),
      fetchPost(id).then(p => fetchRelated(p.category, id)).catch(() => []),
    ]);

    await renderPost(post);
    renderComments(comments);
    renderRelated(related);
    bindVote(id, post.votes ?? 0);
    bindShare();
    bindCommentForm(id);
    initRealtimeComments(id);  // ← mulai listen Realtime setelah semua siap

  } catch (err) {
    console.error('[post.js] fetch error:', err);
    showError(err.message || 'Terjadi kesalahan saat memuat postingan.');
  }
});