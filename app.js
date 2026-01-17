// app.js
// Express + SQLiteで日程表APIと最新情報APIを提供する最小構成

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const session = require('express-session');
const bcrypt = require('bcryptjs');

// 1) Expressアプリを作成
const app = express();

// 1-1) セッションの設定
app.use(session({
  secret: 'mitishirube-secret-key', // 本番では環境変数で管理すべき
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // ローカル開発のためfalse
}));

// 1-2) 静的ファイル（HTML/CSS/JS）を配信する
app.use(express.static(path.join(__dirname, 'public')));

// 1-3) 送信フォームのデータを受け取れるようにする
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2) SQLiteのDB接続
const DB_PATH = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(DB_PATH);

// --- 認証用エンドポイント ---

// ログインAPI
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const sql = `
    SELECT u.*, b.name as booth_name, b.event_id 
    FROM booth_users u 
    LEFT JOIN booths b ON u.booth_id = b.id 
    WHERE u.username = ?
  `;
  db.get(sql, [username], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.boothId = user.booth_id;
    req.session.boothName = user.booth_name || 'Admin';
    req.session.eventId = user.event_id;
    req.session.isAdmin = !!user.is_admin;

    res.json({ ok: true, user: { username: user.username, boothName: req.session.boothName, isAdmin: req.session.isAdmin } });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({});
  }
  res.json({
    username: req.session.username,
    boothName: req.session.boothName,
    eventId: req.session.eventId,
    isAdmin: req.session.isAdmin
  });
});

// ログアウトAPI
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// --- イベント管理用API ---

// 全イベント取得
app.get('/api/events', (req, res) => {
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'failed' });
    res.json({ events: rows });
  });
});

// 管理者チェックミドルウェア
const adminOnly = (req, res, next) => {
  if (req.session.userId && req.session.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'admin only' });
};

// イベント作成
app.post('/api/events', adminOnly, (req, res) => {
  const { id, name, subtitle, date, location } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Id and name are required' });
  const sql = 'INSERT INTO events (id, name, subtitle, date, location) VALUES (?, ?, ?, ?, ?)';
  db.run(sql, [id, name, subtitle, date, location], (err) => {
    if (err) return res.status(500).json({ error: 'failed (duplicate id?)' });
    res.json({ ok: true });
  });
});

// イベント更新
app.put('/api/events/:id', adminOnly, (req, res) => {
  const { name, subtitle, date, location } = req.body;
  const sql = 'UPDATE events SET name = ?, subtitle = ?, date = ?, location = ? WHERE id = ?';
  db.run(sql, [name, subtitle, date, location, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'update failed' });
    res.json({ ok: true });
  });
});

// イベント削除
app.delete('/api/events/:id', adminOnly, (req, res) => {
  db.run('DELETE FROM events WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'delete failed' });
    res.json({ ok: true });
  });
});

// --- コンテンツ用API ---

app.get('/api/schedule', (req, res) => {
  const eventId = req.query.eventId;
  if (!eventId) {
    return res.status(400).json({ error: 'eventId is required' });
  }
  const sql = 'SELECT * FROM schedule WHERE event_id = ? ORDER BY start_time ASC';
  db.all(sql, [eventId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'failed' });
    res.json({ items: rows });
  });
});

app.get('/api/timeline', (req, res) => {
  const sql = `
    SELECT p.*, b.name AS booth_name
    FROM booth_posts AS p
    LEFT JOIN booths AS b ON p.booth_id = b.id
    ORDER BY p.posted_at DESC
    LIMIT 15
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'failed' });
    res.json({ items: rows });
  });
});

app.get('/api/posts', (req, res) => {
  const eventId = req.query.eventId;
  if (!eventId) return res.status(400).json({ error: 'eventId required' });
  const sql = `
    SELECT p.*, b.name AS booth_name
    FROM booth_posts AS p
    LEFT JOIN booths AS b ON p.booth_id = b.id
    WHERE p.event_id = ?
    ORDER BY p.posted_at DESC
  `;
  db.all(sql, [eventId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'failed' });
    res.json({ items: rows });
  });
});

// 最新情報（ブース投稿）を保存するAPI (要ログイン)
app.post('/api/posts', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const { title, body, posted_at, eventId: bodyEventId } = req.body;

  // 管理者の場合はリクエストボディからeventIdを受け取れるようにする
  const eventId = req.session.isAdmin ? (bodyEventId || req.session.eventId) : req.session.eventId;
  const boothId = req.session.boothId; // 管理者の場合はNULLになる

  if (!eventId || !title || !body || !posted_at) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const sql = 'INSERT INTO booth_posts (event_id, booth_id, title, body, posted_at) VALUES (?, ?, ?, ?, ?)';
  db.run(sql, [eventId, boothId, title, body, posted_at], function (err) {
    if (err) {
      console.error('Post creation error:', err);
      return res.status(500).json({ error: 'failed to create post' });
    }
    res.json({ ok: true, id: this.lastID });
  });
});

// 7) サーバーを起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
