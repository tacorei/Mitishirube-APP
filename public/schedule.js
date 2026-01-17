// schedule.js
// 日程表画面用: /api/schedule のデータを取得して一覧表示する

// ページ読み込み後に処理を開始する
window.addEventListener('DOMContentLoaded', () => {
  // 1) URLパラメータからeventIdを取得
  const params = new URLSearchParams(location.search);
  const eventId = params.get('eventId');

  const listEl = document.getElementById('schedule-list');
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
    console.warn('schedule-list element not found');
    return;
  }

  // 3) APIから日程表データを取得する (eventIdを付与)
  fetch(`/api/schedule?eventId=${eventId}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch schedule');
      }
      return response.json();
    })
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];

      items.sort((a, b) => {
        const timeA = Date.parse((a.start_time || '').replace(' ', 'T'));
        const timeB = Date.parse((b.start_time || '').replace(' ', 'T'));
        return timeA - timeB;
      });

      listEl.innerHTML = '';
      if (items.length === 0) {
        listEl.textContent = '予定されているスケジュールはありません。';
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'schedule-item';
        const title = item.title || '(無題)';
        const start = item.start_time || '';
        const end = item.end_time || '';
        row.textContent = `${start} - ${end} : ${title}`;
        listEl.appendChild(row);
      });
    })
    .catch((err) => {
      listEl.textContent = '日程データの取得に失敗しました';
      console.error(err);
    });
});

