/**
 * パスワード認証
 * 正しいパスワードを入力するとセッションストレージに記録し、以降はスキップ
 */

(function () {
    const PASSWORD = 'ytnishijun';
    const SESSION_KEY = 'yt_auth_ok';

    // すでに認証済みならスキップ
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;

    // ページ全体を隠す
    document.documentElement.style.visibility = 'hidden';

    // 認証UI
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: #1a1a2e;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: 'Noto Sans JP', sans-serif;
    `;
    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 16px;
            padding: 40px 36px;
            width: 340px;
            max-width: 90vw;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            text-align: center;
        ">
            <div style="font-size: 2.5rem; margin-bottom: 8px;">🔐</div>
            <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 4px; color: #1a1a2e;">YouTube管理システム</h2>
            <p style="color: #6c757d; font-size: 0.88rem; margin-bottom: 24px;">パスワードを入力してください</p>
            <input
                type="password"
                id="auth-password-input"
                placeholder="パスワード"
                style="
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 1rem;
                    outline: none;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                    transition: border-color 0.2s;
                "
                autofocus
            >
            <div id="auth-error" style="
                color: #dc3545;
                font-size: 0.85rem;
                margin-bottom: 10px;
                min-height: 20px;
            "></div>
            <button
                id="auth-submit-btn"
                style="
                    width: 100%;
                    padding: 12px;
                    background: #ff0000;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                "
            >ログイン</button>
        </div>
    `;

    // DOMが準備できたら追加
    function mount() {
        document.body.appendChild(overlay);
        document.documentElement.style.visibility = 'visible';

        const input = document.getElementById('auth-password-input');
        const btn   = document.getElementById('auth-submit-btn');
        const err   = document.getElementById('auth-error');

        // フォーカス時にボーダー色変更
        input.addEventListener('focus', () => { input.style.borderColor = '#ff0000'; });
        input.addEventListener('blur',  () => { input.style.borderColor = '#dee2e6'; });

        // ボタンhover
        btn.addEventListener('mouseover', () => { btn.style.background = '#cc0000'; });
        btn.addEventListener('mouseout',  () => { btn.style.background = '#ff0000'; });

        function attempt() {
            if (input.value === PASSWORD) {
                sessionStorage.setItem(SESSION_KEY, '1');
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.3s';
                setTimeout(() => overlay.remove(), 300);
            } else {
                err.textContent = 'パスワードが違います';
                input.value = '';
                input.style.borderColor = '#dc3545';
                input.focus();
                setTimeout(() => {
                    err.textContent = '';
                    input.style.borderColor = '#dee2e6';
                }, 2000);
            }
        }

        btn.addEventListener('click', attempt);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attempt();
        });
    }

    if (document.body) {
        mount();
    } else {
        document.addEventListener('DOMContentLoaded', mount);
    }
})();
