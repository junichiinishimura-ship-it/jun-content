/**
 * JSONBin.io を使った共有データストレージ
 * 
 * v5: 堅牢版
 *   - 空データは絶対にキャッシュに保存しない
 *   - キャッシュがあれば即表示 → 裏で最新チェック
 *   - 変更があり、かつデータが有効なら自動リロード
 *   - 右下にステータスバー表示
 */

const JSONBIN_BIN_ID  = '69a6c94bae596e708f5acd85';
const JSONBIN_API_KEY = '$2a$10$AvmWUg6WVIQyDh8CBFaWFOx40lKAW6cLjXrK97I2AmsG80a.4IOtO';
const JSONBIN_BASE    = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

const LS_DATA_KEY    = 'jb_cache_data';
const LS_TS_KEY      = 'jb_cache_ts';
const REQUIRED_KEYS  = ['videos','editors','links','ec_courses','ec_course_videos','bonus_groups','bonus_items'];

let _cache = null;
let _saving = false;
let _pendingSave = false;
let _bgRefreshDone = false;

// ============================================================
// データ検証: 中身が1件以上あるか
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
// localStorage ヘルパー（空データは絶対に保存しない）
// ============================================================

function _lsRead() {
    try {
        const raw = localStorage.getItem(LS_DATA_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        _ensureKeys(data);
        if (!_hasData(data)) {
            console.log('⚠️ キャッシュは空データ → 無視');
            localStorage.removeItem(LS_DATA_KEY);
            localStorage.removeItem(LS_TS_KEY);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('localStorageキャッシュ読み込み失敗:', e);
        localStorage.removeItem(LS_DATA_KEY);
        localStorage.removeItem(LS_TS_KEY);
        return null;
    }
}

function _lsWrite(data) {
    // ★ 空データは絶対に保存しない
    if (!_hasData(data)) {
        console.warn('⛔ 空データの保存をブロックしました');
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
// JSONBinからデータ取得（共通ヘルパー）
// ============================================================

async function _fetchFromJsonBin() {
    const res = await fetch(`${JSONBIN_BASE}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    if (!res.ok) throw new Error(`JSONBin読み込み失敗: ${res.status}`);
    const json = await res.json();
    const data = _ensureKeys(json.record || {});
    return data;
}

// ============================================================
// バックグラウンド同期
// ============================================================

function _bgRefresh() {
    if (_bgRefreshDone) return;
    _bgRefreshDone = true;

    // リロード直後はスキップ（ループ防止）
    if (sessionStorage.getItem('jb_bg_reloaded')) {
        sessionStorage.removeItem('jb_bg_reloaded');
        _statusDone();
        return;
    }

    _statusSyncing();

    _fetchFromJsonBin()
        .then(fresh => {
            // ★ JSONBinから空データが返ってきたら無視
            if (!_hasData(fresh)) {
                console.warn('⛔ JSONBinから空データ受信 → 無視（キャッシュを維持）');
                _statusDone();
                return;
            }

            const oldStr = JSON.stringify(_cache);
            const newStr = JSON.stringify(fresh);

            if (oldStr === newStr) {
                _statusDone();
                return;
            }

            // データ変更あり & 有効 → キャッシュ更新してリロード
            console.log('🔄 新しいデータを検出 → リロード');
            _cache = fresh;
            _lsWrite(fresh);
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
    // 1) キャッシュに有効なデータがあれば即採用
    const lsData = _lsRead();
    if (lsData) {
        _cache = lsData;
        _statusCached();
        _bgRefresh();
        return _cache;
    }

    // 2) キャッシュなし → JSONBinから取得
    _statusLoading();
    try {
        const data = await _fetchFromJsonBin();
        _cache = data;
        if (_hasData(data)) {
            _lsWrite(data);
        }
        _bgRefreshDone = true;
        _statusDone();
        return _cache;
    } catch (e) {
        console.error('JSONBin読み込みエラー:', e);
        _statusOffline();
        _cache = _ensureKeys({});
        return _cache;
    }
}

async function jbSave(data) {
    _cache = data;

    // ★ 空データチェック: localStorageもJSONBinも守る
    if (_hasData(data)) {
        _lsWrite(data);
    } else {
        console.warn('⛔ 空データのため保存をブロック（localStorage・JSONBin両方）');
        _statusDone();
        return;
    }

    if (_saving) { _pendingSave = true; return; }
    _saving = true;
    _statusSaving();
    try {
        const res = await fetch(JSONBIN_BASE, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(data)
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
