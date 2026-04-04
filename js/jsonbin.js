/**
 * JSONBin.io を使った共有データストレージ
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

// メモリキャッシュ（ページ内での高速アクセス用）
let _cache = null;
let _saving = false;
let _pendingSave = false;

/** BIN全体を読み込む */
async function jbLoad() {
    const res = await fetch(`${JSONBIN_BASE}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    if (!res.ok) throw new Error(`JSONBin読み込み失敗: ${res.status}`);
    const json = await res.json();
    _cache = json.record || {};
    // 必要なキーを保証
    const keys = ['videos','editors','links','ec_courses','ec_course_videos','bonus_groups','bonus_items'];
    keys.forEach(k => { if (!Array.isArray(_cache[k])) _cache[k] = []; });
    return _cache;
}

/** BIN全体を保存（連続呼び出しをまとめる） */
async function jbSave(data) {
    _cache = data;
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
// テーブル操作 API（Tables API互換インターフェース）
// =============================================

/** レコード一覧取得 */
async function jbGetAll(table) {
    const cache = await jbGetCache();
    return [...(cache[table] || [])];
}

/** レコード1件取得 */
async function jbGetOne(table, id) {
    const cache = await jbGetCache();
    return (cache[table] || []).find(r => r.id === id) || null;
}

/** レコード作成 */
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

/** レコード更新（全置換） */
async function jbUpdate(table, id, data) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) cache[table] = [];
    const idx = cache[table].findIndex(r => r.id === id);
    const record = {
        ...data,
        id,
        updated_at: Date.now()
    };
    if (idx >= 0) {
        cache[table][idx] = record;
    } else {
        cache[table].push(record);
    }
    await jbSave(cache);
    return record;
}

/** レコード部分更新 */
async function jbPatch(table, id, data) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) cache[table] = [];
    const idx = cache[table].findIndex(r => r.id === id);
    if (idx < 0) throw new Error(`レコードが見つかりません: ${id}`);
    cache[table][idx] = { ...cache[table][idx], ...data, updated_at: Date.now() };
    await jbSave(cache);
    return cache[table][idx];
}

/** レコード削除 */
async function jbDelete(table, id) {
    const cache = await jbGetCache();
    if (!Array.isArray(cache[table])) return;
    cache[table] = cache[table].filter(r => r.id !== id);
    await jbSave(cache);
}
