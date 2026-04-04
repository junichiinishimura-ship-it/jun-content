/**
 * バックアップ・リストア機能
 * SheetJS (xlsx) を使ってExcelファイルに全データを出力・読み込みする
 */

// ========== バックアップ（Excel出力） ==========
async function backupToExcel() {
    try {
        showBackupStatus('loading', 'データを取得中...');

        // JSONBinから全データ取得
        const cache = await jbGetCache();

        const wb = XLSX.utils.book_new();

        // --- 動画シート ---
        const videos = (cache.videos || []).map(v => ({
            'ID': v.id || '',
            'タイトル': v.title || '',
            '説明': v.description || '',
            'ステータス': v.status || '',
            '進捗(%)': v.progress || 0,
            'サムネイルURL': v.thumbnail_url || '',
            '完成動画URL': v.video_url || '',
            '公開予定日': v.scheduled_date || '',
            '編集者': Array.isArray(v.editors) ? v.editors.join(', ') : '',
            '予算': v.budget || 0,
            '参考URL': Array.isArray(v.reference_urls) ? v.reference_urls.join('\n') : '',
            'メモ': v.notes || '',
            '作成日時': v.created_at ? new Date(v.created_at).toLocaleString('ja-JP') : '',
        }));
        const wsVideos = XLSX.utils.json_to_sheet(videos.length ? videos : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsVideos, '動画管理');

        // --- 編集者シート ---
        const editors = (cache.editors || []).map(e => ({
            'ID': e.id || '',
            '名前': e.name || '',
            '役割': e.role || '',
            '権限': e.permissions || '',
            '表示順': e.sort_order || '',
            'メモ': e.notes || '',
            '稼働中': e.active !== false ? 'はい' : 'いいえ',
        }));
        const wsEditors = XLSX.utils.json_to_sheet(editors.length ? editors : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsEditors, '編集者');

        // --- リンクシート ---
        const links = (cache.links || []).map(l => ({
            'ID': l.id || '',
            'タイトル': l.title || '',
            'URL': l.url || '',
            '説明': l.description || '',
            'お気に入り': l.is_favorite ? 'はい' : 'いいえ',
            '作成日時': l.created_at ? new Date(l.created_at).toLocaleString('ja-JP') : '',
        }));
        const wsLinks = XLSX.utils.json_to_sheet(links.length ? links : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsLinks, 'リンク');

        // --- 講座シート ---
        const courses = (cache.ec_courses || []).map(c => ({
            'ID': c.id || '',
            'タイトル': c.title || '',
            '説明': c.description || '',
            'ステータス': c.status || '',
            '表示順': c.sort_order || '',
        }));
        const wsCourses = XLSX.utils.json_to_sheet(courses.length ? courses : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsCourses, '講座');

        // --- 講座動画シート ---
        const courseVideos = (cache.ec_course_videos || []).map(v => ({
            'ID': v.id || '',
            '講座ID': v.course_id || '',
            'タイトル': v.title || '',
            '説明': v.description || '',
            'ステータス': v.status || '',
            '動画URL': v.video_url || '',
            '資料URL': v.material_url || '',
            '編集者': Array.isArray(v.editors) ? v.editors.join(', ') : '',
            '予算': v.budget || 0,
            '表示順': v.sort_order || '',
        }));
        const wsCourseVideos = XLSX.utils.json_to_sheet(courseVideos.length ? courseVideos : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsCourseVideos, '講座動画');

        // --- 無料特典グループシート ---
        const bonusGroups = (cache.bonus_groups || []).map(g => ({
            'ID': g.id || '',
            'タイトル': g.title || '',
            '説明': g.description || '',
            '表示順': g.sort_order || '',
        }));
        const wsBonusGroups = XLSX.utils.json_to_sheet(bonusGroups.length ? bonusGroups : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsBonusGroups, '特典グループ');

        // --- 無料特典シート ---
        const bonusItems = (cache.bonus_items || []).map(i => ({
            'ID': i.id || '',
            'グループID': i.group_id || '',
            'タイトル': i.title || '',
            '説明': i.description || '',
            'サムネイルURL': i.thumbnail_url || '',
            '格納リンク': i.content_url || '',
            '表示順': i.sort_order || '',
        }));
        const wsBonusItems = XLSX.utils.json_to_sheet(bonusItems.length ? bonusItems : [{ '※データなし': '' }]);
        XLSX.utils.book_append_sheet(wb, wsBonusItems, '無料特典');

        // ファイル名に日付をつけてダウンロード
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        XLSX.writeFile(wb, `YouTube管理バックアップ_${dateStr}.xlsx`);

        showBackupStatus('success', 'バックアップ完了！Excelファイルをダウンロードしました ✅');
    } catch (e) {
        console.error('バックアップエラー:', e);
        showBackupStatus('error', 'バックアップに失敗しました: ' + e.message);
    }
}

// ========== リストア（Excelインポート） ==========
function restoreFromExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm(`「${file.name}」からデータを復元しますか？\n\n⚠️ 現在のJSONBin上のデータは上書きされます。\nこの操作は元に戻せません。`)) return;

        try {
            showBackupStatus('loading', 'ファイルを読み込み中...');

            const arrayBuffer = await file.arrayBuffer();
            const wb = XLSX.read(arrayBuffer, { type: 'array' });

            // 現在のデータを取得（シートにないテーブルは保持）
            const cache = await jbGetCache();

            // シート名→テーブルキーのマッピング
            const sheetMap = {
                '動画管理':   { key: 'videos',           mapper: rowToVideo },
                '編集者':     { key: 'editors',          mapper: rowToEditor },
                'リンク':     { key: 'links',            mapper: rowToLink },
                '講座':       { key: 'ec_courses',       mapper: rowToCourse },
                '講座動画':   { key: 'ec_course_videos', mapper: rowToCourseVideo },
                '特典グループ':{ key: 'bonus_groups',    mapper: rowToBonusGroup },
                '無料特典':   { key: 'bonus_items',      mapper: rowToBonusItem },
            };

            let restoredCount = 0;
            for (const [sheetName, { key, mapper }] of Object.entries(sheetMap)) {
                if (!wb.SheetNames.includes(sheetName)) continue;
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws);
                // 「※データなし」行は除外
                const validRows = rows.filter(r => !r['※データなし']);
                if (validRows.length > 0) {
                    cache[key] = validRows.map(mapper).filter(r => r !== null);
                    restoredCount += cache[key].length;
                }
            }

            showBackupStatus('loading', 'JSONBinに保存中...');
            await jbSave(cache);

            showBackupStatus('success', `リストア完了！${restoredCount}件のデータを復元しました ✅\nページを再読み込みします...`);
            setTimeout(() => location.reload(), 2000);
        } catch (e) {
            console.error('リストアエラー:', e);
            showBackupStatus('error', 'リストアに失敗しました: ' + e.message);
        }
    };
    input.click();
}

// ========== 行データ → オブジェクト変換 ==========
function rowToVideo(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        title: row['タイトル'] || '',
        description: row['説明'] || '',
        status: row['ステータス'] || 'planning',
        progress: Number(row['進捗(%)']) || 0,
        thumbnail_url: row['サムネイルURL'] || '',
        video_url: row['完成動画URL'] || '',
        scheduled_date: row['公開予定日'] || '',
        editors: row['編集者'] ? row['編集者'].split(',').map(s => s.trim()).filter(Boolean) : [],
        budget: Number(row['予算']) || 0,
        reference_urls: row['参考URL'] ? row['参考URL'].split('\n').map(s => s.trim()).filter(Boolean) : [],
        notes: row['メモ'] || '',
        script_sections: [],
        created_at: Date.now(),
        updated_at: Date.now(),
    };
}

function rowToEditor(row) {
    if (!row['名前']) return null;
    return {
        id: row['ID'] || jbUUID(),
        name: row['名前'] || '',
        role: row['役割'] || '',
        permissions: row['権限'] || '',
        sort_order: Number(row['表示順']) || 999,
        notes: row['メモ'] || '',
        active: row['稼働中'] !== 'いいえ',
        updated_at: Date.now(),
    };
}

function rowToLink(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        title: row['タイトル'] || '',
        url: row['URL'] || '',
        description: row['説明'] || '',
        is_favorite: row['お気に入り'] === 'はい',
        created_at: Date.now(),
        updated_at: Date.now(),
    };
}

function rowToCourse(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        title: row['タイトル'] || '',
        description: row['説明'] || '',
        status: row['ステータス'] || 'draft',
        sort_order: Number(row['表示順']) || 999,
        updated_at: Date.now(),
    };
}

function rowToCourseVideo(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        course_id: row['講座ID'] || '',
        title: row['タイトル'] || '',
        description: row['説明'] || '',
        status: row['ステータス'] || 'planning',
        video_url: row['動画URL'] || '',
        material_url: row['資料URL'] || '',
        editors: row['編集者'] ? row['編集者'].split(',').map(s => s.trim()).filter(Boolean) : [],
        budget: Number(row['予算']) || 0,
        sort_order: Number(row['表示順']) || 999,
        script_sections: [],
        updated_at: Date.now(),
    };
}

function rowToBonusGroup(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        title: row['タイトル'] || '',
        description: row['説明'] || '',
        sort_order: Number(row['表示順']) || 999,
        updated_at: Date.now(),
    };
}

function rowToBonusItem(row) {
    if (!row['タイトル']) return null;
    return {
        id: row['ID'] || jbUUID(),
        group_id: row['グループID'] || '',
        title: row['タイトル'] || '',
        description: row['説明'] || '',
        thumbnail_url: row['サムネイルURL'] || '',
        content_url: row['格納リンク'] || '',
        sort_order: Number(row['表示順']) || 999,
        updated_at: Date.now(),
    };
}

// ========== ステータス表示 ==========
function showBackupStatus(type, message) {
    // 既存のトーストを削除
    const old = document.getElementById('backup-toast');
    if (old) old.remove();

    const colors = { loading: '#065fd4', success: '#28a745', error: '#dc3545' };
    const icons  = { loading: '⏳', success: '✅', error: '❌' };

    const toast = document.createElement('div');
    toast.id = 'backup-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors[type]};
        color: white;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 0.95rem;
        font-weight: 500;
        z-index: 99999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        white-space: pre-line;
        text-align: center;
        min-width: 280px;
        max-width: 90vw;
    `;
    toast.textContent = `${icons[type]} ${message}`;
    document.body.appendChild(toast);

    if (type !== 'loading') {
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
    }
}
