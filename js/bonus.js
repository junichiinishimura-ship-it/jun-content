// 無料特典管理システム
class BonusManager {
    constructor() {
        this.groups = [];
        this.items  = [];   // 全グループの特典（全件キャッシュ）
        this.selectedGroupId = null;
        this.dragSrcIndex = null;
        this.init();
    }

    // ========== 初期化 ==========
    async init() {
        await Promise.all([this.loadGroups(), this.loadAllItems()]);
        this.renderGroupList();
        this.updateSummary();
        this.initTooltips();
    }

    // ========== データ読み込み ==========
    async loadGroups() {
        try {
            const all = await jbGetAll('bonus_groups');
            this.groups = all.sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
        } catch { this.groups = []; }
    }

    async loadAllItems() {
        try {
            const all = await jbGetAll('bonus_items');
            this.items = all.sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
        } catch { this.items = []; }
    }

    itemsOfGroup(groupId) {
        return this.items
            .filter(i => i.group_id === groupId)
            .sort((a, b) => (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999));
    }

    // ========== サマリー ==========
    updateSummary() {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const withUrl  = this.items.filter(i => i.content_url).length;
        const withoutUrl = this.items.length - withUrl;
        set('sum-groups',   this.groups.length);
        set('sum-items',    this.items.length);
        set('sum-with-url', withUrl);
        set('sum-no-url',   withoutUrl);
    }

    // ========== グループ一覧レンダリング ==========
    renderGroupList() {
        const container = document.getElementById('groupList');
        const empty     = document.getElementById('groupEmptyState');

        if (this.groups.length === 0) {
            container.innerHTML = '';
            container.appendChild(empty);
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        Array.from(container.children).forEach(c => { if (c !== empty) c.remove(); });

        this.groups.forEach((group, idx) => {
            const count = this.itemsOfGroup(group.id).length;
            const card  = document.createElement('div');
            card.className = 'card group-card mb-2' + (group.id === this.selectedGroupId ? ' active-group' : '');
            card.dataset.groupId = group.id;
            card.dataset.index   = idx;
            card.draggable = true;

            card.innerHTML = `
                <div class="card-body py-2 px-3 d-flex align-items-center gap-2">
                    <span class="drag-handle" title="ドラッグして並び替え"><i class="bi bi-grip-vertical"></i></span>
                    <div class="flex-grow-1 overflow-hidden" style="cursor:pointer;" onclick="bonusManager.selectGroup('${group.id}')">
                        <div class="fw-semibold text-truncate">${this.esc(group.title)}</div>
                        <small class="text-muted">${count}件の特典</small>
                    </div>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-secondary action-btn p-1"
                            onclick="event.stopPropagation();bonusManager.editGroup('${group.id}')"
                            data-tooltip="グループを編集" style="line-height:1;">
                            <i class="bi bi-pencil" style="font-size:.8rem;"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger action-btn p-1"
                            onclick="event.stopPropagation();bonusManager.confirmDelete('group','${group.id}','${this.esc(group.title)}')"
                            data-tooltip="グループを削除" style="line-height:1;">
                            <i class="bi bi-trash" style="font-size:.8rem;"></i>
                        </button>
                    </div>
                </div>
            `;

            // ドラッグ＆ドロップ（グループ並び替え）
            card.addEventListener('dragstart', (e) => {
                this.dragSrcIndex = idx;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.group-card').forEach(c => c.classList.remove('drag-over'));
            });
            card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const targetIdx = idx;
                if (this.dragSrcIndex === null || this.dragSrcIndex === targetIdx) return;
                const moved = this.groups.splice(this.dragSrcIndex, 1)[0];
                this.groups.splice(targetIdx, 0, moved);
                this.dragSrcIndex = null;
                await this.saveGroupSortOrder();
                this.renderGroupList();
            });

            container.appendChild(card);
        });
    }

    async saveGroupSortOrder() {
        await Promise.all(this.groups.map((g, i) =>
            jbPatch('bonus_groups', g.id, { sort_order: i + 1 })
        ));
        this.groups.forEach((g, i) => { g.sort_order = i + 1; });
    }

    // ========== グループ選択 ==========
    selectGroup(groupId) {
        this.selectedGroupId = groupId;
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        document.querySelectorAll('.group-card').forEach(c =>
            c.classList.toggle('active-group', c.dataset.groupId === groupId)
        );

        document.getElementById('noGroupSelected').style.display  = 'none';
        document.getElementById('groupDetail').style.display = '';
        document.getElementById('detailGroupTitle').textContent = group.title;
        document.getElementById('detailGroupDesc').textContent  = group.description || '';

        this.renderItemList();
    }

    // ========== 特典一覧レンダリング ==========
    renderItemList() {
        const groupId   = this.selectedGroupId;
        if (!groupId) return;
        const items     = this.itemsOfGroup(groupId);
        const container = document.getElementById('itemList');
        const empty     = document.getElementById('itemEmptyState');

        // emptyState を container に戻す
        if (!container.contains(empty)) container.appendChild(empty);

        // 既存カード削除
        Array.from(container.children).forEach(c => { if (c !== empty) c.remove(); });

        if (items.length === 0) {
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';

        items.forEach((item, idx) => {
            container.appendChild(this.createItemCard(item, idx));
        });
    }

    createItemCard(item, idx) {
        const card = document.createElement('div');
        card.className = 'bonus-card';
        card.dataset.itemId = item.id;
        card.dataset.index  = idx;
        card.draggable = true;

        const hasThumb = !!item.thumbnail_url;
        const thumbHtml = hasThumb
            ? `<img src="${this.esc(item.thumbnail_url)}" class="bonus-thumb" alt="サムネイル"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                    onclick="bonusManager.openUrl('${this.esc(item.content_url || '')}')">
               <div class="bonus-thumb-placeholder" style="display:none;"><i class="bi bi-image-fill"></i></div>`
            : `<div class="bonus-thumb-placeholder"><i class="bi bi-image"></i></div>`;

        card.innerHTML = `
            <span class="drag-handle mt-1" title="ドラッグして並び替え"><i class="bi bi-grip-vertical"></i></span>
            ${thumbHtml}
            <div class="flex-grow-1 overflow-hidden">
                <div class="fw-semibold mb-1">${this.esc(item.title)}</div>
                ${item.description ? `<div class="text-muted small mb-2">${this.esc(item.description)}</div>` : ''}
                ${item.content_url
                    ? `<a href="${this.esc(item.content_url)}" target="_blank"
                            class="badge text-decoration-none"
                            style="background:var(--bonus-color);"
                            data-tooltip="格納リンクを開く">
                            <i class="bi bi-link-45deg me-1"></i>格納リンクを開く
                        </a>`
                    : `<span class="badge bg-warning text-dark">URLなし</span>`
                }
            </div>
            <div class="d-flex flex-column gap-1 flex-shrink-0">
                <button class="btn btn-sm btn-outline-primary action-btn"
                    onclick="bonusManager.editItem('${item.id}')"
                    data-tooltip="特典を編集">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger action-btn"
                    onclick="bonusManager.confirmDelete('item','${item.id}','${this.esc(item.title)}')"
                    data-tooltip="特典を削除">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;

        // ドラッグ＆ドロップ（特典並び替え）
        card.addEventListener('dragstart', (e) => {
            this.dragSrcIndex = idx;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.bonus-card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const targetIdx = idx;
            if (this.dragSrcIndex === null || this.dragSrcIndex === targetIdx) return;
            const groupItems = this.itemsOfGroup(this.selectedGroupId);
            const moved = groupItems.splice(this.dragSrcIndex, 1)[0];
            groupItems.splice(targetIdx, 0, moved);
            this.dragSrcIndex = null;
            await this.saveItemSortOrder(groupItems);
            await this.loadAllItems();
            this.renderItemList();
        });

        return card;
    }

    async saveItemSortOrder(orderedItems) {
        await Promise.all(orderedItems.map((item, i) =>
            jbPatch('bonus_items', item.id, { sort_order: i + 1 })
        ));
    }

    openUrl(url) {
        if (url) window.open(url, '_blank');
    }

    // ========== グループ CRUD ==========
    showAddGroupModal() {
        document.getElementById('groupModalTitle').textContent = 'グループ追加';
        document.getElementById('groupId').value = '';
        document.getElementById('groupTitle').value = '';
        document.getElementById('groupDescription').value = '';
        new bootstrap.Modal(document.getElementById('groupModal')).show();
    }

    editGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;
        document.getElementById('groupModalTitle').textContent = 'グループ編集';
        document.getElementById('groupId').value = group.id;
        document.getElementById('groupTitle').value = group.title;
        document.getElementById('groupDescription').value = group.description || '';
        new bootstrap.Modal(document.getElementById('groupModal')).show();
    }

    async saveGroup() {
        const title = document.getElementById('groupTitle').value.trim();
        if (!title) { this.showNotification('グループ名を入力してください', 'warning'); return; }

        const id   = document.getElementById('groupId').value;
        const body = {
            title,
            description: document.getElementById('groupDescription').value,
            sort_order: id ? undefined : (this.groups.length + 1)
        };
        if (!id) body.sort_order = this.groups.length + 1; else delete body.sort_order;

        try {
            if (id) {
                await jbUpdate('bonus_groups', id, { ...body, id });
            } else {
                await jbCreate('bonus_groups', { ...body, sort_order: this.groups.length + 1 });
            }
            bootstrap.Modal.getInstance(document.getElementById('groupModal')).hide();
            await this.loadGroups();
            this.renderGroupList();
            this.updateSummary();
            // 編集中なら右パネルのタイトルも更新
            if (id && id === this.selectedGroupId) {
                const updated = this.groups.find(g => g.id === id);
                if (updated) {
                    document.getElementById('detailGroupTitle').textContent = updated.title;
                    document.getElementById('detailGroupDesc').textContent  = updated.description || '';
                }
            }
            this.showNotification('グループを保存しました', 'success');
        } catch (e) { this.showNotification('保存に失敗しました: ' + e.message, 'danger'); }
    }

    // ========== 特典 CRUD ==========
    showAddItemModal() {
        if (!this.selectedGroupId) { this.showNotification('グループを選択してください', 'warning'); return; }
        document.getElementById('itemModalTitle').textContent = '特典追加';
        document.getElementById('itemId').value = '';
        document.getElementById('itemGroupId').value = this.selectedGroupId;
        document.getElementById('itemTitle').value = '';
        document.getElementById('itemDescription').value = '';
        document.getElementById('itemThumbnailUrl').value = '';
        document.getElementById('itemContentUrl').value = '';
        this.resetThumbPreview();
        new bootstrap.Modal(document.getElementById('itemModal')).show();
    }

    editItem(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        document.getElementById('itemModalTitle').textContent = '特典編集';
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemGroupId').value = item.group_id;
        document.getElementById('itemTitle').value = item.title;
        document.getElementById('itemDescription').value = item.description || '';
        document.getElementById('itemThumbnailUrl').value = item.thumbnail_url || '';
        document.getElementById('itemContentUrl').value = item.content_url || '';
        this.previewThumb();
        new bootstrap.Modal(document.getElementById('itemModal')).show();
    }

    async saveItem() {
        const title = document.getElementById('itemTitle').value.trim();
        if (!title) { this.showNotification('特典名を入力してください', 'warning'); return; }

        const id      = document.getElementById('itemId').value;
        const groupId = document.getElementById('itemGroupId').value;
        const body = {
            group_id:      groupId,
            title,
            description:    document.getElementById('itemDescription').value,
            thumbnail_url:  document.getElementById('itemThumbnailUrl').value,
            content_url:    document.getElementById('itemContentUrl').value,
            sort_order:     id ? (this.items.find(i => i.id === id)?.sort_order ?? 999) : (this.itemsOfGroup(groupId).length + 1)
        };

        try {
            if (id) {
                await jbUpdate('bonus_items', id, { ...body, id });
            } else {
                await jbCreate('bonus_items', body);
            }
            bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
            await this.loadAllItems();
            this.renderGroupList();
            this.renderItemList();
            this.updateSummary();
            this.showNotification('特典を保存しました', 'success');
        } catch (e) { this.showNotification('保存に失敗しました: ' + e.message, 'danger'); }
    }

    // ========== サムネプレビュー ==========
    previewThumb() {
        const url     = document.getElementById('itemThumbnailUrl').value.trim();
        const preview = document.getElementById('thumbPreview');
        const placeholder = document.getElementById('thumbPlaceholder');
        if (url) {
            preview.src = url;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            this.resetThumbPreview();
        }
    }

    resetThumbPreview() {
        const preview = document.getElementById('thumbPreview');
        const placeholder = document.getElementById('thumbPlaceholder');
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        if (placeholder) placeholder.style.display = 'flex';
    }

    // ========== 削除 ==========
    confirmDelete(type, id, title) {
        const note = type === 'group'
            ? 'グループを削除するとグループ内のすべての特典も削除されます。'
            : 'この操作は元に戻せません。';
        document.getElementById('deleteTargetTitle').textContent = title;
        document.getElementById('deleteTargetNote').textContent  = note;
        document.getElementById('confirmDeleteBtn').onclick = () => {
            if (type === 'group') this.deleteGroup(id);
            else                  this.deleteItem(id);
        };
        new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
    }

    async deleteGroup(groupId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (modal) modal.hide();
        try {
            // グループ内の特典を先に全削除
            await Promise.all(this.itemsOfGroup(groupId).map(i =>
                jbDelete('bonus_items', i.id)
            ));
            await jbDelete('bonus_groups', groupId);
            if (this.selectedGroupId === groupId) {
                this.selectedGroupId = null;
                document.getElementById('noGroupSelected').style.display = '';
                document.getElementById('groupDetail').style.display     = 'none';
            }
            await this.loadGroups();
            await this.loadAllItems();
            this.renderGroupList();
            this.updateSummary();
            this.showNotification('グループを削除しました', 'success');
        } catch (e) { this.showNotification('削除に失敗しました: ' + e.message, 'danger'); }
    }

    async deleteItem(itemId) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
        if (modal) modal.hide();
        try {
            await jbDelete('bonus_items', itemId);
            await this.loadAllItems();
            this.renderGroupList();
            this.renderItemList();
            this.updateSummary();
            this.showNotification('特典を削除しました', 'success');
        } catch (e) { this.showNotification('削除に失敗しました: ' + e.message, 'danger'); }
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
        const tw   = tip.offsetWidth;
        let left   = rect.left + rect.width / 2 - tw / 2;
        let top    = rect.top - tip.offsetHeight - 8;
        if (left < 6) left = 6;
        if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;
        if (top  < 6) top  = rect.bottom + 8;
        tip.style.left = left + 'px';
        tip.style.top  = top  + 'px';
        requestAnimationFrame(() => requestAnimationFrame(() => { tip.style.opacity = '1'; }));
    }

    hideTooltip() {
        const old = document.getElementById('custom-tooltip');
        if (old) old.remove();
    }

    // ========== ユーティリティ ==========
    esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    showNotification(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        el.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:280px;';
        el.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
    }
}

// 起動
let bonusManager;
document.addEventListener('DOMContentLoaded', () => {
    bonusManager = new BonusManager();
});
