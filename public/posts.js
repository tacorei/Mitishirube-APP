// posts.js
// 最新情報（ブース投稿）画面用: /api/posts のデータを取得して一覧表示する

// ページ読み込み後に処理を開始する
window.addEventListener('DOMContentLoaded', () => {
  // 1) URLパラメータからeventIdを取得
  const params = new URLSearchParams(location.search);
  const eventId = params.get('eventId');

  const listEl = document.getElementById('posts-list');
  const backLink = document.querySelector('.site-nav a[href="/index.html"]');

  if (!eventId) {
    listEl.textContent = 'イベントIDが指定されていません。';
    return;
  }

  // 1-1) ナビゲーションリンクの更新
  if (eventId) {
    if (backLink) {
      backLink.href = `/event.html?id=${eventId}`;
      backLink.textContent = '← イベント詳細に戻る';
    }
    // 他のナビゲーションリンクにも eventId を付与
    document.querySelectorAll('.site-nav a').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('event.html')) {
        const url = new URL(href, location.origin);
        url.searchParams.set('eventId', eventId);
        link.href = url.pathname + url.search;
      }
    });
  }

  if (!listEl) {
    console.warn('posts-list element not found');
    return;
  }

  // 3) APIから投稿データを取得して表示する関数
  function loadPosts() {
    fetch(`/api/posts?eventId=${eventId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch posts');
        }
        return response.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        listEl.innerHTML = '';

        if (items.length === 0) {
          listEl.textContent = 'まだ投稿はありません。';
          return;
        }

        items.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'post-item';

          const boothName = item.booth_name || '(不明なブース)';
          const title = item.title || '(無題)';
          const body = item.body || '';
          const postedAt = item.posted_at || '';

          // カードの内容を組み立て
          const headerDiv = document.createElement('div');
          headerDiv.className = 'post-header';

          const boothTag = document.createElement('span');
          boothTag.className = 'booth-tag';
          boothTag.textContent = boothName;
          headerDiv.appendChild(boothTag);

          const timeSpan = document.createElement('span');
          timeSpan.className = 'post-time';
          timeSpan.textContent = postedAt;
          headerDiv.appendChild(timeSpan);

          card.appendChild(headerDiv);

          const h3 = document.createElement('h3');
          h3.className = 'post-title';
          h3.textContent = title;
          card.appendChild(h3);

          const pBody = document.createElement('p');
          pBody.className = 'post-body';
          pBody.textContent = body;
          card.appendChild(pBody);

          listEl.appendChild(card);
        });
      })
      .catch((err) => {
        listEl.textContent = '投稿データの取得に失敗しました';
        console.error(err);
      });
  }

  loadPosts();
});
