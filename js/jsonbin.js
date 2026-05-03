/**
 * JSONBin.io を使った共有データストレージ
 *
 * v7: BIN分離 + キー混入防止セーフガード
 *   - 専用BIN（jun-content）に切り替え
 *   - PUT時に REQUIRED_KEYS 以外のキーを除去（他ツールのデータ混入を防止）
 *   - 万一外部から余計なキーが入っても自分のキー以外は触らない
 *   - 自動バックアップ（3世代）+ 復元UI + ステータスバーは v6 の挙動を継承
 */

const JSONBIN_BIN_ID  = '69f6abe036566621a81b51ff';
const JSONBIN_API_KEY = '$2a$10$AvmWUg6WVIQyDh8CBFaWFOx40lKAW6cLjXrK97I2AmsG80a.4IOtO';
const JSONBIN_BASE    = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

const LS_DATA_KEY    = 'jb_cache_data';
const LS_TS_KEY      = 'jb_cache_ts';
const REQUIRED_KEYS  = ['videos','editors','links','ec_courses','ec_course_videos','bonus_groups','bonus_items'];
const BACKUP_MAX     = 3;
const LS_BACKUP_PREFIX = 'jb_backup_';

let _cache = null;
let _saving = false;
let _pendingSave = false;
let _bgRefreshDone = false;

// ============================================================
// データ検証 / 整形
// ============================================================

function _hasData(data) {
    if (!data || typeof data !== 'object') return false;
    return REQUIRED_KEYS.some(k => Array.isArray(data[k]) && data[k].length > 0);
}

function _ensureKeys(data) {
    if (!data || typeof data !== 'object') data = {};
    REQUIRED_KEYS.forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    return data;
}

// PUT/書き込み前に REQUIRED_KEYS だけ抽出（他ツールのキーを絶対に混入させない）
function _stripToRequiredKeys(data) {
    const clean = {};
    REQUIRED_KEYS.forEach(k => {
        clean[k] = Array.isArray(data && data[k]) ? data[k] : [];
    });
    return clean;
}

function _countItems(data) {
    if (!data) return 0;
    return REQUIRED_KEYS.reduce((sum, k) => sum + (Array.isArray(data[k]) ? data[k].length : 0), 0);
}

// ============================================================
// 自動バックアップ（3世代ローテーション）
// ============================================================

function _getBackups() {
    const backups = [];
    for (let i = 1; i <= BACKUP_MAX; i++) {
        try {
            const raw = localStorage.getItem(LS_BACKUP_PREFIX + i);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.ts && parsed.data && _hasData(parsed.data)) {
                backups.push({ slot: i, ts: parsed.ts, data: parsed.data });
            }
        } catch (e) { /* skip */ }
    }
    backups.sort((a, b) => b.ts - a.ts);
    return backups;
}

function _saveBackup(data) {
    if (!_hasData(data)) return;

    const backups = _getBackups();

    if (backups.length > 0) {
        const lastStr = JSON.stringify(backups[0].data);
        const newStr = JSON.stringify(data);
        if (lastStr === newStr) return;
    }

    try {
        for (let i = BACKUP_MAX; i >= 2; i--) {
            const prev = localStorage.getItem(LS_BACKUP_PREFIX + (i - 1));
            if (prev) {
                localStorage.setItem(LS_BACKUP_PREFIX + i, prev);
            } else {
                localStorage.removeItem(LS_BACKUP_PREFIX + i);
            }
        }
        localStorage.setItem(LS_BACKUP_PREFIX + '1', JSON.stringify({
            ts: Date.now(),
            data: data
        }));
    } catch (e) {
        console.warn('バックアップ保存失敗:', e);
    }
}

// ============================================================
// 復元UI
// ============================================================

function _showRestoreUI(backups) {
    if (document.getElementById('jb-restore-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'jb-restore-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: 'Noto Sans JP', sans-serif;
    `;

    const formatDate = (ts) => {
        const d = new Date(ts);
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    const btnList = backups.map((b, i) => {
        const count = _countItems(b.data);
        const label = i === 0 ? '最新' : i === 1 ? '1つ前' : '2つ前';
        return `
            <button onclick="window._jbRestore(${b.slot})" style="
                width: 100%;
                padding: 14px 16px;
                margin-bottom: 8px;
                background: ${i === 0 ? '#dc3545' : '#6c757d'};
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 0.95rem;
                font-weight: 600;
                cursor: pointer;
                text-align: left;
                transition: opacity 0.2s;
            " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                📦 ${label}のバックアップ（${formatDate(b.ts)}）
                <br><small style="font-weight:400; opacity:0.9;">データ ${count}件</small>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 16px;
            padding: 32px 28px;
            width: 400px;
            max-width: 90vw;
            box-shadow: 0 8px 40px rgba(0,0,0,0.3);
        ">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">⚠️</div>
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin: 0 0 6px;">データが見つかりません</h3>
                <p style="color: #6c757d; font-size: 0.88rem; margin: 0;">バックアップから復元できます</p>
            </div>
            ${btnList}
            <button onclick="document.getElementById('jb-restore-overlay').remove()" style="
                width: 100%;
                padding: 12px;
                background: transparent;
                color: #6c757d;
                border: 1px solid #dee2e6;
                border-radius: 10px;
                font-size: 0.9rem;
                cursor: pointer;
                margin-top: 4px;
            ">閉じる（空のまま続ける）</button>
        </div>
    `;

    window._jbRestore = async function(slot) {
        try {
            const raw = localStorage.getItem(LS_BACKUP_PREFIX + slot);
            if (!raw) { alert('バックアップが見つかりません'); return; }
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.data || !_hasData(parsed.data)) {
                alert('バックアップデータが無効です');
                return;
            }

            overlay.querySelector('div').innerHTML = `
                <div style="text-align:center; padding: 40px 0;">
                    <div style="font-size: 2rem; margin-bottom: 12px;">🔄</div>
                    <p style="font-size: 1rem; font-weight: 600;">復元中...</p>
                </div>
            `;

            const data = _ensureKeys(parsed.data);
            _cache = data;
            _lsWrite(data);

            const payload = _stripToRequiredKeys(data);
            const res = await fetch(JSONBIN_BASE, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': JSONBIN_API_KEY
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('JSONBin保存失敗');

            overlay.querySelector('div').innerHTML = `
                <div style="text-align:center; padding: 40px 0;">
                    <div style="font-size: 2rem; margin-bottom: 12px;">✅</div>
                    <p style="font-size: 1rem; font-weight: 600;">${_countItems(data)}件のデータを復元しました</p>
                    <p style="color: #6c757d; font-size: 0.85rem;">ページをリロードします...</p>
                </div>
            `;

            setTimeout(() => location.reload(), 1500);
        } catch (e) {
            alert('復元に失敗しました: ' + e.message);
        }
    };

    function mount() { document.body.appendChild(overlay); }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
}

// ============================================================
// ステータスバー
// ============================================================

let _statusEl = null;
let _statusTimer = null;

function _initStatusBar() {
    if (_statusEl) return;
    if (!document.body) return;
    const bar = document.createElement('div');
    bar.id = 'jb-sync-status';
    bar.style.cssText = `
        position: fixed;
        bottom: 16px;
        right: 16px;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 0.82rem;
        font-weight: 500;
        font-family: 'Noto Sans JP', sans-serif;
        z-index: 99998;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        transition: opacity 0.4s, transform 0.4s;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
    `;
    document.body.appendChild(bar);
    _statusEl = bar;
}

function _showStatus(icon, text, color, bgColor, autoHide) {
    if (!document.body) return;
    _initStatusBar();
    _statusEl.textContent = icon + ' ' + text;
    _statusEl.style.color = color;
    _statusEl.style.background = bgColor;
    _statusEl.style.opacity = '1';
    _statusEl.style.transform = 'translateY(0)';
    if (_statusTimer) clearTimeout(_statusTimer);
    if (autoHide) {
        _statusTimer = setTimeout(() => {
            _statusEl.style.opacity = '0';
            _statusEl.style.transform = 'translateY(10px)';
        }, autoHide);
    }
}

function _statusSyncing()  { _showStatus('🔄', '同期中...',  '#065fd4', '#e8f0fe', 0); }
function _statusSaving()   { _showStatus('💾', '保存中...',  '#b45309', '#fef3c7', 0); }
function _statusDone()     { _showStatus('✅', '同期完了',   '#16a34a', '#dcfce7', 3000); }
function _statusSaved()    { _showStatus('✅', '保存完了',   '#16a34a', '#dcfce7', 2500); }
function _statusOffline()  { _showStatus('⚠️', 'オフライン', '#dc2626', '#fee2e2', 5000); }
function _statusLoading()  { _showStatus('📡', 'データ取得中...', '#065fd4', '#e8f0fe', 0); }
function _statusCached()   { _showStatus('⚡', 'キャッシュから読み込み', '#6b7280', '#f3f4f6', 2000); }

// ============================================================
// localStorage
// ============================================================

function _lsRead() {
    try {
        const raw = localStorage.getItem(LS_DATA_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        _ensureKeys(data);
        if (!_hasData(data)) {
            localStorage.removeItem(LS_DATA_KEY);
            localStorage.removeItem(LS_TS_KEY);
            return null;
        }
        return data;
    } catch (e) {
        localStorage.removeItem(LS_DATA_KEY);
        localStorage.removeItem(LS_TS_KEY);
        return null;
    }
}

function _lsWrite(data) {
    if (!_hasData(data)) {
        console.warn('⛔ 空データの保存をブロック');
        return;
    }
    try {
        localStorage.setItem(LS_DATA_KEY, JSON.stringify(data));
        localStorage.setItem(LS_TS_KEY, String(Date.now()));
    } catch (e) {
        console.warn('localStorageキャッシュ書き込み失敗:', e);
    }
}

// ============================================================
// JSONBin取得
// ============================================================

async function _fetchFromJsonBin() {
    const res = await fetch(`${JSONBIN_BASE}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    if (!res.ok) throw new Error(`JSONBin読み込み失敗: ${res.status}`);
    const json = await res.json();
    return _ensureKeys(json.record || {});
}

// ============================================================
// バックグラウンド同期
// ============================================================

function _bgRefresh() {
    if (_bgRefreshDone) return;
    _bgRefreshDone = true;

    if (sessionStorage.getItem('jb_bg_reloaded')) {
        sessionStorage.removeItem('jb_bg_reloaded');
        _statusDone();
        return;
    }

    _statusSyncing();

    _fetchFromJsonBin()
        .then(fresh => {
            if (!_hasData(fresh)) {
                console.warn('⛔ JSONBinから空データ受信 → 無視');
                _statusDone();
                return;
            }

            const oldStr = JSON.stringify(_cache);
            const newStr = JSON.stringify(fresh);

            if (oldStr === newStr) {
                _statusDone();
                return;
            }

            _cache = fresh;
            _lsWrite(fresh);
            _saveBackup(fresh);
            sessionStorage.setItem('jb_bg_reloaded', '1');
            location.reload();
        })
        .catch(e => {
            console.warn('⚠️ バックグラウンド同期失敗:', e);
            _statusOffline();
        });
}

// ============================================================
// コアAPI
// ============================================================

async function jbLoad() {
    const lsData = _lsRead();
    if (lsData) {
        _cache = lsData;
        _statusCached();
        _bgRefresh();
        return _cache;
    }

    _statusLoading();
    try {
        const data = await _fetchFromJsonBin();
        _cache = data;

        if (_hasData(data)) {
            _lsWrite(data);
            _saveBackup(data);
            _bgRefreshDone = true;
            _statusDone();
            return _cache;
        }

        console.warn('⚠️ JSONBinもキャッシュも空');
        const backups = _getBackups();
        if (backups.length > 0) {
            _showRestoreUI(backups);
        }
        _bgRefreshDone = true;
        _cache = _ensureKeys({});
        return _cache;

    } catch (e) {
        console.error('JSONBin読み込みエラー:', e);
        _statusOffline();

        const backups = _getBackups();
        if (backups.length > 0) {
            _showRestoreUI(backups);
        }

        _cache = _ensureKeys({});
        return _cache;
    }
}

async function jbSave(data) {
    _cache = data;

    if (!_hasData(data)) {
        console.warn('⛔ 空データのため保存をブロック（localStorage・JSONBin両方）');
        _statusDone();
        return;
    }

    _lsWrite(data);
    _saveBackup(data);

    if (_saving) { _pendingSave = true; return; }
    _saving = true;
    _statusSaving();
    try {
        // 自分のキーだけにフィルタしてPUT（他ツールのキー混入を防止）
        const payload = _stripToRequiredKeys(data);
        const res = await fetch(JSONBIN_BASE, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`JSONBin保存失敗: ${res.status}`);
        _statusSaved();
    } catch (e) {
        console.error('JSONBin保存エラー:', e);
        _statusOffline();
    } finally {
        _saving = false;
        if (_pendingSave) {
            _pendingSave = false;
            await jbSave(_cache);
        }
    }
}

async function jbGetCache() {
    if (!_cache) await jbLoad();
    return _cache;
}

function jbUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ============================================================
// テーブル操作 API
// ============================================================

async function jbGetAll(table) {
    const cache = await jbGetCache();
    return [...(cache[table] || [])];
}

async function jbGetOne(table, id) {
    const cache = await jbGetCache();
    return (cache[table] || []).find(r => r.id === id) || null;
}

async function jbCreate(table, data) {
    const cache = await jbGetCache();
    const record = {
        ...data,
        id: data.id || jbUUID(),
        created_at: Date.now(),
        updated_at: Date.now()
    };
    if (!Array.isArray(cache[table])) cache[table] = [];
    cache[table].push(record);
    await jbSave(cache);
    return record;
}

async function jbUpdate(table, id, data) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) cache[table] = [];
    const idx = cache[table].findIndex(r => r.id === id);
    const record = { ...data, id, updated_at: Date.now() };
    if (idx >= 0) {
        cache[table][idx] = record;
    } else {
        cache[table].push(record);
    }
    await jbSave(cache);
    return record;
}

async function jbPatch(table, id, data) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) cache[table] = [];
    const idx = cache[table].findIndex(r => r.id === id);
    if (idx < 0) throw new Error(`レコードが見つかりません: ${id}`);
    cache[table][idx] = { ...cache[table][idx], ...data, updated_at: Date.now() };
    await jbSave(cache);
    return cache[table][idx];
}

async function jbDelete(table, id) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) return;
    cache[table] = cache[table].filter(r => r.id !== id);
    await jbSave(cache);
}
