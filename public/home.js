// home.js
// ホーム画面: イベント一覧と詳細表示を切り替える

// 2) DOMが読み込まれたらボタンを生成する
window.addEventListener('DOMContentLoaded', () => {
  const buttonsWrap = document.getElementById('event-buttons');
  if (!buttonsWrap) return;

  // DBからイベントを取得
  fetch('/api/events')
    .then(async res => {
      if (!res.ok) {
        // エラーレスポンスでもJSONを返している可能性があるため解析を試みる
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || `Server Error: ${res.status}`);
        } catch (e) {
          throw new Error(`Server Error: ${res.status} ${res.statusText} \n${text.substring(0, 100)}`);
        }
      }
      return res.json();
    })
    .then(data => {
      const events = data.events || [];
      if (events.length === 0) {
        console.warn('No events found.');
      }
      renderEventList(events, buttonsWrap);
    })
    .catch(err => {
      console.error('Failed to fetch events:', err);
    });

  // Dark Mode Logic
  const toggleBtn = document.getElementById('dark-mode-toggle');
  const body = document.body;

  // 初期設定: ローカルストレージのみ確認（OS設定での自動ダークモードは無効化し、デフォルトを「優しい色合い」にする）
  const savedMode = localStorage.getItem('theme');
  if (savedMode === 'dark') {
    body.classList.add('dark-mode');
    if (toggleBtn) toggleBtn.textContent = '☀️';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      body.classList.toggle('dark-mode');
      const isDark = body.classList.contains('dark-mode');
      toggleBtn.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // PWA Install Logic
  let deferredPrompt;
  const installBtn = document.getElementById('install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.style.display = 'inline-block';
      installBtn.addEventListener('click', () => {
        installBtn.style.display = 'none';
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          deferredPrompt = null;
        });
      });
    }
  });
});

function renderEventList(events, container) {
  container.innerHTML = '';
  events.forEach((event) => {
    // ボタンの作成
    const btn = document.createElement('button');
    btn.className = 'event-card';

    const h3 = document.createElement('h3');
    h3.textContent = event.name;
    btn.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = event.date;
    btn.appendChild(p);

    btn.addEventListener('click', () => {
      renderDetailTimeline(event);
    });

    // ダブルクリックでの遷移は廃止し、詳細プレビュー内にボタンを配置する方針へ変更
    // btn.addEventListener('dblclick', () => { ... });

    container.appendChild(btn);
  });
}

// 5) 詳細表示を「そのイベントのタイムライン」として組み立てる
function renderDetailTimeline(event) {
  const wrap = document.getElementById('event-detail');
  if (!wrap) return;

  // 読み込み中表示
  wrap.innerHTML = ''; // Clear content

  const headerDiv = document.createElement('div');
  headerDiv.className = 'detail-header';

  const h2 = document.createElement('h2');
  h2.textContent = event.name;
  headerDiv.appendChild(h2);

  const pMuted = document.createElement('p');
  pMuted.className = 'muted';
  pMuted.textContent = event.subtitle || '';
  headerDiv.appendChild(pMuted);

  // 詳細ページへの遷移ボタンを追加
  const detailLink = document.createElement('a');
  detailLink.href = `/event.html?id=${event.id}`;
  detailLink.className = 'primary-button-outline';
  detailLink.textContent = '詳細ページを開く ➔';
  detailLink.style.display = 'inline-block';
  detailLink.style.marginTop = '12px';
  headerDiv.appendChild(detailLink);

  wrap.appendChild(headerDiv);

  const timelineDiv = document.createElement('div');
  timelineDiv.id = 'mini-timeline';
  timelineDiv.className = 'mini-timeline';

  const pLoading = document.createElement('p');
  pLoading.className = 'loading';
  pLoading.textContent = '最新ログを読み込み中...';
  timelineDiv.appendChild(pLoading);

  wrap.appendChild(timelineDiv);

  const timelineContainer = document.getElementById('mini-timeline');
  let refreshInterval;

  // データ取得ロジック
  const fetchTimeline = () => {
    fetch(`/api/posts?eventId=${event.id}`)
      .then(res => res.json())
      .then(data => {
        timelineContainer.innerHTML = '';
        const posts = data.items || [];

        if (posts.length === 0) {
          timelineContainer.innerHTML = `
            <div class="empty-state">
              <p>まだこのイベントにログはありません。</p>
              <a href="/posts.html?eventId=${event.id}" class="jump-link">お知らせ一覧へ</a>
            </div>
          `;
          return;
        }

        posts.forEach(post => {
          const card = document.createElement('div');
          card.className = 'mini-post-card';

          const metaDiv = document.createElement('div');
          metaDiv.className = 'post-meta';

          const boothSpan = document.createElement('span');
          boothSpan.className = 'post-booth';
          boothSpan.textContent = post.booth_name;
          metaDiv.appendChild(boothSpan);

          const dateSpan = document.createElement('span');
          dateSpan.className = 'post-date';
          dateSpan.textContent = post.posted_at;
          metaDiv.appendChild(dateSpan);

          card.appendChild(metaDiv);

          const h4 = document.createElement('h4');
          h4.className = 'post-title';
          h4.textContent = post.title;
          card.appendChild(h4);

          const pBody = document.createElement('p');
          pBody.className = 'post-body';
          pBody.textContent = post.body;
          card.appendChild(pBody);

          timelineContainer.appendChild(card);
        });

        // 最後に全体のお知らせページへのリンクを追加
        const footerLink = document.createElement('div');
        footerLink.className = 'timeline-footer';
        footerLink.innerHTML = `
          <a href="/posts.html?eventId=${event.id}" class="primary-button-outline">
            すべてのお知らせを見る
          </a>
        `;
        timelineContainer.appendChild(footerLink);
      })
      .catch(err => {
        console.error(err);
        // エラー時は表示を変えない（古いデータを残す）かエラー表示
      });
  };

  // 初回ロード
  fetchTimeline();

  // 自動更新 (30秒ごと)
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(fetchTimeline, 30000);

  // 画面遷移でクリアされるが、SPA的な動きをするならclearIntervalが必要（今回は簡易実装）
}
