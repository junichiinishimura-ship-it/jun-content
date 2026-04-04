// 編集者管理システム（JSONBin.io版）
class EditorManager {
    constructor() {
        this.editors = [];
        this.init();
    }

    async init() {
        await this.loadEditors();
        this.updateStats();
        this.renderEditors();
    }

    async loadEditors() {
        try {
            this.editors = await jbGetAll('editors');
        } catch (error) {
            console.error('編集者データの読み込みに失敗しました:', error);
            this.editors = [];
        }
    }

    getSortedEditors() {
        return [...this.editors].sort((a, b) => {
            const orderA = Number(a.sort_order) || 9999;
            const orderB = Number(b.sort_order) || 9999;
            if (orderA !== orderB) return orderA - orderB;
            return (a.name || '').localeCompare(b.name || '', 'ja');
        });
    }

    updateStats() {
        const total = this.editors.length;
        const active = this.editors.filter(editor => editor.active !== false).length;

        document.getElementById('totalEditors').textContent = total;
        document.getElementById('activeEditors').textContent = active;
    }

    renderEditors() {
        const table = document.getElementById('editorTable');
        if (!table) return;

        if (this.editors.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">編集者が登録されていません</td>
                </tr>
            `;
            return;
        }

        const sortedEditors = this.getSortedEditors();

        table.innerHTML = sortedEditors
            .map((editor, index) => `
                <tr>
                    <td>${Number(editor.sort_order) || index + 1}</td>
                    <td>${editor.name}</td>
                    <td>${editor.role || '-'}</td>
                    <td>${editor.permissions || '-'}</td>
                    <td>${editor.notes || '-'}</td>
                    <td>
                        <span class="badge rounded-pill ${editor.active !== false ? 'badge-active' : 'badge-inactive'}">
                            ${editor.active !== false ? '稼働中' : '停止中'}
                        </span>
                    </td>
                    <td>
                        <div class="d-flex gap-2">
                            <button class="btn-icon" onclick="editorManager.moveEditor('${editor.id}', -1)" title="上へ">
                                <i class="bi bi-arrow-up"></i>
                            </button>
                            <button class="btn-icon" onclick="editorManager.moveEditor('${editor.id}', 1)" title="下へ">
                                <i class="bi bi-arrow-down"></i>
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex gap-2">
                            <button class="btn-icon edit" onclick="editorManager.editEditor('${editor.id}')" title="編集">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn-icon delete" onclick="editorManager.deleteEditor('${editor.id}')" title="削除">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `)
            .join('');
    }

    showAddEditorModal() {
        document.getElementById('editorModalTitle').textContent = '編集者追加';
        document.getElementById('editorForm').reset();
        document.getElementById('editorId').value = '';
        document.getElementById('editorPermission').value = '';
        document.getElementById('editorSortOrder').value = '';
        document.getElementById('editorActive').checked = true;
        new bootstrap.Modal(document.getElementById('editorModal')).show();
    }

    editEditor(id) {
        const editor = this.editors.find(item => item.id === id);
        if (!editor) return;

        document.getElementById('editorModalTitle').textContent = '編集者編集';
        document.getElementById('editorId').value = editor.id;
        document.getElementById('editorName').value = editor.name;
        document.getElementById('editorRole').value = editor.role || '';
        document.getElementById('editorPermission').value = editor.permissions || '';
        document.getElementById('editorSortOrder').value = editor.sort_order || '';
        document.getElementById('editorNotes').value = editor.notes || '';
        document.getElementById('editorActive').checked = editor.active !== false;

        new bootstrap.Modal(document.getElementById('editorModal')).show();
    }

    async saveEditor() {
        const name = document.getElementById('editorName').value.trim();
        if (!name) { alert('編集者名を入力してください'); return; }

        const sortInput = Number(document.getElementById('editorSortOrder').value);
        const maxOrder = this.editors.reduce((max, editor) => Math.max(max, Number(editor.sort_order) || 0), 0);
        const existingId = document.getElementById('editorId').value;

        const formData = {
            name,
            role: document.getElementById('editorRole').value,
            permissions: document.getElementById('editorPermission').value,
            sort_order: sortInput || maxOrder + 1,
            notes: document.getElementById('editorNotes').value,
            active: document.getElementById('editorActive').checked
        };

        try {
            if (existingId) {
                await jbUpdate('editors', existingId, { ...formData, id: existingId });
            } else {
                await jbCreate('editors', formData);
            }
            bootstrap.Modal.getInstance(document.getElementById('editorModal')).hide();
            await this.loadEditors();
            this.updateStats();
            this.renderEditors();
        } catch (error) {
            console.error('保存エラー:', error);
            alert('編集者の保存に失敗しました: ' + error.message);
        }
    }

    async deleteEditor(id) {
        const editor = this.editors.find(item => item.id === id);
        if (!editor) return;

        if (!confirm(`「${editor.name}」を削除してもよろしいですか？`)) return;

        try {
            await jbDelete('editors', id);
            await this.loadEditors();
            this.updateStats();
            this.renderEditors();
        } catch (error) {
            console.error('削除エラー:', error);
            alert('編集者の削除に失敗しました: ' + error.message);
        }
    }

    async moveEditor(id, direction) {
        const sorted = this.getSortedEditors();
        const currentIndex = sorted.findIndex(editor => editor.id === id);
        const targetIndex = currentIndex + direction;

        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
            return;
        }

        const current = sorted[currentIndex];
        const target = sorted[targetIndex];
        const currentOrder = Number(current.sort_order) || currentIndex + 1;
        const targetOrder = Number(target.sort_order) || targetIndex + 1;

        try {
            await jbPatch('editors', current.id, { sort_order: targetOrder });
            await jbPatch('editors', target.id, { sort_order: currentOrder });
            await this.loadEditors();
            this.updateStats();
            this.renderEditors();
        } catch (error) {
            console.error('並び替えエラー:', error);
            alert('並び替えに失敗しました: ' + error.message);
        }
    }
}

let editorManager;

document.addEventListener('DOMContentLoaded', () => {
    editorManager = new EditorManager();
});

function showAddEditorModal() {
    editorManager.showAddEditorModal();
}

function saveEditor() {
    editorManager.saveEditor();
}
