// app.js
// Express + Supabaseで日程表APIと最新情報APIを提供する
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// 1) Expressアプリを作成
const app = express();

// 1-1) セッションの設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'mitishirube-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // ローカル開発のためfalse (本番はtrue推奨)
}));

// 1-2) 静的ファイル（HTML/CSS/JS）を配信する
app.use(express.static(path.join(__dirname, 'public')));

// 1-3) 送信フォームのデータを受け取れるようにする
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2) SupabaseのDB接続
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠️ WARNING: SUPABASE_URL or SUPABASE_KEY is missing in .env file.');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

// --- 認証用エンドポイント ---

// ログインAPI
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Supabaseからユーザー取得
  const { data: user, error } = await supabase
    .from('booth_users')
    .select('*, booths(name, event_id)')
    .eq('username', username)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // パスワード照合
  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // セッションに保存
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.boothId = user.booth_id;
  // boothsテーブルとの結合結果は user.booths (オブジェクト) に入る
  req.session.boothName = user.booths ? user.booths.name : 'Admin';
  req.session.eventId = user.booths ? user.booths.event_id : null;
  req.session.isAdmin = !!user.is_admin;

  res.json({ ok: true, user: { username: user.username, boothName: req.session.boothName, isAdmin: req.session.isAdmin } });
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
app.get('/api/events', async (req, res) => {
  const { data, error } = await supabase.from('events').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data });
});

// 管理者チェックミドルウェア
const adminOnly = (req, res, next) => {
  if (req.session.userId && req.session.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'admin only' });
};

// イベント作成
app.post('/api/events', adminOnly, async (req, res) => {
  const { id, name, subtitle, date, location } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Id and name are required' });

  const { error } = await supabase
    .from('events')
    .insert([{ id, name, subtitle, date, location }]);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// イベント更新
app.put('/api/events/:id', adminOnly, async (req, res) => {
  const { name, subtitle, date, location } = req.body;
  const { error } = await supabase
    .from('events')
    .update({ name, subtitle, date, location })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// イベント削除 (SupabaseのFK制約設定によっては関連データも消えるかエラーになる)
app.delete('/api/events/:id', adminOnly, async (req, res) => {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- コンテンツ用API ---

app.get('/api/schedule', async (req, res) => {
  const eventId = req.query.eventId;
  if (!eventId) {
    return res.status(400).json({ error: 'eventId is required' });
  }

  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data });
});

app.get('/api/timeline', async (req, res) => {
  // 従来の timeline API (全イベントの最新etc) は今回使わないが、
  // 必要なら同様に実装。ここでは簡易的に直近15件を取得
  const { data, error } = await supabase
    .from('booth_posts')
    .select('*, booths(name)')
    .order('posted_at', { ascending: false })
    .limit(15);

  if (error) return res.status(500).json({ error: error.message });

  // フロントエンドの形式に合わせる (booth_nameプロパティを作る)
  const items = data.map(post => ({
    ...post,
    booth_name: post.booths ? post.booths.name : null
  }));
  res.json({ items });
});

app.get('/api/posts', async (req, res) => {
  const eventId = req.query.eventId;
  if (!eventId) return res.status(400).json({ error: 'eventId required' });

  const { data, error } = await supabase
    .from('booth_posts')
    .select('*, booths(name)')
    .eq('event_id', eventId)
    .order('posted_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const items = data.map(post => ({
    ...post,
    booth_name: post.booths ? post.booths.name : null
  }));
  res.json({ items });
});

// 最新情報（ブース投稿）を保存するAPI (要ログイン)
app.post('/api/posts', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const { title, body, posted_at, eventId: bodyEventId } = req.body;
  const eventId = req.session.isAdmin ? (bodyEventId || req.session.eventId) : req.session.eventId;
  const boothId = req.session.boothId;

  if (!eventId || !title || !body || !posted_at) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const { data, error } = await supabase
    .from('booth_posts')
    .insert([{ event_id: eventId, booth_id: boothId, title, body, posted_at }])
    .select(); // ID返却のためselectが必要

  if (error) {
    console.error('Post creation error:', error);
    return res.status(500).json({ error: 'failed to create post' });
  }
  res.json({ ok: true, id: data[0].id });
});

// 7) サーバーを起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
