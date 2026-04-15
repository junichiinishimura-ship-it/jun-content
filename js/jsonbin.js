/**
 * JSONBin.io を使った共有データストレージ
 * 
 * v2.1: localStorage キャッシュ（stale-while-revalidate）
 *   - キャッシュがあれば即返す（JSONBinを待たない）
 *   - 裏でJSONBinから最新を取得し、localStorageだけ更新（UIは触らない）
 *   - 次回ページロード時に最新データが反映される
 * 
 * データ構造（1つのBINにまとめて保存）:
 * {
 *   videos: [...],
 *   editors: [...],
 *   links: [...],
 *   ec_courses: [...],
 *   ec_course_videos: [...],
 *   bonus_groups: [...],
 *   bonus_items: [...]
 * }
 */

const JSONBIN_BIN_ID  = '69a6c94bae596e708f5acd85';
const JSONBIN_API_KEY = '$2a$10$AvmWUg6WVIQyDh8CBFaWFOx40lKAW6cLjXrK97I2AmsG80a.4IOtO';
const JSONBIN_BASE    = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// ---- localStorage キャッシュ設定 ----
const LS_DATA_KEY    = 'jb_cache_data';
const LS_TS_KEY      = 'jb_cache_ts';
const REQUIRED_KEYS  = ['videos','editors','links','ec_courses','ec_course_videos','bonus_groups','bonus_items'];

// メモリキャッシュ
let _cache = null;
let _saving = false;
let _pendingSave = false;
let _bgRefreshDone = false;

// ---- localStorage ヘルパー ----

function _lsRead() {
    try {
        const raw = localStorage.getItem(LS_DATA_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        REQUIRED_KEYS.forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
        return data;
    } catch (e) {
        console.warn('localStorageキャッシュ読み込み失敗:', e);
        return null;
    }
}

function _lsWrite(data) {
    try {
        localStorage.setItem(LS_DATA_KEY, JSON.stringify(data));
        localStorage.setItem(LS_TS_KEY, String(Date.now()));
    } catch (e) {
        console.warn('localStorageキャッシュ書き込み失敗:', e);
    }
}

// ---- バックグラウンド同期（UIには一切触らない） ----

function _bgRefresh() {
    if (_bgRefreshDone) return;
    _bgRefreshDone = true;

    fetch(`${JSONBIN_BASE}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    })
    .then(res => {
        if (!res.ok) throw new Error(`JSONBin読み込み失敗: ${res.status}`);
        return res.json();
    })
    .then(json => {
        const fresh = json.record || {};
        REQUIRED_KEYS.forEach(k => { if (!Array.isArray(fresh[k])) fresh[k] = []; });
        // メモリキャッシュ + localStorage を静かに更新
        _cache = fresh;
        _lsWrite(fresh);
        console.log('🔄 バックグラウンド同期完了');
    })
    .catch(e => {
        console.warn('⚠️ バックグラウンド同期失敗:', e);
    });
}

// ---- コアAPI ----

/** BIN全体を読み込む */
async function jbLoad() {
    // 1) localStorageキャッシュがあれば即採用（JSONBinを待たない）
    const lsData = _lsRead();
    if (lsData) {
        _cache = lsData;
        console.log('⚡ キャッシュから即時ロード');
        // バックグラウンドで最新を取りに行く（awaitしない → UIに影響なし）
        _bgRefresh();
        return _cache;
    }

    // 2) キャッシュなし → JSONBinから取得（初回アクセスのみ）
    console.log('📡 初回ロード: JSONBinから取得中...');
    const res = await fetch(`${JSONBIN_BASE}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    if (!res.ok) throw new Error(`JSONBin読み込み失敗: ${res.status}`);
    const json = await res.json();
    _cache = json.record || {};
    REQUIRED_KEYS.forEach(k => { if (!Array.isArray(_cache[k])) _cache[k] = []; });
    _lsWrite(_cache);
    _bgRefreshDone = true;
    return _cache;
}

/** BIN全体を保存（即localStorage → 裏でJSONBin） */
async function jbSave(data) {
    _cache = data;
    _lsWrite(data);

    if (_saving) { _pendingSave = true; return; }
    _saving = true;
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
    } catch (e) {
        console.error('JSONBin保存エラー（localStorageには保存済み）:', e);
    } finally {
        _saving = false;
        if (_pendingSave) {
            _pendingSave = false;
            await jbSave(_cache);
        }
    }
}

/** キャッシュ取得（なければロード） */
async function jbGetCache() {
    if (!_cache) await jbLoad();
    return _cache;
}

/** UUID生成 */
function jbUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// =============================================
// テーブル操作 API
// =============================================

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
