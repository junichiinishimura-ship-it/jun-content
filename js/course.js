// ===== Cloudinary 設定 =====
const CLOUDINARY_CLOUD_NAME = 'dp2wuji3x';
const CLOUDINARY_UPLOAD_PRESET = 'kouza_upload';

// 講座管理システム
class CourseManager {
    constructor() {
        this.courses = [];
        this.videos = [];        // 全コースの動画（全件キャッシュ）
        this.editors = [];
        this.selectedCourseId = null;
        this.scriptReferenceUrl = 'https://docs.google.com/spreadsheets/d/1YOrhhLhqAqneUC6VXYs5tRZPV3C1r6jHLNa8JzxaNzQ/edit?usp=sharing';
        this.scriptTemplate = this.getScriptTemplate();
        this.dragSrcIndex = null;
        this.init();
    }

    // ========== 初期化 ==========
    async init() {
        await Promise.all([
            this.loadEditors(),
            this.loadCourses(),
            this.loadAllVideos(),
        ]);
        this.renderCourseList();
        this.updateSummary();
        this.initTooltips();
    }

    // ========== データ読み込み ==========
    async loadEditors() {
        try {
            const all = await jbGetAll('editors');
            this.editors = all.filter(e => e.active !== false)
                .sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
        } catch { this.editors = []; }
    }

    async loadCourses() {
        try {
            const all = await jbGetAll('ec_courses');
            this.courses = all.sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
        } catch { this.courses = []; }
    }

    // コースの順番を逆にしてDBに保存
    async reverseCourseOrder() {
        this.courses = [...this.courses].reverse();
        await this.saveCourseSortOrder();
        this.renderCourseList();
        this.updateSummary();
    }

    async loadAllVideos() {
        try {
            const all = await jbGetAll('ec_course_videos');
            this.videos = all.sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
        } catch { this.videos = []; }
    }

    videosOfCourse(courseId) {
        return this.videos.filter(v => v.course_id === courseId)
            .sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
    }

    // ========== サマリー ==========
    updateSummary() {
        const allVideos = this.videos;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('sum-courses', this.courses.length);
        set('sum-videos', allVideos.length);
        set('sum-planning', allVideos.filter(v => v.status === 'planning').length);
        set('sum-inprogress', allVideos.filter(v => ['recording','editing'].includes(v.status)).length);
        set('sum-review', allVideos.filter(v => v.status === 'review').length);
        set('sum-published', allVideos.filter(v => v.status === 'published').length);
    }

    // ========== コース一覧レンダリング ==========
    renderCourseList() {
        const container = document.getElementById('courseList');
        const empty = document.getElementById('courseEmptyState');

        if (this.courses.length === 0) {
            container.innerHTML = '';
            container.appendChild(empty);
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';

        // 既存カード削除（empty以外）
        Array.from(container.children).forEach(c => { if (c !== empty) c.remove(); });

        this.courses.forEach((course, idx) => {
            const vids = this.videosOfCourse(course.id);
            const published = vids.filter(v => v.status === 'published').length;
            const card = document.createElement('div');
            card.className = 'card course-card mb-2 p-0' + (course.id === this.selectedCourseId ? ' active-course' : '');
            card.dataset.courseId = course.id;
            card.dataset.index = idx;
            card.draggable = true;

            const statusLabel = { draft: '下書き', active: '公開中', archived: 'アーカイブ' }[course.status] || course.status;
            const statusColor = { draft: 'secondary', active: 'success', archived: 'dark' }[course.status] || 'secondary';

            card.innerHTML = `
                <div class="card-body py-2 px-3 d-flex align-items-center gap-2">
                    <span class="drag-handle" title="ドラッグして並び替え"><i class="bi bi-grip-vertical"></i></span>
                    <div class="flex-grow-1 overflow-hidden" style="cursor:pointer;" onclick="courseManager.selectCourse('${course.id}')">
                        <div class="fw-semibold text-truncate">【${idx}章】 ${this.esc(course.title)}</div>
                        <div class="d-flex align-items-center gap-2 mt-1">
                            <span class="badge bg-${statusColor}">${statusLabel}</span>
                            <small class="text-muted">${vids.length}本 / 公開済み${published}</small>
                        </div>
                    </div>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-secondary action-btn p-1" onclick="event.stopPropagation();courseManager.editCourse('${course.id}')" data-tooltip="コースを編集" style="line-height:1;">
                            <i class="bi bi-pencil" style="font-size:.8rem;"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger action-btn p-1" onclick="event.stopPropagation();courseManager.confirmDelete('course','${course.id}','${this.esc(course.title)}')" data-tooltip="コースを削除" style="line-height:1;">
                            <i class="bi bi-trash" style="font-size:.8rem;"></i>
                        </button>
                    </div>
                </div>
            `;

            // ドラッグ＆ドロップ（コース並び替え＋動画受け入れ）
            card.addEventListener('dragstart', (e) => {
                this.dragSrcIndex = idx;
                this.dragVideoId = null;  // コースドラッグ中は動画IDなし
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.course-card').forEach(c => c.classList.remove('drag-over', 'drop-target'));
            });
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // 動画ドラッグ中なら別コースへの移動ターゲットとしてハイライト
                if (this.dragVideoId && this.dragVideoCourseId !== course.id) {
                    card.classList.add('drop-target');
                } else if (!this.dragVideoId) {
                    card.classList.add('drag-over');
                }
            });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over', 'drop-target'));
            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over', 'drop-target');

                // 動画をこのコースに移動
                if (this.dragVideoId && this.dragVideoCourseId !== course.id) {
                    const videoId = this.dragVideoId;
                    const targetCourseId = course.id;
                    this.dragVideoId = null;
                    this.dragSrcIndex = null;
                    try {
                        const newOrder = this.videosOfCourse(targetCourseId).length + 1;
                        await jbPatch('ec_course_videos', videoId, { course_id: targetCourseId, sort_order: newOrder });
                        await this.loadAllVideos();
                        this.renderCourseList();
                        this.renderVideoList();
                        this.updateSummary();
                        this.showNotification(`「${course.title}」に移動しました`, 'success');
                    } catch {
                        this.showNotification('移動に失敗しました', 'danger');
                    }
                    return;
                }

                // コースの並び替え（動画ドロップでない場合）
                const targetIdx = idx;
                if (this.dragSrcIndex === null || this.dragSrcIndex === targetIdx) return;
                const moved = this.courses.splice(this.dragSrcIndex, 1)[0];
                this.courses.splice(targetIdx, 0, moved);
                this.dragSrcIndex = null;
                await this.saveCourseSortOrder();
                this.renderCourseList();
            });

            container.appendChild(card);
        });
    }

    async saveCourseSortOrder() {
        await Promise.all(this.courses.map((c, i) =>
            jbPatch('ec_courses', c.id, { sort_order: i + 1 })
        ));
        // DBに保存後、ローカルの sort_order も更新
        this.courses.forEach((c, i) => { c.sort_order = i + 1; });
    }

    // ========== コース選択 ==========
    selectCourse(courseId) {
        this.selectedCourseId = courseId;
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;

        // サイドバー active 切り替え
        document.querySelectorAll('.course-card').forEach(c => {
            c.classList.toggle('active-course', c.dataset.courseId === courseId);
        });

        // 右パネル表示
        document.getElementById('noCourseSelected').style.display = 'none';
        document.getElementById('courseDetail').style.display = '';
        document.getElementById('detailCourseTitle').textContent = `【${this.courses.indexOf(course)}章】 ${course.title}`;
        document.getElementById('detailCourseDesc').textContent = course.description || '';

        this.renderVideoList();
    }

    // ========== 動画一覧レンダリング ==========
    renderVideoList() {
        const courseId = this.selectedCourseId;
        if (!courseId) return;

        const allVids = this.videosOfCourse(courseId);
        const active = allVids.filter(v => v.status !== 'published');
        const published = allVids.filter(v => v.status === 'published');

        // バッジ
        const ba = document.getElementById('badge-active'); if (ba) ba.textContent = active.length;
        const bp = document.getElementById('badge-published'); if (bp) bp.textContent = published.length;

        this.renderVideoListItems('activeVideoList', active, false);
        this.renderVideoListItems('publishedVideoList', published, true);
    }

    renderVideoListItems(containerId, videos, isPublished) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (videos.length === 0) {
            container.innerHTML = `
                <div class="empty-state py-5">
                    <i class="bi bi-${isPublished ? 'check-circle' : 'camera-video'} d-block mb-2" style="font-size:2.5rem;"></i>
                    <div>${isPublished ? '公開済みの動画はありません' : '動画がありません'}</div>
                    ${!isPublished ? '<small>「動画を追加」から動画を作成してください</small>' : ''}
                </div>`;
            return;
        }

        videos.forEach((video, idx) => {
            container.appendChild(this.createVideoItem(video, idx, videos.length, isPublished));
        });
    }

    createVideoItem(video, idx, total, isPublished) {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.dataset.videoId = video.id;
        item.dataset.index = idx;
        if (!isPublished) item.draggable = true;

        const statusClass = `status-${video.status}`;
        const statusText = this.getStatusText(video.status);
        const editorsText = (video.editors || []).join(', ') || '未設定';
        const budgetText = Number(video.budget) > 0
            ? `¥${new Intl.NumberFormat('ja-JP').format(video.budget)}`
            : '未設定';
        const progress = this.calcProgress(video.status);

        item.innerHTML = `
            ${!isPublished ? '<span class="drag-handle" title="ドラッグして並び替え"><i class="bi bi-grip-vertical"></i></span>' : '<span style="width:22px;flex-shrink:0;"></span>'}
            <div class="flex-grow-1 video-meta overflow-hidden">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-semibold">${this.esc(video.title)}</span>
                    ${isPublished
                        ? `<span class="status-badge status-published">✅ 公開済み</span>`
                        : `<div class="dropdown d-inline-block">
                            <span class="status-badge ${statusClass} dropdown-toggle" style="cursor:pointer;position:relative;padding-right:1.4rem;" data-bs-toggle="dropdown">
                                ${statusText}
                                <span style="position:absolute;right:.5rem;top:50%;transform:translateY(-50%);font-size:.7rem;opacity:.6;">▾</span>
                            </span>
                            <ul class="dropdown-menu dropdown-menu-sm">
                                ${['planning','recording','editing','review','published'].map(s =>
                                    `<li><a class="dropdown-item ${video.status===s?'active':''}" href="#" onclick="courseManager.quickChangeStatus('${video.id}','${s}');return false;">${this.getStatusEmoji(s)} ${this.getStatusText(s)}</a></li>`
                                ).join('')}
                            </ul>
                           </div>`
                    }
                </div>
                <div class="d-flex align-items-center gap-3 mt-1 flex-wrap">
                    <small class="text-muted"><i class="bi bi-person me-1"></i>${this.esc(editorsText)}</small>
                    <small class="text-muted"><i class="bi bi-currency-yen me-1"></i>${budgetText}</small>
                    ${video.video_url ? `<a href="${this.esc(video.video_url)}" target="_blank" class="badge bg-danger text-decoration-none" data-tooltip="動画を開く"><i class="bi bi-play-fill"></i> 開く</a>` : ''}
                    ${video.material_url ? `<a href="${this.esc(video.material_url)}" target="_blank" class="badge bg-primary text-decoration-none" data-tooltip="資料を開く"><i class="bi bi-file-earmark me-1"></i>資料</a>` : ''}
                </div>
                ${!isPublished ? `
                <div class="mt-2" style="max-width:220px;">
                    <div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div>
                </div>` : ''}
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-sm btn-outline-primary action-btn" onclick="courseManager.editVideo('${video.id}')" data-tooltip="動画情報を編集"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-secondary action-btn" onclick="courseManager.openScriptModal('${video.id}')" data-tooltip="台本を編集"><i class="bi bi-journal-text"></i></button>
                ${isPublished ? `<button class="btn btn-sm btn-outline-warning action-btn" onclick="courseManager.quickChangeStatus('${video.id}','review')" data-tooltip="レビュー中に戻す"><i class="bi bi-arrow-counterclockwise"></i></button>` : ''}
                <button class="btn btn-sm btn-outline-danger action-btn" onclick="courseManager.confirmDelete('video','${video.id}','${this.esc(video.title)}')" data-tooltip="この動画を削除"><i class="bi bi-trash"></i></button>
            </div>
        `;

        // ドラッグ＆ドロップ（動画並び替え＋コース間移動）
        if (!isPublished) {
            item.addEventListener('dragstart', (e) => {
                this.dragSrcIndex = idx;
                this.dragVideoId = video.id;          // コース間移動用
                this.dragVideoCourseId = video.course_id;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('videoId', video.id);
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.video-item').forEach(i => i.classList.remove('drag-over'));
                // コースカードのハイライトも解除
                document.querySelectorAll('.course-card').forEach(c => c.classList.remove('drop-target'));
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('drag-over');
            });
            item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const targetIdx = idx;
                if (this.dragSrcIndex === null || this.dragSrcIndex === targetIdx) return;

                const courseId = this.selectedCourseId;
                const courseVids = this.videosOfCourse(courseId).filter(v => v.status !== 'published');
                const moved = courseVids.splice(this.dragSrcIndex, 1)[0];
                courseVids.splice(targetIdx, 0, moved);
                this.dragSrcIndex = null;

                await this.saveVideoSortOrder(courseVids);
                await this.loadAllVideos();
                this.renderVideoList();
            });
        }

        return item;
    }

    async saveVideoSortOrder(orderedVideos) {
        await Promise.all(orderedVideos.map((v, i) =>
            jbPatch('ec_course_videos', v.id, { sort_order: i + 1 })
        ));
    }

    // ========== コースCRUD ==========
    showAddCourseModal() {
        document.getElementById('courseModalTitle').textContent = 'コース追加';
        document.getElementById('courseId').value = '';
        document.getElementById('courseTitle').value = '';
        document.getElementById('courseDescription').value = '';
        document.getElementById('courseStatus').value = 'draft';
        new bootstrap.Modal(document.getElementById('courseModal')).show();
    }

    editCourse(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;
        document.getElementById('courseModalTitle').textContent = 'コース編集';
        document.getElementById('courseId').value = course.id;
        document.getElementById('courseTitle').value = course.title;
        document.getElementById('courseDescription').value = course.description || '';
        document.getElementById('courseStatus').value = course.status || 'draft';
        new bootstrap.Modal(document.getElementById('courseModal')).show();
    }

    async saveCourse() {
        const title = document.getElementById('courseTitle').value.trim();
        if (!title) { this.showNotification('コース名を入力してください', 'warning'); return; }

        const id = document.getElementById('courseId').value;
        const body = {
            title,
            description: document.getElementById('courseDescription').value,
            status: document.getElementById('courseStatus').value,
            sort_order: id ? undefined : (this.courses.length + 1)
        };
        if (!id) delete body.sort_order; // 新規は末尾に

        try {
            let saved;
            if (id) {
                saved = await jbUpdate('ec_courses', id, { ...body, id });
            } else {
                body.sort_order = this.courses.length + 1;
                saved = await jbCreate('ec_courses', body);
            }
            bootstrap.Modal.getInstance(document.getElementById('courseModal')).hide();

            if (id) {
                // 編集時：ローカルの配列を直接更新して順番を維持
                const idx = this.courses.findIndex(c => c.id === id);
                if (idx !== -1) {
                    this.courses[idx] = { ...this.courses[idx], ...body, id };
                }
            } else {
                // 新規時：レスポンスのIDを使ってローカル配列の末尾に追加
                this.courses.push({ ...body, id: saved.id, sort_order: this.courses.length + 1 });
            }

            this.renderCourseList();
            this.updateSummary();
            if (id && id === this.selectedCourseId) {
                const course = this.courses.find(c => c.id === id);
                if (course) {
                    document.getElementById('detailCourseTitle').textContent = `【${this.courses.indexOf(course)}章】 ${course.title}`;
                    document.getElementById('detailCourseDesc').textContent = course.description || '';
                }
            }
            this.showNotification('コースを保存しました', 'success');
        } catch {
            this.showNotification('保存に失敗しました', 'danger');
        }
    }

    // ========== 動画CRUD ==========
    // videoCourseIdセレクトにコース一覧を描画
    renderCourseSelectInModal(selectedId) {
        const sel = document.getElementById('videoCourseId');
        if (!sel) return;
        sel.innerHTML = this.courses.map(c =>
            `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${this.esc(c.title)}</option>`
        ).join('');
    }

    showAddVideoModal() {
        if (!this.selectedCourseId) { this.showNotification('コースを選択してください', 'warning'); return; }
        document.getElementById('videoModalTitle').textContent = '動画追加';
        document.getElementById('videoId').value = '';
        this.renderCourseSelectInModal(this.selectedCourseId);
        document.getElementById('videoTitle').value = '';
        document.getElementById('videoDescription').value = '';
        document.getElementById('videoUrl').value = '';
        document.getElementById('videoMaterialUrl').value = '';
        document.getElementById('videoStatus').value = 'planning';
        document.getElementById('videoBudget').value = '';
        this.renderEditorChecklist([]);
        this.updateProgressPreview();
        new bootstrap.Modal(document.getElementById('videoModal')).show();
    }

    editVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        document.getElementById('videoModalTitle').textContent = '動画編集';
        document.getElementById('videoId').value = video.id;
        this.renderCourseSelectInModal(video.course_id);
        document.getElementById('videoTitle').value = video.title;
        document.getElementById('videoDescription').value = video.description || '';
        document.getElementById('videoUrl').value = video.video_url || '';
        document.getElementById('videoMaterialUrl').value = video.material_url || '';
        document.getElementById('videoStatus').value = video.status;
        document.getElementById('videoBudget').value = video.budget || '';
        this.renderEditorChecklist(video.editors || []);
        this.updateProgressPreview();
        new bootstrap.Modal(document.getElementById('videoModal')).show();
    }

    renderEditorChecklist(selected = []) {
        const container = document.getElementById('videoEditorChecklist');
        if (!container) return;
        if (this.editors.length === 0) {
            container.innerHTML = '<div class="text-muted small">編集者が登録されていません</div>';
            return;
        }
        container.innerHTML = this.editors.map(e => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${this.esc(e.name)}" id="ce-${e.id}" ${selected.includes(e.name) ? 'checked' : ''}>
                <label class="form-check-label" for="ce-${e.id}">${this.esc(e.name)}${e.role ? ` <span class="text-muted">(${e.role})</span>` : ''}</label>
            </div>
        `).join('');
    }

    updateProgressPreview() {
        const status = document.getElementById('videoStatus')?.value;
        const p = this.calcProgress(status);
        const bar = document.getElementById('videoProgressBar');
        const txt = document.getElementById('videoProgressText');
        if (bar) bar.style.width = p + '%';
        if (txt) txt.textContent = p + '%';
    }

    async saveVideo() {
        const title = document.getElementById('videoTitle').value.trim();
        if (!title) { this.showNotification('動画タイトルを入力してください', 'warning'); return; }

        const id = document.getElementById('videoId').value;
        const courseId = document.getElementById('videoCourseId').value;
        const status = document.getElementById('videoStatus').value;
        const editors = Array.from(document.querySelectorAll('#videoEditorChecklist input:checked')).map(i => i.value);

        const existing = this.videos.find(v => v.id === id);
        const body = {
            course_id: courseId,
            title,
            description: document.getElementById('videoDescription').value,
            status,
            progress: this.calcProgress(status),
            video_url: document.getElementById('videoUrl').value,
            material_url: document.getElementById('videoMaterialUrl').value,
            budget: Number(document.getElementById('videoBudget').value) || 0,
            editors,
            script_sections: existing?.script_sections || [],
            script_reference_url: existing?.script_reference_url || this.scriptReferenceUrl,
            sort_order: existing?.sort_order ?? (this.videosOfCourse(courseId).length + 1)
        };

        try {
            if (id) {
                await jbUpdate('ec_course_videos', id, { ...body, id });
                // 編集時：ローカルの配列を直接更新して順番を維持
                const idx = this.videos.findIndex(v => v.id === id);
                if (idx !== -1) {
                    this.videos[idx] = { ...this.videos[idx], ...body, id };
                }
            } else {
                await jbCreate('ec_course_videos', body);
                // 新規時：DBから再取得（IDを受け取るため）
                await this.loadAllVideos();
            }
            bootstrap.Modal.getInstance(document.getElementById('videoModal')).hide();

            // コースが変わった場合は移動先コースを選択状態にする
            this.selectedCourseId = courseId;
            this.renderCourseList();
            this.renderVideoList();
            this.updateSummary();
            // 公開済みになったら自動タブ切り替え
            if (status === 'published') {
                const tabBtn = document.getElementById('tab-published-btn');
                if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            }
            this.showNotification('動画を保存しました', 'success');
        } catch {
            this.showNotification('保存に失敗しました', 'danger');
        }
    }

    // ========== ステータスクイック変更 ==========
    async quickChangeStatus(videoId, newStatus) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;

        try {
            await jbPatch('ec_course_videos', videoId, { status: newStatus, progress: this.calcProgress(newStatus) });
            await this.loadAllVideos();
            this.renderCourseList();
            this.renderVideoList();
            this.updateSummary();
            // タブ自動切り替え
            if (newStatus === 'published') {
                const tabBtn = document.getElementById('tab-published-btn');
                if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            } else {
                const tabBtn = document.getElementById('tab-active-btn');
                if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            }
            this.showNotification(`ステータスを「${this.getStatusText(newStatus)}」に変更しました`, 'success');
        } catch {
            this.showNotification('ステータスの更新に失敗しました', 'danger');
        }
    }

    // ========== 削除 ==========
    confirmDelete(type, id, title) {
        const note = type === 'course'
            ? 'コースを削除するとコース内のすべての動画データも削除されます。'
            : 'この操作は元に戻せません。';
        document.getElementById('deleteTargetTitle').textContent = title;
        document.getElementById('deleteTargetNote').textContent = note;
        document.getElementById('confirmDeleteBtn').onclick = () => {
            if (type === 'course') this.deleteCourse(id);
            else this.deleteVideo(id);
        };
        new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
    }

    async deleteCourse(courseId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (modal) modal.hide();
        try {
            // コース内の動画を先に全削除
            const courseVids = this.videosOfCourse(courseId);
            await Promise.all(courseVids.map(v => jbDelete('ec_course_videos', v.id)));
            await jbDelete('ec_courses', courseId);
            if (this.selectedCourseId === courseId) {
                this.selectedCourseId = null;
                document.getElementById('noCourseSelected').style.display = '';
                document.getElementById('courseDetail').style.display = 'none';
            }
            await this.loadCourses();
            await this.loadAllVideos();
            this.renderCourseList();
            this.updateSummary();
            this.showNotification('コースを削除しました', 'success');
        } catch {
            this.showNotification('削除に失敗しました', 'danger');
        }
    }

    async deleteVideo(videoId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (modal) modal.hide();
        try {
            await jbDelete('ec_course_videos', videoId);
            await this.loadAllVideos();
            this.renderCourseList();
            this.renderVideoList();
            this.updateSummary();
            this.showNotification('動画を削除しました', 'success');
        } catch (e) {
            this.showNotification('削除に失敗しました: ' + e.message, 'danger');
        }
    }

    // ========== 台本 ==========
    openScriptModal(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;

        document.getElementById('scriptVideoId').value = videoId;
        document.getElementById('scriptModalVideoTitle').textContent = video.title;

        // 既存テキストを復元（旧形式の配列にも対応）
        let text = '';
        if (typeof video.script_text === 'string') {
            text = video.script_text;
        } else if (Array.isArray(video.script_sections) && video.script_sections.length > 0) {
            text = video.script_sections.map(s =>
                typeof s === 'string' ? s : (s.title ? `【${s.title}】\n` : '') + (s.content || '')
            ).join('\n\n');
        }
        document.getElementById('scriptTextarea').value = text;

        // プレビュートグルをリセット
        const tog = document.getElementById('scriptPreviewToggle');
        if (tog) { tog.checked = false; this.toggleScriptPreview(false); }

        new bootstrap.Modal(document.getElementById('scriptModal')).show();
        setTimeout(() => {
            this._initScriptDropZone();
            document.getElementById('scriptTextarea').focus();
        }, 350);
    }

    /** テキストエリアのドラッグ&ドロップ初期化（モーダル表示後に呼ぶ） */
    _initScriptDropZone() {
        const ta = document.getElementById('scriptTextarea');
        const overlay = document.getElementById('scriptDropOverlay');
        if (!ta || ta._dropInited) return;
        ta._dropInited = true;

        let dragCounter = 0;

        ta.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            if (e.dataTransfer.types.includes('Files')) {
                overlay.style.display = 'flex';
            }
        });
        ta.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        ta.addEventListener('dragleave', (e) => {
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                overlay.style.display = 'none';
            }
        });
        ta.addEventListener('drop', async (e) => {
            e.preventDefault();
            dragCounter = 0;
            overlay.style.display = 'none';
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length === 0) return;
            for (const file of files) {
                await this._uploadToCloudinary(file);
            }
        });

        // ドロップオーバーレイ上でのドラッグイベントも処理
        overlay.style.pointerEvents = 'none';
    }

    /** Cloudinaryへ画像をアップロードしてテキストエリアに挿入 */
    async _uploadToCloudinary(file) {
        const uploadingOverlay = document.getElementById('scriptUploadingOverlay');
        const fileNameEl = document.getElementById('scriptUploadFileName');

        uploadingOverlay.style.display = 'flex';
        if (fileNameEl) fileNameEl.textContent = file.name;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('folder', 'kouza_scripts');

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
                { method: 'POST', body: formData }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const url = data.secure_url;
            const alt = file.name.replace(/\.[^.]+$/, '');
            const ta = document.getElementById('scriptTextarea');
            this._insertAtCursor(ta, `\n![${alt}](${url})\n`);
            this.showNotification('画像をアップロードしました', 'success');
        } catch (err) {
            console.error('Cloudinary upload error:', err);
            this.showNotification(`アップロード失敗: ${err.message}`, 'danger');
        } finally {
            uploadingOverlay.style.display = 'none';
        }
    }

    /** ファイル選択inputからのアップロード */
    async _onFileInputChange(event) {
        const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
        event.target.value = '';
        for (const file of files) {
            await this._uploadToCloudinary(file);
        }
    }

    async saveScript() {
        const videoId = document.getElementById('scriptVideoId').value;
        const text = document.getElementById('scriptTextarea').value;

        try {
            await jbPatch('ec_course_videos', videoId, { script_text: text, script_sections: [] });
            bootstrap.Modal.getInstance(document.getElementById('scriptModal')).hide();
            await this.loadAllVideos();
            this.showNotification('台本を保存しました', 'success');
        } catch (e) {
            this.showNotification('台本の保存に失敗しました: ' + e.message, 'danger');
        }
    }

    // ========== 台本エディタ補助 ==========

    /** テキストエリアのカーソル位置に文字列を挿入 */
    _insertAtCursor(ta, text) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        ta.value = before + text + after;
        const pos = start + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
    }

    scriptInsert(type) {
        const ta = document.getElementById('scriptTextarea');
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);

        const map = {
            bold:    `**${selected || 'テキスト'}**`,
            heading: `\n## ${selected || '見出し'}\n`,
            bullet:  `\n- ${selected || '項目'}\n`,
            hr:      '\n---\n',
        };
        const insert = map[type];
        if (!insert) return;
        this._insertAtCursor(ta, insert);
    }

    scriptInsertImage() {
        // 画像挿入ダイアログを表示
        const modal = document.getElementById('imageInsertDialog');
        if (modal) {
            document.getElementById('imgUrlInput').value = '';
            document.getElementById('imgAltInput').value = '';
            document.getElementById('imgPreview').style.display = 'none';
            document.getElementById('imgPreview').src = '';
            modal.style.display = 'flex';
            document.getElementById('imgUrlInput').focus();
        }
    }

    _closeImageDialog() {
        const modal = document.getElementById('imageInsertDialog');
        if (modal) modal.style.display = 'none';
    }

    _confirmImageInsert() {
        const url = document.getElementById('imgUrlInput').value.trim();
        const alt = document.getElementById('imgAltInput').value.trim() || '画像';
        if (!url) return;
        const ta = document.getElementById('scriptTextarea');
        this._insertAtCursor(ta, `\n![${alt}](${url})\n`);
        this._closeImageDialog();
    }

    _previewImage() {
        const url = document.getElementById('imgUrlInput').value.trim();
        const prev = document.getElementById('imgPreview');
        const empty = document.getElementById('imgPreviewEmpty');
        const err = document.getElementById('imgPreviewError');
        if (url) {
            prev.src = url;
            prev.style.display = 'block';
            if (empty) empty.style.display = 'none';
            if (err) err.style.display = 'none';
        } else {
            prev.style.display = 'none';
            if (empty) empty.style.display = 'block';
            if (err) err.style.display = 'none';
        }
    }

    toggleScriptPreview(show) {
        const ta = document.getElementById('scriptTextarea');
        const pv = document.getElementById('scriptPreview');
        if (show) {
            // Markdown → HTML 簡易変換
            let html = ta.value
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                // 画像
                .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:min(100%,420px);height:auto;border-radius:6px;margin:8px 0;display:block;cursor:zoom-in;box-shadow:0 2px 8px rgba(0,0,0,.15);" onclick="this.style.maxWidth=this.style.maxWidth===\'100%\'?\'min(100%,420px)\':\'100%\';this.style.cursor=this.style.cursor===\'zoom-out\'?\'zoom-in\':\'zoom-out\';">')
                // リンク
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
                // 太字
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                // 見出し
                .replace(/^## (.+)$/gm, '<h2 style="font-size:1.2rem;font-weight:700;margin:1.2em 0 .4em;border-bottom:2px solid #e0e0e0;padding-bottom:.3em;">$1</h2>')
                .replace(/^# (.+)$/gm, '<h1 style="font-size:1.4rem;font-weight:700;margin:1.4em 0 .5em;">$1</h1>')
                // 区切り線
                .replace(/^---$/gm, '<hr style="border:none;border-top:2px solid #e0e0e0;margin:1em 0;">')
                // 箇条書き
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>)/gs, '<ul style="padding-left:1.4em;margin:.5em 0;">$1</ul>')
                // 改行
                .replace(/\n/g, '<br>');
            pv.innerHTML = html;
            ta.style.display = 'none';
            pv.style.display = 'block';
        } else {
            ta.style.display = 'block';
            pv.style.display = 'none';
        }
    }

    // ========== ツールチップ ==========
    initTooltips() {
        document.addEventListener('mouseenter', (e) => {
            const btn = e.target.closest('[data-tooltip]');
            if (!btn) return;
            this.showTooltip(btn, btn.dataset.tooltip);
        }, true);
        document.addEventListener('mouseleave', (e) => {
            if (e.target.closest('[data-tooltip]')) this.hideTooltip();
        }, true);
        document.addEventListener('click', () => this.hideTooltip(), true);
    }

    showTooltip(target, text) {
        this.hideTooltip();
        const tip = document.createElement('div');
        tip.id = 'custom-tooltip';
        tip.textContent = text;
        tip.style.cssText = 'position:fixed;background:rgba(30,30,30,.92);color:#fff;padding:5px 11px;border-radius:7px;font-size:.8rem;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .15s;opacity:0;';
        document.body.appendChild(tip);
        const rect = target.getBoundingClientRect();
        const tw = tip.offsetWidth;
        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.top - tip.offsetHeight - 8;
        if (left < 6) left = 6;
        if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;
        if (top < 6) top = rect.bottom + 8;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        requestAnimationFrame(() => requestAnimationFrame(() => { tip.style.opacity = '1'; }));
    }

    hideTooltip() {
        const old = document.getElementById('custom-tooltip');
        if (old) old.remove();
    }

    // ========== ユーティリティ ==========
    calcProgress(status) {
        return { planning: 20, recording: 40, editing: 70, review: 90, published: 100 }[status] || 0;
    }

    getStatusText(status) {
        return { planning: '計画中', recording: '収録中', editing: '編集中', review: 'レビュー中', published: '公開済み' }[status] || status;
    }

    getStatusEmoji(status) {
        return { planning: '📋', recording: '🎬', editing: '✂️', review: '👀', published: '✅' }[status] || '';
    }

    esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    showNotification(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        el.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:280px;';
        el.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
    }

    // ========== 台本テンプレート ==========
    getScriptTemplate() { return []; }

    // コースのインデックスから「【〇章】タイトル」を返す
    courseLabel(courseId) {
        const idx = this.courses.findIndex(c => c.id === courseId);
        const course = this.courses[idx];
        if (!course) return '';
        return `『${idx + 1}章』 ${course.title}`;
    }
}

// 起動
let courseManager;
document.addEventListener('DOMContentLoaded', () => {
    courseManager = new CourseManager();
});
