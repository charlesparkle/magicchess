// ═══════════════════════════════════════════════════════════════════════════════
// 1. PROFANITY FILTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Daftar kata kasar/kotor (ID + EN).
 * Gunakan variasi leet-speak dan substring matching agar bypass sulit.
 * Daftar ini adalah representasi ringan — perluas sesuai kebutuhan.
 */
const PROFANITY_LIST = [
  // ── Bahasa Indonesia ──────────────────────────────────────────────────────
  'anjing','anjir','bangsat','bajingan','brengsek','babi','goblok','tolol',
  'idiot','bodoh','asu','cuk','jancok','jancuk','kampret','keparat','sialan',
  'setan','iblis','memek','kontol','pepek','ngentot','entot','ngewe','ngentod',
  'ngentut','bokep','cabul','pelacur','sundal','lonte','jalang','bejat',
  'tai','tahi','kntl','kntr','monyong','dungu','blo\'on','bloon','perek',
  // ── English ───────────────────────────────────────────────────────────────
  'fuck','fucking','fucker','fck','f*ck','f**k',
  'shit','bullshit','b*llshit','bitch','b*tch',
  'asshole','ass','bastard','damn','crap','dick','cock',
  'cunt','pussy','whore','slut','porn','porno','xxx',
  'nigger','nigga','faggot','retard',
];

// Normalize text: remove punctuation, spaces, and common obfuscation characters
function _normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\s\-_.,*+@#()\[\]{}|\\\/:;"'`~!?=<>]/g, '') // Remove punctuation and spaces
    .replace(/[0o]/g, 'o')  // Normalize 0 to o
    .replace(/[1il]/g, 'i') // Normalize 1, l to i
    .replace(/[3e]/g, 'e')  // Normalize 3 to e
    .replace(/[4a]/g, 'a')  // Normalize 4 to a
    .replace(/[5s]/g, 's')  // Normalize 5 to s
    .replace(/[7t]/g, 't')  // Normalize 7 to t
    .replace(/[@a]/g, 'a')  // Normalize @ to a
    .replace(/[$s]/g, 's')  // Normalize $ to s
    .replace(/[!i]/g, 'i'); // Normalize ! to i
}

// Escape spesial regex chars agar aman dipakai dalam pattern
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Bangun RegExp satu kali saja (lazy init)
let _profanityRe = null;
function _getProfanityRe() {
  if (_profanityRe) return _profanityRe;
  // Gabungkan semua kata jadi alternation, sort panjang → pendek agar greedy match
  const patterns = [...PROFANITY_LIST]
    .sort((a, b) => b.length - a.length)
    .map(_escapeRe)
    .join('|');
  _profanityRe = new RegExp(`(${patterns})`, 'gi');
  return _profanityRe;
}

/**
 * Periksa apakah teks mengandung kata kasar.
 * Menggunakan normalisasi teks untuk menangkap variasi obfuscation.
 * @param {string} text
 * @returns {{ clean: boolean, matches: string[] }}
 */
export function checkProfanity(text) {
  if (!text) return { clean: true, matches: [] };
  
  // Check original text first
  const re = _getProfanityRe();
  re.lastIndex = 0;
  const originalMatches = [...text.matchAll(re)].map(m => m[0]);
  
  // Also check normalized text to catch obfuscated words
  const normalized = _normalizeText(text);
  re.lastIndex = 0;
  const normalizedMatches = [...normalized.matchAll(re)].map(m => m[0]);
  
  // Combine and deduplicate matches
  const allMatches = [...new Set([...originalMatches, ...normalizedMatches])];
  
  return { clean: allMatches.length === 0, matches: allMatches };
}

/**
 * Sensor kata kasar dengan bintang.
 * Contoh: "anjing" → "a****g"
 * @param {string} text
 * @returns {string}
 */
export function censorProfanity(text) {
  if (!text) return text;
  return text.replace(_getProfanityRe(), w =>
    w[0] + '*'.repeat(Math.max(1, w.length - 2)) + (w.length > 1 ? w[w.length - 1] : '')
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. STRICT LINK FILTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Blacklist kategori domain berbahaya.
 * Format: keyword / substring domain yang dilarang.
 */
const BLACKLISTED_KEYWORDS = [
  // ── Adult / Pornografi ────────────────────────────────────────────────────
  'pornhub','xvideos','xnxx','xhamster','youporn','redtube','tube8',
  'brazzers','bangbros','nubiles','hentai','javhd','jav','av4','avgle',
  'onlyfans','fansly','manyvids','adultfriendfinder','ashleymadison',
  'sex','xxx','porn','adult','erotic','nude','nudes','nsfw',
  'bokep','mesum','biru','bugil','telanjang','selingkuh',
  // ── Judi / Gambling ───────────────────────────────────────────────────────
  'bet','betting','casino','poker','slot','togel','toto','judi','bandar',
  'sbobet','maxbet','m88','188bet','1xbet','bwin','unibet','draftkings',
  'fanduel','pokerstars','betway','spinix','pgslot','pragmatic','idn',
  'idnplay','idnpoker','domino','sakong','gaple','capsa','roulette',
  'blackjack','baccarat','mahjong','live22','joker123','habanero',
  'agen','bandarqq','dominoqq','aduq','bandarq',
  // ── Malware / Phishing / Scam ─────────────────────────────────────────────
  'bit.ly','tinyurl','shorturl','clck.ru','is.gd','v.gd','rb.gy',
  'free-robux','free-uc','free-diamond','free-skin','hack','cheat',
  'crack','keygen','torrent','warez','nulled','leaked','dump',
  'paypal-verify','account-verify','login-secure','secure-login',
  'bank-alert','verify-your','confirm-your','suspended-account',
];

/**
 * Ekstrak semua URL dari teks (http/https/www).
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrls(text) {
  if (!text) return [];
  const re = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  return [...text.matchAll(re)].map(m => m[0].toLowerCase());
}

/**
 * Cek apakah sebuah URL mengandung keyword terlarang.
 * @param {string} url
 * @returns {{ blocked: boolean, reason: string }}
 */
export function checkUrl(url) {
  const lower = url.toLowerCase();
  for (const kw of BLACKLISTED_KEYWORDS) {
    if (lower.includes(kw)) {
      const category =
        ['sex','xxx','porn','adult','bokep','bugil','mesum','biru','nude'].some(k => lower.includes(k)) ||
        ['pornhub','xvideos','xnxx','xhamster','youporn','onlyfans','fansly'].some(k => lower.includes(k))
          ? 'konten dewasa'
        : ['bet','casino','poker','slot','togel','judi','bandar','sbobet'].some(k => lower.includes(k)) ||
          ['idn','idnplay','idnpoker','domino','gaple','sakong'].some(k => lower.includes(k))
          ? 'judi/gambling'
        : 'situs berbahaya / phishing';
      return { blocked: true, reason: category };
    }
  }
  return { blocked: false, reason: '' };
}

/**
 * Periksa seluruh teks — cari semua URL dan validasi.
 * @param {string} text
 * @returns {{ safe: boolean, blockedUrls: Array<{url: string, reason: string}> }}
 */
export function checkLinksInText(text) {
  const urls   = extractUrls(text);
  const blocked = urls.map(url => ({ url, ...checkUrl(url) })).filter(r => r.blocked);
  return { safe: blocked.length === 0, blockedUrls: blocked };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FILE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Batas ukuran file (bytes) */
export const FILE_LIMITS = {
  image:    10 * 1024 * 1024,   // 10 MB
  video:    100 * 1024 * 1024,  // 100 MB
  document: 20 * 1024 * 1024,  // 20 MB
};

/** MIME type yang diizinkan per kategori */
export const ALLOWED_MIME = {
  image:    ['image/jpeg','image/png','image/gif','image/webp','image/avif'],
  video:    ['video/mp4','video/webm','video/ogg','video/quicktime'],
  document: ['application/pdf'],
};

/** Ekstensi yang diizinkan (double-check di samping MIME) */
const ALLOWED_EXT = {
  image:    ['.jpg','.jpeg','.png','.gif','.webp','.avif'],
  video:    ['.mp4','.webm','.ogg','.mov'],
  document: ['.pdf'],
};

/**
 * Validasi File object sebelum upload.
 * @param {File} file
 * @param {'image'|'video'|'document'} type
 * @returns {{ valid: boolean, error: string }}
 */
export function validateFile(file, type) {
  if (!file) return { valid: false, error: 'Tidak ada file yang dipilih.' };

  const allowedMimes = ALLOWED_MIME[type] ?? [];
  const allowedExts  = ALLOWED_EXT[type]  ?? [];
  const maxSize      = FILE_LIMITS[type]  ?? 10 * 1024 * 1024;

  // Cek MIME type
  if (!allowedMimes.includes(file.type)) {
    return {
      valid: false,
      error: `Tipe file tidak didukung. Hanya ${allowedExts.join(', ')} yang diizinkan.`,
    };
  }

  // Cek ekstensi (dari nama file)
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `Ekstensi file .${file.name.split('.').pop()} tidak diizinkan.`,
    };
  }

  // Cek ukuran
  if (file.size > maxSize) {
    const mb = (maxSize / 1024 / 1024).toFixed(0);
    const fileMb = (file.size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `File terlalu besar (${fileMb} MB). Maksimal ${mb} MB untuk ${type}.`,
    };
  }

  // Cek file tidak kosong
  if (file.size === 0) {
    return { valid: false, error: 'File kosong tidak bisa diupload.' };
  }

  return { valid: true, error: '' };
}

/**
 * Validasi URL attachment link (harus https, tidak di-blacklist).
 * @param {string} url
 * @returns {{ valid: boolean, error: string }}
 */
export function validateAttachmentUrl(url) {
  if (!url || !url.trim()) return { valid: false, error: 'URL tidak boleh kosong.' };

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: 'Format URL tidak valid. Gunakan format https://...' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Hanya URL dengan HTTPS yang diizinkan.' };
  }

  const { blocked, reason } = checkUrl(url);
  if (blocked) {
    return { valid: false, error: `URL mengandung ${reason} yang dilarang di platform ini.` };
  }

  return { valid: true, error: '' };
}

/**
 * Format ukuran file ke string yang mudah dibaca.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MATH CAPTCHA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate soal math CAPTCHA sederhana.
 * Setiap pemanggilan menghasilkan angka acak baru.
 * @returns {{ question: string, answer: number, a: number, b: number, op: string }}
 */
export function generateCaptcha() {
  const ops = ['+', '-', '×'];
  const op  = ops[Math.floor(Math.random() * ops.length)];

  let a, b, answer;

  if (op === '+') {
    a = _rand(1, 20);
    b = _rand(1, 20);
    answer = a + b;
  } else if (op === '-') {
    a = _rand(5, 25);
    b = _rand(1, a);         // pastikan hasil ≥ 0
    answer = a - b;
  } else {                   // ×
    a = _rand(2, 12);
    b = _rand(2, 9);
    answer = a * b;
  }

  return {
    question: `${a} ${op} ${b} = ?`,
    answer,
    a, b, op,
  };
}

function _rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Verifikasi jawaban CAPTCHA.
 * @param {number|string} userAnswer
 * @param {number} correctAnswer
 * @returns {boolean}
 */
export function verifyCaptcha(userAnswer, correctAnswer) {
  return parseInt(String(userAnswer).trim(), 10) === correctAnswer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. COMBINED CONTENT CHECK (untuk post/komentar)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lakukan seluruh pemeriksaan moderasi pada teks postingan/komentar.
 * @param {string} text
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function moderateContent(text) {
  const errors = [];

  // Profanity check
  const profResult = checkProfanity(text);
  if (!profResult.clean) {
    const sample = [...new Set(profResult.matches)].slice(0, 3).map(w => `"${w}"`).join(', ');
    errors.push(`Konten mengandung kata yang tidak pantas: ${sample}. Harap gunakan bahasa yang sopan.`);
  }

  // Link check
  const linkResult = checkLinksInText(text);
  if (!linkResult.safe) {
    const reasons = [...new Set(linkResult.blockedUrls.map(r => r.reason))];
    errors.push(`Konten mengandung link ${reasons.join(' / ')} yang dilarang di platform ini.`);
  }

  return { ok: errors.length === 0, errors };
}