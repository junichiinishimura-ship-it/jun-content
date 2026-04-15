// YouTube動画管理システム
class YouTubeManager {
    constructor() {
        this.videos = [];
        this.editors = [];
        this.currentFilter = '';
        this.currentSearch = '';
        this.currentEditorFilter = '';
        this._sortable = null;
        this.scriptReferenceUrl = 'https://docs.google.com/spreadsheets/d/1YOrhhLhqAqneUC6VXYs5tRZPV3C1r6jHLNa8JzxaNzQ/edit?usp=sharing';
        this.scriptTemplate = this.getScriptTemplate();
        this.init();
    }

    async init() {
        await this.loadEditors();
        await this.loadVideos();
        this.renderEditorChecklist();
        this.renderEditorFilterOptions();
        this.updateDashboard();
        this.updateMonthlyBudget();
        this.renderVideos();
        this.renderPublishedVideos();
        this.initTooltips();
        this.initKeyboardShortcuts();
    }

    // ツールチップを初期化（カスタム実装）
    initTooltips() {
        document.addEventListener('mouseenter', (e) => {
            const btn = e.target.closest('[data-tooltip]');
            if (!btn) return;
            this.showTooltip(btn, btn.dataset.tooltip);
        }, true);
        document.addEventListener('mouseleave', (e) => {
            const btn = e.target.closest('[data-tooltip]');
            if (!btn) return;
            this.hideTooltip();
        }, true);
        document.addEventListener('click', () => this.hideTooltip(), true);
    }

    showTooltip(target, text) {
        this.hideTooltip();
        const tooltip = document.createElement('div');
        tooltip.id = 'custom-tooltip';
        tooltip.textContent = text;
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(30,30,30,0.92);
            color: #fff;
            padding: 5px 11px;
            border-radius: 7px;
            font-size: 0.8rem;
            pointer-events: none;
            z-index: 99999;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            transition: opacity 0.15s;
            opacity: 0;
        `;
        document.body.appendChild(tooltip);

        const rect = target.getBoundingClientRect();
        const tw = tooltip.offsetWidth;
        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.top - tooltip.offsetHeight - 8;
        if (left < 6) left = 6;
        if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;
        if (top < 6) top = rect.bottom + 8;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        requestAnimationFrame(() => { tooltip.style.opacity = '1'; });
    }

    hideTooltip() {
        const old = document.getElementById('custom-tooltip');
        if (old) old.remove();
    }

    // キーボードショートカット
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (document.querySelector('.modal.show')) return;
            if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

            if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.showAddVideoModal();
            }
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }
        });
    }

    // 編集者データを読み込む
    async loadEditors() {
        try {
            this.editors = await jbGetAll('editors');
        } catch (error) {
            console.error('編集者データの読み込みに失敗しました:', error);
            this.editors = [];
            this.showNotification('編集者データの取得に失敗しました。', 'danger');
        }
    }

    getScriptTemplate() {
        return [
            {
                group: '前提の確認',
                items: [
                    { key: 'pre_theme', title: 'テーマの確認（タイトル・サムネ）' },
                    { key: 'pre_issue', title: '現状の課題' },
                    { key: 'pre_solution', title: '解決策' },
                    { key: 'pre_goal', title: 'ゴール（具体的なベネフィット）' },
                    { key: 'pre_structure', title: '台本の構成' }
                ]
            },
            {
                group: 'OP',
                items: [
                    { key: 'op_greeting', title: '挨拶・自己紹介（早く簡潔に）' },
                    { key: 'op_overview', title: '動画の概要（端的に動画内容を提示）' },
                    { key: 'op_title', title: 'タイトル回収（動画を見る理由を明確化）' },
                    { key: 'op_problem', title: 'Problem：悩みの代弁（視聴者に共感し代わりに言語化する）' },
                    { key: 'op_language', title: '悩みの言語化（具体例）' },
                    { key: 'op_experience', title: '実体験（昔の自分もあなたと同じだったことを提示）' },
                    { key: 'op_amplify', title: 'Amplify：問題の拡大（問題の重大さを提示）' },
                    { key: 'op_solution', title: 'Solution：解決策（具体的な行動を提示）' },
                    { key: 'op_transformation', title: 'Transformation：変革と証明（実績をもとに信憑性を高める）' },
                    { key: 'op_offer', title: 'Offer Response：LINE/チャンネル登録誘導（早く簡潔に）' }
                ]
            },
            {
                group: '本編（AREA）',
                items: [
                    { key: 'main_assertion_1', title: 'Assertion：衝撃の結論（×普通の結論）' },
                    { key: 'main_reason', title: 'Reason：根拠がある理由（理解しやすい例で問いかける）' },
                    { key: 'main_example', title: 'Example：具体例（気づきを与える）' },
                    { key: 'main_assertion_2', title: 'Assertion：再度結論の繰り返し' }
                ]
            },
            {
                group: 'ED',
                items: [
                    { key: 'ed_emotion', title: 'エモいメッセージ（自分のストーリー・想いを伝える）' },
                    { key: 'ed_offer', title: 'LINE誘導 or チャンネル登録誘導（行動するきっかけを作る）' },
                    { key: 'ed_review', title: '復習（話を整理し満足度を上げる）' },
                    { key: 'ed_ending', title: '評価誘導・エンディング挨拶（満足度を下げないため早く簡潔に）' }
                ]
            }
        ];
    }

    renderEditorChecklist() {
        // 新UIでは不要（addEditorAssignmentRowで動的生成）
    }

    // 編集者アサイン行を1行追加
    addEditorAssignmentRow(editorName = '', amount = '') {
        const list = document.getElementById('editorAssignmentList');
        if (!list) return;

        const activeEditors = this.editors
            .filter(e => e.active !== false)
            .sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));

        const options = activeEditors.map(e =>
            `<option value="${this.escapeHtml(e.name)}" ${e.name === editorName ? 'selected' : ''}>${this.escapeHtml(e.name)}${e.role ? ' (' + e.role + ')' : ''}</option>`
        ).join('');

        const div = document.createElement('div');
        div.className = 'd-flex gap-2 mb-2 editor-assign-row align-items-center';
        div.innerHTML = `
            <select class="form-select form-select-sm editor-assign-select" style="flex:2;">
                <option value="">編集者を選択</option>
                ${options}
            </select>
            <div class="input-group input-group-sm" style="flex:1.2;">
                <span class="input-group-text">¥</span>
                <input type="number" class="form-control editor-assign-amount" placeholder="" min="0" step="100" value="${amount}" oninput="youtubeManager.updateTotalBudgetDisplay()">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.editor-assign-row').remove(); youtubeManager.updateTotalBudgetDisplay();" data-tooltip="削除"><i class="bi bi-x"></i></button>
        `;
        list.appendChild(div);
        this.updateTotalBudgetDisplay();
    }

    // 合計発注額を更新表示
    updateTotalBudgetDisplay() {
        const amounts = Array.from(document.querySelectorAll('.editor-assign-amount'))
            .map(input => Number(input.value) || 0);
        const total = amounts.reduce((sum, v) => sum + v, 0);
        const el = document.getElementById('totalBudgetDisplay');
        if (el) el.textContent = `¥${new Intl.NumberFormat('ja-JP').format(total)}`;
    }

    // 編集者アサイン行リストをリセット（1行空で表示）
    resetEditorAssignmentList() {
        const list = document.getElementById('editorAssignmentList');
        if (!list) return;
        list.innerHTML = '';
        this.addEditorAssignmentRow();
    }

    // 編集者アサイン行からデータ取得
    getEditorAssignments() {
        return Array.from(document.querySelectorAll('.editor-assign-row'))
            .map(row => ({
                editor_name: row.querySelector('.editor-assign-select')?.value || '',
                amount: Number(row.querySelector('.editor-assign-amount')?.value) || 0
            }))
            .filter(a => a.editor_name !== '');
    }

    renderEditorFilterOptions() {
        const select = document.getElementById('editorFilter');
        if (!select) return;

        const activeEditors = this.editors
            .filter(editor => editor.active !== false)
            .sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));

        select.innerHTML = '<option value="">すべての編集者</option>' +
            activeEditors.map(editor => `<option value="${editor.name}">${editor.name}</option>`).join('');
    }

    // 動画データを読み込む（sort_order順に並べる）
    async loadVideos() {
        try {
            const all = await jbGetAll('videos');
            // sort_orderがあれば使い、なければcreated_at降順（新しい順）
            this.videos = all.sort((a, b) => {
                const sa = Number(a.sort_order) || 0;
                const sb = Number(b.sort_order) || 0;
                if (sa !== sb) return sa - sb;
                return (b.created_at || 0) - (a.created_at || 0); // 新しい順
            });
        } catch (error) {
            console.error('動画データの読み込みに失敗しました:', error);
            this.videos = [];
            this.showNotification('動画データの取得に失敗しました。', 'danger');
        }
    }

    // ダッシュボードを更新
    updateDashboard() {
        const counts = {
            planning: 0,
            recording: 0,
            editing: 0,
            review: 0,
            published: 0,
            total: this.videos.length
        };

        this.videos.forEach(video => {
            if (counts.hasOwnProperty(video.status)) {
                counts[video.status]++;
            }
        });

        Object.keys(counts).forEach(key => {
            const element = document.getElementById(`count-${key}`);
            if (element) element.textContent = counts[key];
        });

        const activeCount = this.videos.filter(v => v.status !== 'published').length;
        const publishedCount = counts.published;
        const badgeActive = document.getElementById('badge-active');
        const badgePublished = document.getElementById('badge-published');
        if (badgeActive) badgeActive.textContent = activeCount;
        if (badgePublished) badgePublished.textContent = publishedCount;
    }

    updateMonthlyBudget() {
        const table = document.getElementById('monthlyBudgetTable');
        if (!table) return;

        const formatter = new Intl.NumberFormat('ja-JP');
        const monthly = {};

        this.videos.forEach(video => {
            const dateValue = video.scheduled_date || video.created_at || new Date().toISOString();
            const date = new Date(dateValue);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthly[monthKey]) {
                monthly[monthKey] = { total: 0, count: 0 };
            }
            monthly[monthKey].total += Number(video.budget) || 0;
            monthly[monthKey].count += 1;
        });

        const rows = Object.keys(monthly)
            .sort((a, b) => b.localeCompare(a))
            .map(monthKey => {
                const data = monthly[monthKey];
                return `
                    <tr>
                        <td>${monthKey}</td>
                        <td>¥${formatter.format(data.total)}</td>
                        <td>${data.count}</td>
                    </tr>
                `;
            })
            .join('');

        table.innerHTML = rows || '<tr><td colspan="3" class="text-muted text-center py-3">データがありません</td></tr>';
    }

    // 動画をフィルタリング
    filterVideos() {
        this.currentFilter = document.getElementById('statusFilter').value;
        this.currentSearch = document.getElementById('searchInput').value.toLowerCase();
        const editorSelect = document.getElementById('editorFilter');
        this.currentEditorFilter = editorSelect ? editorSelect.value : '';
        this.renderVideos();
        this.renderPublishedVideos();
    }

    // 動画をレンダリング（進行中タブ：公開済みを除く）
    renderVideos() {
        const tbody = document.getElementById('videoTableBody');
        const filteredVideos = this.getFilteredVideos();

        tbody.innerHTML = '';

        if (filteredVideos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-5">
                        <i class="bi bi-inbox display-4 d-block mb-2"></i>
                        動画が見つかりません
                    </td>
                </tr>
            `;
            return;
        }

        filteredVideos.forEach((video, idx) => {
            const row = this.createVideoRow(video, idx);
            tbody.appendChild(row);
        });

        // ドラッグ＆ドロップ初期化
        this.initDragAndDrop(tbody, filteredVideos);

        const badge = document.getElementById('badge-active');
        if (badge) badge.textContent = filteredVideos.length;
    }

    // ドラッグ＆ドロップ初期化（SortableJS使用）
    initDragAndDrop(tbody, filteredVideos) {
        // 既存のSortableインスタンスを破棄
        if (this._sortable) {
            this._sortable.destroy();
            this._sortable = null;
        }

        if (typeof Sortable === 'undefined') {
            console.warn('SortableJS が読み込まれていません');
            return;
        }

        this._sortable = Sortable.create(tbody, {
            animation: 150,
            handle: '.drag-handle-icon',
            ghostClass: 'dragging-row',
            chosenClass: 'dragging-row',
            dragClass: 'dragging-row',
            forceFallback: false,
            onStart: () => {
                tbody.style.cursor = 'grabbing';
            },
            onEnd: async (evt) => {
                tbody.style.cursor = '';
                const oldIdx = evt.oldIndex;
                const newIdx = evt.newIndex;
                if (oldIdx === newIdx) return;

                // filteredVideos内での移動をthis.videos全体に反映
                const srcVideo = filteredVideos[oldIdx];
                const tgtVideo = filteredVideos[newIdx];
                if (!srcVideo || !tgtVideo) return;

                // this.videosから該当動画を取り出して新位置に挿入
                const srcIdxInAll = this.videos.findIndex(v => v.id === srcVideo.id);
                this.videos.splice(srcIdxInAll, 1);
                const newTgtIdxInAll = this.videos.findIndex(v => v.id === tgtVideo.id);
                this.videos.splice(
                    newTgtIdxInAll + (oldIdx < newIdx ? 1 : 0),
                    0,
                    srcVideo
                );

                // sort_order更新＆保存（UIはSortableが既に動かしているので再描画はしない）
                this.showNotification('並び順を保存中...', 'info');
                await this.saveVideoSortOrder();
                this.showNotification('並び順を保存しました ✅', 'success');
                this.updateDashboard();
            }
        });
    }

    // sort_orderをまとめて保存
    async saveVideoSortOrder() {
        // 全動画にsort_orderを振り直す（published含む）
        const activeVideos = this.videos.filter(v => v.status !== 'published');
        const publishedVideos = this.videos.filter(v => v.status === 'published');

        activeVideos.forEach((v, i) => { v.sort_order = i + 1; });
        publishedVideos.forEach((v, i) => { v.sort_order = 10000 + i + 1; });

        // キャッシュを直接更新して1回のPUTで保存
        try {
            const cache = await jbGetCache();
            cache.videos = this.videos;
            await jbSave(cache);
        } catch (e) {
            console.error('並び順保存エラー:', e);
            this.showNotification('並び順の保存に失敗しました', 'danger');
        }
    }

    // 公開済みタブをレンダリング
    renderPublishedVideos() {
        const tbody = document.getElementById('publishedTableBody');
        if (!tbody) return;

        const search = this.currentSearch || '';
        const editorFilter = this.currentEditorFilter || '';

        const published = this.videos.filter(video => {
            if (video.status !== 'published') return false;
            const editorsText = (() => {
                if (Array.isArray(video.editor_assignments) && video.editor_assignments.length > 0)
                    return video.editor_assignments.map(a => a.editor_name).join(' ').toLowerCase();
                return (video.editors || []).join(' ').toLowerCase();
            })();
            const matchesSearch = !search ||
                video.title.toLowerCase().includes(search) ||
                (video.description || '').toLowerCase().includes(search) ||
                editorsText.includes(search);
            const matchesEditor = !editorFilter ||
                editorsText.includes(editorFilter.toLowerCase());
            return matchesSearch && matchesEditor;
        });

        tbody.innerHTML = '';

        if (published.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="bi bi-check-circle display-4 d-block mb-2"></i>
                        公開済みの動画はありません
                    </td>
                </tr>
            `;
        } else {
            published
                .slice()
                .sort((a, b) => {
                    const da = a.scheduled_date || a.updated_at || '';
                    const db = b.scheduled_date || b.updated_at || '';
                    return db.localeCompare(da);
                })
                .forEach(video => {
                    tbody.appendChild(this.createPublishedRow(video));
                });
        }

        const badge = document.getElementById('badge-published');
        if (badge) badge.textContent = published.length;
    }

    // 公開済み行を作成
    createPublishedRow(video) {
        const tr = document.createElement('tr');
        const editorsHtml = (video.editors && video.editors.length > 0)
            ? video.editors.map(e => `<span class="badge bg-light text-dark border me-1">${e}</span>`).join('')
            : '<span class="text-muted">未設定</span>';
        const budgetText = Number(video.budget) > 0
            ? `¥${new Intl.NumberFormat('ja-JP').format(video.budget)}`
            : '未設定';
        const publishedDate = video.scheduled_date
            ? new Date(video.scheduled_date).toLocaleDateString('ja-JP')
            : '-';

        tr.innerHTML = `
            <td data-label="サムネイル">
                <img src="${video.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%23f0f0f0%22/%3E%3Ctext x=%2260%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2211%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E'}"
                     alt="サムネイル" class="video-thumbnail"
                     onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%23f0f0f0%22/%3E%3Ctext x=%2260%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2211%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E'"
                     onclick="youtubeManager.openVideo('${video.video_url || ''}')">
            </td>
            <td data-label="タイトル">
                <div class="fw-bold d-flex align-items-center gap-2 flex-wrap">
                    ${video.title}
                    ${video.video_url ? `<a href="${video.video_url}" target="_blank" class="badge bg-danger text-decoration-none" data-tooltip="完成動画をYouTubeで開く"><i class="bi bi-youtube"></i> 開く</a>` : ''}
                </div>
                <small class="text-muted">${(video.description || '').substring(0, 60)}${(video.description || '').length > 60 ? '...' : ''}</small>
                ${(() => {
                    const urls = Array.isArray(video.reference_urls) && video.reference_urls.length > 0
                        ? video.reference_urls
                        : (video.reference_url ? [video.reference_url] : []);
                    if (urls.length === 0) return '';
                    return '<div class="mt-1 d-flex flex-wrap gap-1">' + urls.map((url, i) =>
                        `<a href="${url}" target="_blank" class="badge bg-secondary text-decoration-none" data-tooltip="参考動画${urls.length > 1 ? i+1 : ''}を開く"><i class="bi bi-play-circle me-1"></i>参考${urls.length > 1 ? (i+1) : ''}</a>`
                    ).join('') + '</div>';
                })()} 
            </td>
            <td data-label="編集者 / 予算">
                <div class="mb-1">${editorsHtml}</div>
                <small class="text-muted">予算: ${budgetText}</small>
            </td>
            <td data-label="公開日">${publishedDate}</td>
            <td data-label="操作">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary action-btn" onclick="youtubeManager.editVideo('${video.id}')" data-tooltip="動画情報を編集">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary action-btn" onclick="youtubeManager.openScriptModal('${video.id}')" data-tooltip="台本を確認">
                        <i class="bi bi-journal-text"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning action-btn" onclick="youtubeManager.quickChangeStatus('${video.id}','review')" data-tooltip="レビュー中に戻す">
                        <i class="bi bi-arrow-counterclockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger action-btn" onclick="youtubeManager.confirmDeleteVideo('${video.id}', '${video.title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" data-tooltip="この動画を削除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        return tr;
    }

    // フィルタリングされた動画を取得（進行中のみ）
    getFilteredVideos() {
        return this.videos.filter(video => {
            if (video.status === 'published') return false;
            const matchesStatus = !this.currentFilter || video.status === this.currentFilter;
            const editorsText = (() => {
                if (Array.isArray(video.editor_assignments) && video.editor_assignments.length > 0)
                    return video.editor_assignments.map(a => a.editor_name).join(' ').toLowerCase();
                return (video.editors || []).join(' ').toLowerCase();
            })();
            const matchesSearch = !this.currentSearch ||
                video.title.toLowerCase().includes(this.currentSearch) ||
                (video.description || '').toLowerCase().includes(this.currentSearch) ||
                editorsText.includes(this.currentSearch);
            const matchesEditor = !this.currentEditorFilter ||
                editorsText.includes(this.currentEditorFilter.toLowerCase());
            return matchesStatus && matchesSearch && matchesEditor;
        });
    }

    // 動画行を作成
    createVideoRow(video, idx) {
        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.style.cursor = 'grab';
        const statusClass = `status-${video.status}`;
        const statusText = this.getStatusText(video.status);
        const progressWidth = Math.min(Math.max(video.progress || 0, 0), 100);
        const scheduledDate = video.scheduled_date ? new Date(video.scheduled_date).toLocaleDateString('ja-JP') : '-';
        const editorsHtml = (() => {
            const assignments = Array.isArray(video.editor_assignments) && video.editor_assignments.length > 0
                ? video.editor_assignments
                : (Array.isArray(video.editors) && video.editors.length > 0
                    ? video.editors.map(name => ({ editor_name: name, amount: 0 }))
                    : []);
            if (assignments.length === 0) return '<span class="text-muted">未設定</span>';
            return assignments.map(a => {
                const amtText = a.amount > 0 ? ` <small class="text-muted">¥${new Intl.NumberFormat('ja-JP').format(a.amount)}</small>` : '';
                return `<span class="badge bg-light text-dark border me-1">${this.escapeHtml(a.editor_name)}${amtText}</span>`;
            }).join('');
        })();
        const budgetText = Number(video.budget) > 0
            ? `¥${new Intl.NumberFormat('ja-JP').format(video.budget)}`
            : '未設定';

        tr.innerHTML = `
            <td data-label="サムネイル" style="position:relative;">
                <span class="drag-handle-icon" title="ドラッグして並び替え">⠿</span>
                <img src="${video.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%23f0f0f0%22/%3E%3Ctext x=%2260%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2211%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
                     alt="サムネイル" class="video-thumbnail" 
                     onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%23f0f0f0%22/%3E%3Ctext x=%2260%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2211%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E'"
                     onclick="youtubeManager.openVideo('${video.video_url}')">
            </td>
            <td data-label="タイトル">
                <div class="fw-bold">${video.title}</div>
                <small class="text-muted">${video.description?.substring(0, 50) || ''}${video.description?.length > 50 ? '...' : ''}</small>
                ${(() => {
                    const urls = Array.isArray(video.reference_urls) && video.reference_urls.length > 0
                        ? video.reference_urls
                        : (video.reference_url ? [video.reference_url] : []);
                    if (urls.length === 0) return '';
                    return '<div class="mt-1 d-flex flex-wrap gap-1">' + urls.map((url, i) =>
                        `<a href="${url}" target="_blank" class="badge bg-secondary text-decoration-none" data-tooltip="参考動画${urls.length > 1 ? i+1 : ''}を開く"><i class="bi bi-play-circle me-1"></i>参考${urls.length > 1 ? (i+1) : ''}</a>`
                    ).join('') + '</div>';
                })()} 
            </td>
            <td data-label="編集者 / 予算">
                <div class="mb-1">${editorsHtml}</div>
                <small class="text-muted">予算: ${budgetText}</small>
            </td>
            <td data-label="ステータス">
                <div class="dropdown">
                    <span class="status-badge ${statusClass} dropdown-toggle" style="cursor:pointer;" data-bs-toggle="dropdown" title="クリックでステータス変更">${statusText}</span>
                    <ul class="dropdown-menu dropdown-menu-sm">
                        <li><a class="dropdown-item ${video.status==='planning'?'active':''}" href="#" onclick="youtubeManager.quickChangeStatus('${video.id}','planning');return false;">📋 計画中</a></li>
                        <li><a class="dropdown-item ${video.status==='recording'?'active':''}" href="#" onclick="youtubeManager.quickChangeStatus('${video.id}','recording');return false;">🎬 収録中</a></li>
                        <li><a class="dropdown-item ${video.status==='editing'?'active':''}" href="#" onclick="youtubeManager.quickChangeStatus('${video.id}','editing');return false;">✂️ 編集中</a></li>
                        <li><a class="dropdown-item ${video.status==='review'?'active':''}" href="#" onclick="youtubeManager.quickChangeStatus('${video.id}','review');return false;">👀 レビュー中</a></li>
                        <li><a class="dropdown-item ${video.status==='published'?'active':''}" href="#" onclick="youtubeManager.quickChangeStatus('${video.id}','published');return false;">✅ 公開済み</a></li>
                    </ul>
                </div>
            </td>
            <td data-label="進捗">
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar" role="progressbar" style="width: ${progressWidth}%"></div>
                </div>
                <small class="text-muted">${progressWidth}%</small>
            </td>
            <td data-label="公開予定">${scheduledDate}</td>
            <td data-label="操作">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary action-btn" onclick="youtubeManager.editVideo('${video.id}')" data-tooltip="動画情報を編集">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary action-btn" onclick="youtubeManager.openScriptModal('${video.id}')" data-tooltip="台本を編集">
                        <i class="bi bi-journal-text"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger action-btn" onclick="youtubeManager.confirmDeleteVideo('${video.id}', '${video.title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" data-tooltip="この動画を削除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;

        return tr;
    }

    // ステータステキストを取得
    getStatusText(status) {
        const statusMap = {
            planning: '計画中',
            recording: '収録中',
            editing: '編集中',
            review: 'レビュー中',
            published: '公開済み'
        };
        return statusMap[status] || status;
    }

    // 動画追加モーダルを表示
    showAddVideoModal() {
        document.getElementById('modalTitle').textContent = '新規動画追加';
        document.getElementById('videoForm').reset();
        document.getElementById('videoId').value = '';
        document.getElementById('thumbnailPreview').classList.add('d-none');
        // 参考動画URLリストをリセット（1行だけ残す）
        this.resetReferenceUrlList();
        // 編集者アサインリストをリセット（1行だけ残す）
        this.resetEditorAssignmentList();
        this.updateProgress();
        new bootstrap.Modal(document.getElementById('videoModal')).show();
    }

    // 参考動画URLリストをリセット
    resetReferenceUrlList() {
        const list = document.getElementById('referenceUrlList');
        if (!list) return;
        list.innerHTML = '';
        this.addReferenceUrlField();
    }

    // 参考動画URL入力フィールドを追加
    addReferenceUrlField(value = '') {
        const list = document.getElementById('referenceUrlList');
        if (!list) return;
        const div = document.createElement('div');
        div.className = 'd-flex gap-2 mb-1 ref-url-row';
        div.innerHTML = `
            <input type="url" class="form-control form-control-sm ref-url-input" placeholder="" value="${this.escapeHtml(value)}">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.ref-url-row').remove()" data-tooltip="削除"><i class="bi bi-x"></i></button>
        `;
        list.appendChild(div);
    }

    // 参考動画URLリストから値を取得
    getReferenceUrls() {
        return Array.from(document.querySelectorAll('#referenceUrlList .ref-url-input'))
            .map(input => input.value.trim())
            .filter(url => url !== '');
    }

    // 文字列のHTMLエスケープ
    escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // 動画編集
    editVideo(id) {
        const video = this.videos.find(v => v.id === id);
        if (!video) return;

        document.getElementById('modalTitle').textContent = '動画情報編集';
        document.getElementById('videoId').value = video.id;
        document.getElementById('title').value = video.title;
        document.getElementById('description').value = video.description || '';
        document.getElementById('status').value = video.status;
        document.getElementById('thumbnailUrl').value = video.thumbnail_url || '';
        document.getElementById('videoUrl').value = video.video_url || '';
        document.getElementById('scheduledDate').value = video.scheduled_date || '';

        // 参考動画URL（複数）をセット
        const list = document.getElementById('referenceUrlList');
        if (list) {
            list.innerHTML = '';
            const urls = Array.isArray(video.reference_urls) && video.reference_urls.length > 0
                ? video.reference_urls
                : (video.reference_url ? [video.reference_url] : []);
            if (urls.length > 0) {
                urls.forEach(url => this.addReferenceUrlField(url));
            } else {
                this.addReferenceUrlField();
            }
        }

        // 編集者アサインリストをセット
        const assignList = document.getElementById('editorAssignmentList');
        if (assignList) {
            assignList.innerHTML = '';
            const assignments = Array.isArray(video.editor_assignments) && video.editor_assignments.length > 0
                ? video.editor_assignments
                : (Array.isArray(video.editors) && video.editors.length > 0
                    ? video.editors.map(name => ({ editor_name: name, amount: 0 }))
                    : []);
            if (assignments.length > 0) {
                assignments.forEach(a => this.addEditorAssignmentRow(a.editor_name || '', a.amount || ''));
            } else {
                this.addEditorAssignmentRow();
            }
        }

        this.previewThumbnail();
        this.updateProgress();
        new bootstrap.Modal(document.getElementById('videoModal')).show();
    }

    // 動画を保存
    async saveVideo() {
        const videoId = document.getElementById('videoId').value;
        const status = document.getElementById('status').value;
        const assignments = this.getEditorAssignments();
        const totalBudget = assignments.reduce((sum, a) => sum + a.amount, 0);
        const baseData = {
            title: document.getElementById('title').value.trim(),
            description: document.getElementById('description').value || '',
            status: status,
            progress: this.calculateProgress(status),
            thumbnail_url: document.getElementById('thumbnailUrl').value || '',
            video_url: document.getElementById('videoUrl').value || '',
            reference_urls: this.getReferenceUrls(),
            scheduled_date: document.getElementById('scheduledDate').value || '',
            editor_assignments: assignments,
            editors: assignments.map(a => a.editor_name),
            budget: totalBudget
        };

        if (!baseData.title.trim()) {
            this.showNotification('動画タイトルを入力してください', 'warning');
            return;
        }

        try {
            if (videoId) {
                const existingVideo = this.videos.find(v => v.id === videoId);
                const formData = {
                    ...baseData,
                    id: videoId,
                    script_sections: existingVideo?.script_sections || [],
                    script_reference_url: existingVideo?.script_reference_url || this.scriptReferenceUrl,
                    views: existingVideo?.views || 0,
                    likes: existingVideo?.likes || 0,
                    comments: existingVideo?.comments || 0,
                    notes: existingVideo?.notes || ''
                };
                await jbUpdate('videos', videoId, formData);
            } else {
                const formData = {
                    ...baseData,
                    sort_order: 0,   // 新規は常に先頭（sort_order=0が最小）
                    script_sections: [],
                    script_reference_url: this.scriptReferenceUrl,
                    views: 0,
                    likes: 0,
                    comments: 0,
                    notes: ''
                };
                await jbCreate('videos', formData);
            }

            bootstrap.Modal.getInstance(document.getElementById('videoModal')).hide();
            await this.loadVideos();

            // 新規追加の場合、ロード後にsort_orderを振り直して先頭固定
            if (!videoId) {
                await this.saveVideoSortOrder();
            }

            this.updateDashboard();
            this.updateMonthlyBudget();
            this.renderVideos();
            this.renderPublishedVideos();
            this.showNotification('動画情報を保存しました', 'success');
        } catch (error) {
            console.error('保存エラー:', error);
            this.showNotification('保存に失敗しました：' + error.message, 'danger');
        }
    }

    // ステータスから進捗を計算
    calculateProgress(status) {
        const progressMap = {
            planning: 20,
            recording: 40,
            editing: 70,
            review: 90,
            published: 100
        };
        return progressMap[status] || 0;
    }

    // 進捗を更新
    updateProgress() {
        const status = document.getElementById('status').value;
        const progress = this.calculateProgress(status);
        document.getElementById('progressBar').style.width = `${progress}%`;
        document.getElementById('progressText').textContent = `${progress}%`;
    }

    // サムネイルをプレビュー
    previewThumbnail() {
        const url = document.getElementById('thumbnailUrl').value;
        const preview = document.getElementById('thumbnailPreview');
        
        if (url) {
            preview.src = url;
            preview.classList.remove('d-none');
        } else {
            preview.classList.add('d-none');
        }
    }

    openScriptModal(id) {
        const video = this.videos.find(v => v.id === id);
        if (!video) return;

        document.getElementById('scriptVideoId').value = id;
        const referenceInput = document.getElementById('scriptReferenceUrl');
        referenceInput.value = video.script_reference_url || this.scriptReferenceUrl;

        const container = document.getElementById('scriptSectionsContainer');
        const savedSections = Array.isArray(video.script_sections) ? video.script_sections : [];
        const savedMap = savedSections.reduce((acc, section) => {
            if (section && section.key) {
                acc[section.key] = section.content || '';
            }
            return acc;
        }, {});

        container.innerHTML = this.scriptTemplate
            .map(group => {
                const itemsHtml = group.items
                    .map(item => `
                        <div class="script-section">
                            <h6>${item.title}</h6>
                            <textarea class="form-control" rows="3" data-script-key="${item.key}">${savedMap[item.key] || ''}</textarea>
                        </div>
                    `)
                    .join('');
                return `
                    <div class="mb-4">
                        <h5 class="mb-3">${group.group}</h5>
                        ${itemsHtml}
                    </div>
                `;
            })
            .join('');

        new bootstrap.Modal(document.getElementById('scriptModal')).show();
    }

    async saveScript() {
        const id = document.getElementById('scriptVideoId').value;
        const video = this.videos.find(v => v.id === id);
        if (!video) return;

        const referenceUrl = document.getElementById('scriptReferenceUrl').value || this.scriptReferenceUrl;
        const sections = Array.from(document.querySelectorAll('#scriptSectionsContainer [data-script-key]'))
            .map(textarea => {
                const key = textarea.dataset.scriptKey;
                const templateItem = this.scriptTemplate.flatMap(group => group.items).find(item => item.key === key);
                return {
                    key,
                    title: templateItem ? templateItem.title : key,
                    content: textarea.value
                };
            });

        const updatedVideo = {
            ...video,
            script_sections: sections,
            script_reference_url: referenceUrl
        };

        try {
            await jbUpdate('videos', id, updatedVideo);
            bootstrap.Modal.getInstance(document.getElementById('scriptModal')).hide();
            await this.loadVideos();
            this.updateDashboard();
            this.updateMonthlyBudget();
            this.renderVideos();
            this.renderPublishedVideos();
            this.showNotification('台本を保存しました', 'success');
        } catch (error) {
            console.error('台本保存エラー:', error);
            this.showNotification('台本の保存に失敗しました', 'danger');
        }
    }

    // 削除確認モーダルを表示
    confirmDeleteVideo(id, title) {
        const modal = document.getElementById('deleteConfirmModal');
        document.getElementById('deleteVideoTitle').textContent = title;
        document.getElementById('confirmDeleteBtn').onclick = () => this.deleteVideo(id);
        new bootstrap.Modal(modal).show();
    }

    // 動画を削除
    async deleteVideo(id) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (modal) modal.hide();

        try {
            await jbDelete('videos', id);
            await this.loadVideos();
            this.updateDashboard();
            this.updateMonthlyBudget();
            this.renderVideos();
            this.renderPublishedVideos();
            this.showNotification('動画を削除しました', 'success');
        } catch (error) {
            console.error('削除エラー:', error);
            this.showNotification('動画の削除に失敗しました', 'danger');
        }
    }

    // ステータスをクイック変更
    async quickChangeStatus(id, newStatus) {
        const video = this.videos.find(v => v.id === id);
        if (!video) return;

        const updatedVideo = {
            ...video,
            status: newStatus,
            progress: this.calculateProgress(newStatus)
        };

        try {
            await jbUpdate('videos', id, updatedVideo);
            await this.loadVideos();
            this.updateDashboard();
            this.updateMonthlyBudget();
            this.renderVideos();
            this.renderPublishedVideos();
            const statusText = this.getStatusText(newStatus);
            if (newStatus === 'published') {
                const tabBtn = document.getElementById('tab-published-btn');
                if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            } else {
                const tabBtn = document.getElementById('tab-active-btn');
                if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            }
            this.showNotification(`ステータスを「${statusText}」に変更しました`, 'success');
        } catch (error) {
            console.error('ステータス更新エラー:', error);
            this.showNotification('ステータスの更新に失敗しました', 'danger');
        }
    }

    // 動画を開く
    openVideo(url) {
        if (url) {
            window.open(url, '_blank');
        }
    }

    // 通知を表示
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// グローバル変数
let youtubeManager;

// 初期化
function initYouTubeManager() {
    if (!youtubeManager) {
        youtubeManager = new YouTubeManager();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initYouTubeManager);
} else {
    initYouTubeManager();
}

function ensureYouTubeManager() {
    if (!youtubeManager) {
        initYouTubeManager();
    }
    return youtubeManager;
}

// グローバル関数
function showAddVideoModal() {
    ensureYouTubeManager().showAddVideoModal();
}

function filterVideos() {
    ensureYouTubeManager().filterVideos();
}

function updateProgress() {
    ensureYouTubeManager().updateProgress();
}

function previewThumbnail() {
    ensureYouTubeManager().previewThumbnail();
}

function saveVideo() {
    ensureYouTubeManager().saveVideo();
}

function saveScript() {
    ensureYouTubeManager().saveScript();
}

function confirmDeleteVideo(id, title) {
    ensureYouTubeManager().confirmDeleteVideo(id, title);
}
