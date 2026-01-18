// admin.js
// 管理・スタッフ画面のロジック
// Supabaseのセッションからトークンを取得するヘルパー
// (非同期になるため、呼び出し元で await する必要があるが、fetchのheaders組み立て時に同期的に欲しい場合がある。
//  シンプルな解決策として、Supabase JSクライアントがlocalStorageに持っているトークンを使うか、
//  getSession()の結果を使う。ここではgetSession()を推奨するが、既存コードの書き換え量を減らすため
//  API呼び出し直前にトークンを取得する形に変更する)

async function getAuthHeaders() {
    if (!window.appSupabase) return {};
    const { data: { session } } = await window.appSupabase.auth.getSession();
    const token = session ? session.access_token : null;
    return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // ログアウトボタンの委譲
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('cmd-logout')) {
            handleLogout();
        }
    });

    // タブ切り替え
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.tab;
            document.querySelectorAll('.glass-card').forEach(s => s.classList.add('hidden'));
            document.getElementById(target).classList.remove('hidden');

            if (target === 'event-mgmt-section') {
                loadEvents();
            }
        });
    });

    // 1) 認証チェック (Supabase Auth)
    async function checkAuth() {
        if (!window.appSupabase) {
            console.error('Supabase client not initialized');
            showLogin();
            return;
        }

        // セッション取得
        const { data: { session } } = await window.appSupabase.auth.getSession();

        if (session) {
            // プロフィール（権限）取得
            const { data: profile } = await window.appSupabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            // 権限判定: User(null) / Staff / Admin
            const role = profile ? profile.role : 'user';

            // ログイン済みユーザー情報構築
            const user = {
                username: profile ? profile.username : (session.user.user_metadata.full_name || 'Guest'),
                boothName: role === 'admin' ? 'Administrator' : (role === 'staff' ? 'Staff' : 'Guest'),
                isAdmin: role === 'admin',
                isStaff: role === 'staff' || role === 'admin',
                role: role
            };

            // 権限による画面制御
            if (user.role === 'user') {
                alert('このアカウントには管理権限がありません。');
                await window.appSupabase.auth.signOut();
                showLogin();
            } else {
                showPanel(user);
            }
        } else {
            showLogin();
        }
    }

    function showLogin() {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('post-section').classList.add('hidden');
        document.getElementById('event-mgmt-section').classList.add('hidden');
        document.getElementById('admin-tabs').classList.add('hidden');
    }

    function showPanel(user) {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('post-section').classList.remove('hidden');
        document.getElementById('display-booth-name').textContent = user.boothName + ` (${user.username})`;

        // 管理者ならタブを表示し、イベント選択肢をロードする
        if (user.isAdmin) {
            document.getElementById('admin-tabs').classList.remove('hidden');
            loadEventOptions();
        }
    }

    // 管理者用：投稿先イベントの選択肢を読み込む
    async function loadEventOptions() {
        const res = await fetch('/api/events');
        const data = await res.json();
        const events = data.events || [];

        let select = document.getElementById('post-event-id');
        if (!select) {
            // 要素がなければ追加
            const form = document.getElementById('post-form');
            const group = document.createElement('div');
            group.className = 'form-group';
            group.innerHTML = `
                <label>投稿先イベント</label>
                <select id="post-event-id" style="width:100%; padding:12px; background:#12141a; border:1px solid #3f4451; border-radius:8px; color:white;"></select>
            `;
            form.insertBefore(group, form.firstChild);
            select = document.getElementById('post-event-id');
        }

        select.innerHTML = events.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    // 2) ログイン処理 (Google OAuth)
    // 既存のフォームをボタンクリックイベントに置き換えるため、フォームHTMLも変更推奨だが、
    // ここではsubmitイベントを乗っ取ってGoogleログインを発火させる
    const loginForm = document.getElementById('login-form');
    // ボタンのテキストを変更してユーザーに通知
    const loginBtn = loginForm.querySelector('button');
    if (loginBtn) loginBtn.textContent = 'Googleアカウントでログイン';

    // 入力欄は不要になるので隠す
    loginForm.querySelectorAll('.form-group').forEach(el => el.style.display = 'none');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            if (!window.appSupabase) return alert('Supabase設定が読み込まれていません');

            const { error } = await window.appSupabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.href // ログイン後にこのページに戻る
                }
            });
            if (error) throw error;
        } catch (err) {
            console.error(err);
            alert('ログインエラー: ' + err.message);
        }
    });

    // 3) 投稿処理 (既にあるもの)
    const postForm = document.getElementById('post-form');
    // 日時の初期値をセット（日本時間）
    const postedAtInput = document.getElementById('posted-at');
    if (postedAtInput) {
        postedAtInput.value = new Date().toLocaleString('ja-JP').replace(/\//g, '-');
    }

    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('post-title').value;
        const body = document.getElementById('post-body').value;
        const posted_at = document.getElementById('posted-at').value;
        const eventId = document.getElementById('post-event-id')?.value;

        try {
            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ title, body, posted_at, eventId })
            });
            const data = await res.json();
            if (data.ok) {
                alert('投稿が完了しました！');
                postForm.reset();
                if (postedAtInput) {
                    postedAtInput.value = new Date().toLocaleString('ja-JP').replace(/\//g, '-');
                }
            } else {
                alert('投稿に失敗しました: ' + (data.error || ''));
            }
        } catch (err) {
            alert('通信エラー');
        }
    });

    // 4) ログアウト処理
    async function handleLogout() {
        if (!confirm('ログアウトしますか？')) return;
        if (window.appSupabase) {
            await window.appSupabase.auth.signOut();
        }
        location.reload();
    }

    // --- イベント管理用ロジック ---

    const eventForm = document.getElementById('event-form');
    let editingId = null;

    async function loadEvents() {
        const res = await fetch('/api/events');
        const data = await res.json();
        renderEventListAdmin(data.events || []);
    }

    function renderEventListAdmin(events) {
        const list = document.getElementById('event-list-admin');
        list.innerHTML = '';
        events.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'data-item';

            // 情報部分
            const infoDiv = document.createElement('div');
            infoDiv.className = 'data-info';

            const h4 = document.createElement('h4');
            h4.textContent = ev.name + ' ';
            const small = document.createElement('small');
            small.style.color = '#666';
            small.textContent = `(${ev.id})`;
            h4.appendChild(small);
            infoDiv.appendChild(h4);

            const p = document.createElement('p');
            p.textContent = `${ev.date || '日付未定'} / ${ev.location || '場所未定'}`;
            infoDiv.appendChild(p);

            // アクションボタン
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'data-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-sm btn-edit';
            editBtn.textContent = '編集';
            editBtn.addEventListener('click', () => {
                editEvent(ev.id, ev.name, ev.subtitle || '', ev.date || '', ev.location || '');
            });
            actionsDiv.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-sm btn-delete';
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', () => {
                deleteEvent(ev.id);
            });
            actionsDiv.appendChild(deleteBtn);

            div.appendChild(infoDiv);
            div.appendChild(actionsDiv);
            list.appendChild(div);
        });
    }

    // 編集モードへ
    window.editEvent = (id, name, subtitle, date, location) => {
        editingId = id;
        document.getElementById('ev-id').value = id;
        document.getElementById('ev-id').disabled = true; // IDは変更不可
        document.getElementById('ev-name').value = name;
        document.getElementById('ev-subtitle').value = subtitle;
        document.getElementById('ev-date').value = date;
        document.getElementById('ev-location').value = location;
        document.querySelector('#event-form .btn-admin').textContent = '変更を保存（更新）';
    };

    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id: document.getElementById('ev-id').value,
            name: document.getElementById('ev-name').value,
            subtitle: document.getElementById('ev-subtitle').value,
            date: document.getElementById('ev-date').value,
            location: document.getElementById('ev-location').value
        };

        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/api/events/${editingId}` : '/api/events';

        const res = await fetch(url, {
            method,
            headers: await getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('保存しました');
            resetEventForm();
            loadEvents();
            loadEventOptions(); // ドロップダウンも更新
        } else {
            alert('保存に失敗しました');
        }
    });

    function resetEventForm() {
        editingId = null;
        eventForm.reset();
        document.getElementById('ev-id').disabled = false;
        document.querySelector('#event-form .btn-admin').textContent = 'イベントを保存';
    }

    window.deleteEvent = async (id) => {
        if (!confirm(`イベント [${id}] を削除しますか？\n※関連する投稿やブースデータは削除されませんが、表示されなくなります。`)) return;

        const headers = await getAuthHeaders();
        const res = await fetch(`/api/events/${id}`, {
            method: 'DELETE',
            headers: headers
        });
        if (res.ok) {
            loadEvents();
        } else {
            alert('削除に失敗しました');
        }
    };

});
