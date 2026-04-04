// リンク管理システム（JSONBin.io版）

let linkManager;

document.addEventListener('DOMContentLoaded', function () {
    linkManager = new LinkManager();
});

class LinkManager {
    constructor() {
        this.links = [];
        this.currentFilter = 'all';
        this.currentSearch = '';
        this.init();
    }

    async init() {
        await this.loadLinks();
        this.updateStats();
        this.renderLinks();
    }

    async loadLinks() {
        try {
            this.links = await jbGetAll('links');
        } catch (e) {
            console.error('リンク読み込み失敗:', e);
            this.links = [];
        }
    }

    updateStats() {
        document.getElementById('totalLinks').textContent = this.links.length;
        document.getElementById('favoriteLinks').textContent = this.links.filter(l => l.is_favorite).length;
    }

    filterLinks() {
        this.currentSearch = document.getElementById('searchInput').value.toLowerCase();
        this.renderLinks();
    }

    filterByCategory(category, event) {
        this.currentFilter = category;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
        this.renderLinks();
    }

    getFilteredLinks() {
        return this.links.filter(link => {
            const matchFilter = this.currentFilter === 'all' || (this.currentFilter === 'favorite' && link.is_favorite);
            const matchSearch = !this.currentSearch ||
                (link.title || '').toLowerCase().includes(this.currentSearch) ||
                (link.description || '').toLowerCase().includes(this.currentSearch) ||
                (link.url || '').toLowerCase().includes(this.currentSearch);
            return matchFilter && matchSearch;
        });
    }

    renderLinks() {
        const container = document.getElementById('linksContainer');
        const filtered = this.getFilteredLinks();
        document.getElementById('filteredCount').textContent = filtered.length;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-inbox display-1"></i>
                    <h4>リンクが見つかりません</h4>
                    <p class="mb-4">まだリンクが登録されていません。</p>
                    <button class="add-link-btn" onclick="showAddLinkModal()">
                        <i class="bi bi-plus-circle me-2"></i>最初のリンクを追加
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = filtered.map(link => {
            const fav = link.is_favorite ? 'favorite' : '';
            return `
            <div class="link-card ${fav}">
                <div class="d-flex align-items-start">
                    <div class="link-icon"><i class="bi bi-link-45deg"></i></div>
                    <div class="link-content flex-grow-1">
                        <h5>${this._esc(link.title)}</h5>
                        <p>${this._esc(link.description || '')}</p>
                        <a href="${this._esc(link.url)}" target="_blank" class="link-url">
                            <i class="bi bi-box-arrow-up-right me-1"></i>${this._esc(link.url)}
                        </a>
                    </div>
                    <div class="action-buttons">
                        <button class="btn-icon favorite" onclick="linkManager.toggleFavorite('${link.id}')" title="お気に入り">
                            <i class="bi ${link.is_favorite ? 'bi-star-fill' : 'bi-star'}"></i>
                        </button>
                        <button class="btn-icon edit" onclick="linkManager.editLink('${link.id}')" title="編集">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn-icon delete" onclick="linkManager.deleteLink('${link.id}')" title="削除">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    showAddLinkModal() {
        document.getElementById('modalTitle').textContent = '新規リンク追加';
        document.getElementById('linkId').value = '';
        document.getElementById('linkTitle').value = '';
        document.getElementById('linkUrl').value = '';
        document.getElementById('linkDescription').value = '';
        document.getElementById('isFavorite').checked = false;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('linkModal')).show();
    }

    editLink(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        document.getElementById('modalTitle').textContent = 'リンク編集';
        document.getElementById('linkId').value = link.id;
        document.getElementById('linkTitle').value = link.title || '';
        document.getElementById('linkUrl').value = link.url || '';
        document.getElementById('linkDescription').value = link.description || '';
        document.getElementById('isFavorite').checked = !!link.is_favorite;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('linkModal')).show();
    }

    async saveLink() {
        const linkId = document.getElementById('linkId').value;
        const title = document.getElementById('linkTitle').value.trim();
        const url = document.getElementById('linkUrl').value.trim();

        if (!title) { this.showNotification('タイトルを入力してください', 'warning'); return; }
        if (!url)   { this.showNotification('URLを入力してください', 'warning'); return; }

        const body = {
            title,
            url,
            description: document.getElementById('linkDescription').value.trim(),
            is_favorite: document.getElementById('isFavorite').checked,
        };

        try {
            if (linkId) {
                await jbUpdate('links', linkId, { ...body, id: linkId });
            } else {
                await jbCreate('links', body);
            }
            bootstrap.Modal.getInstance(document.getElementById('linkModal')).hide();
            await this.loadLinks();
            this.updateStats();
            this.renderLinks();
            this.showNotification('保存しました', 'success');
        } catch (e) {
            this.showNotification('保存に失敗しました: ' + e.message, 'danger');
        }
    }

    async deleteLink(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        if (!confirm(`「${link.title}」を削除しますか？`)) return;
        try {
            await jbDelete('links', id);
            await this.loadLinks();
            this.updateStats();
            this.renderLinks();
            this.showNotification('削除しました', 'success');
        } catch (e) {
            this.showNotification('削除に失敗しました: ' + e.message, 'danger');
        }
    }

    async toggleFavorite(id) {
        const link = this.links.find(l => l.id === id);
        if (!link) return;
        try {
            await jbPatch('links', id, { is_favorite: !link.is_favorite });
            await this.loadLinks();
            this.updateStats();
            this.renderLinks();
        } catch (e) {
            this.showNotification('更新に失敗しました: ' + e.message, 'danger');
        }
    }

    showNotification(message, type = 'info') {
        const container = document.querySelector('.toast-container');
        if (!container) return;
        const id = 'toast-' + Date.now();
        container.insertAdjacentHTML('beforeend', `
            <div class="toast align-items-center text-white bg-${type} border-0" id="${id}" role="alert" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>`);
        const t = new bootstrap.Toast(document.getElementById(id), { delay: 3000 });
        t.show();
        setTimeout(() => document.getElementById(id)?.remove(), 4000);
    }
}

// グローバル関数
function showAddLinkModal() { linkManager?.showAddLinkModal(); }
function filterLinks()       { linkManager?.filterLinks(); }
function filterByCategory(c, e) { linkManager?.filterByCategory(c, e); }
function saveLink()          { linkManager?.saveLink(); }
