import { SUPABASE_URL, SUPABASE_ANON_KEY, requireAuth, initAuth } from './auth.js';
import { ADMIN_UID } from './config.js';

// 1. DEKLARASI VARIABEL (Hanya boleh sekali!)
let currentSession = null;
let currentView = 'posts';
let isLoadingData = false;

// 2. AUTH & LOCKDOWN (Menunggu initAuth selesai)
document.addEventListener('DOMContentLoaded', async () => {
    // Jalankan initAuth dulu agar data sesi tersedia di memori
    await initAuth();

    requireAuth((session) => {
        // Cek ID Admin secara ketat
        if (session.user.id !== ADMIN_UID) {
            alert('AKSES DITOLAK! Anda bukan admin.');
            window.location.href = 'app.html';
            return;
        }
        
        // Verifikasi Berhasil
        currentSession = session;
        
        // Hilangkan loader dan tampilkan halaman
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
        
        document.body.style.display = 'block'; 
        loadData();
    }, 'Akses Dashboard Admin');
});

// 3. FETCH DATA (Wajib kirim Token Admin)
async function loadData() {
    const tableBody = document.getElementById('table-body');
    const tableHead = document.getElementById('table-head');
    
    if (!tableBody || isLoadingData) return;
    
    isLoadingData = true;
    
    // Show loading state
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.textContent = 'Memuat data...';
    }
    
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#71717a;"><div style="display:inline-block;width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top-color:#6366f1;border-radius:50%;animation:spin .7s linear infinite"></div><br><br>Memuat data...</td></tr>';

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${currentView}?select=*&order=created_at.desc&limit=100`, {
            headers: { 
                'apikey': SUPABASE_ANON_KEY, 
                'Authorization': `Bearer ${currentSession.access_token}` 
            }
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.message || `Database menolak akses (${res.status})`);
        }

        const data = await res.json();
        renderTable(data);
    } catch (err) {
        console.error('[admin] Load error:', err);
        // FIX: Do NOT use onclick="loadData()" — ES modules are scoped and loadData
        // is not available on window. Use a data attribute + delegated listener instead.
        tableBody.innerHTML = `<tr><td colspan="5" style="color:#ef4444; text-align:center;padding:40px;">Error: ${sanitize(err.message)}<br><button data-action="retry-load" style="margin-top:12px;padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;">Coba Lagi</button></td></tr>`;
    } finally {
        isLoadingData = false;
        if (loader) loader.style.display = 'none';
    }
}

// Helper sanitize untuk admin.js
function sanitize(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Add spin animation for loader
if (!document.getElementById('admin-loader-css')) {
    const style = document.createElement('style');
    style.id = 'admin-loader-css';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
}

function renderTable(data) {
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');

    if (!data || data.length === 0) {
        if (currentView === 'posts') {
            head.innerHTML = `<tr><th>Judul</th><th>Penulis</th><th>Aksi</th></tr>`;
        } else {
            head.innerHTML = `<tr><th>Komentar</th><th>User</th><th>Aksi</th></tr>`;
        }
        body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;color:#71717a;">Tidak ada data</td></tr>';
        return;
    }

    if (currentView === 'posts') {
        head.innerHTML = `<tr><th>Judul</th><th>Penulis</th><th>Aksi</th></tr>`;
        body.innerHTML = data.map(d => `
            <tr>
                <td><span style="display:block; max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sanitize(d.title)}">${sanitize(d.title)}</span></td>
                <td>${sanitize(d.author)}</td>
                <td><button class="btn-delete" onclick="window.deleteData('${sanitize(String(d.id))}')" aria-label="Hapus postingan">Hapus</button></td>
            </tr>
        `).join('');
    } else {
        head.innerHTML = `<tr><th>Komentar</th><th>User</th><th>Aksi</th></tr>`;
        body.innerHTML = data.map(d => `
            <tr>
                <td><span style="display:block; max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sanitize(d.body)}">${sanitize(d.body)}</span></td>
                <td>${sanitize(d.author)}</td>
                <td><button class="btn-delete" onclick="window.deleteData('${sanitize(String(d.id))}')" aria-label="Hapus komentar">Hapus</button></td>
            </tr>
        `).join('');
    }
}

// 4. DELETE DATA (Gunakan Token Admin)
window.deleteData = async (id) => {
    if (!id || !currentSession) return;
    
    // Sanitize ID to prevent injection
    const sanitizedId = String(id).replace(/[^0-9]/g, '');
    if (!sanitizedId) {
        alert('ID tidak valid.');
        return;
    }
    
    if (!confirm('Hapus permanen dari database?')) return;

    const btn = event?.target;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Menghapus...';
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${currentView}?id=eq.${sanitizedId}`, {
            method: 'DELETE',
            headers: { 
                'apikey': SUPABASE_ANON_KEY, 
                'Authorization': `Bearer ${currentSession.access_token}` 
            }
        });

        if (res.ok) {
            const result = await res.json();
            if (result && result.length > 0) {
                loadData();
            } else {
                alert('Data tidak ditemukan atau sudah dihapus.');
                loadData(); // Refresh anyway
            }
        } else {
            const errorData = await res.json().catch(() => ({}));
            alert(`Gagal menghapus: ${errorData.message || 'Cek Policy RLS di Supabase.'}`);
        }
    } catch (err) {
        console.error('[admin] Delete error:', err);
        alert('Terjadi kesalahan jaringan: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Hapus';
        }
    }
};

// 5. TAB SWITCH
window.switchTab = (view, btn) => {
    currentView = view;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadData();
};

// 6. DELEGATED EVENT LISTENER — handles [data-action="retry-load"] buttons injected
// into the table after a fetch error. Cannot use onclick="loadData()" in ES modules
// because the function is module-scoped and not available on window.
document.addEventListener('click', (e) => {
    if (e.target?.dataset?.action === 'retry-load') {
        loadData();
    }
});