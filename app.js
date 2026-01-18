// app.js
// Express + Supabaseで日程表APIと最新情報APIを提供する
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 1) Expressアプリを作成
const app = express();

// 1-1) セッションの設定
// 1-1) セッション設定は削除 (Netlify Functionsはステートレスなため)
const JWT_SECRET = process.env.JWT_SECRET || 'mitishirube-jwt-secret';

// 1-2) 静的ファイル（HTML/CSS/JS）はNetlifyのCDNが配信するため、
// ここでの express.static は削除（または開発環境のみにする）
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
}

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

  // JWT発行
  const payload = {
    userId: user.id,
    username: user.username,
    boothId: user.booth_id,
    boothName: user.booths ? user.booths.name : 'Admin',
    eventId: user.booths ? user.booths.event_id : null,
    isAdmin: !!user.is_admin
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    ok: true,
    token,
    user: {
      username: user.username,
      boothName: payload.boothName,
      isAdmin: payload.isAdmin
    }
  });
});

// トークン検証用ミドルウェア
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (!token) {
    // トークンがない場合はゲスト扱い（req.userを設定しない）
    // ルートによっては弾く処理が必要
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid Token' });
    req.user = user;
    next();
  });
};

app.get('/api/me', authenticateToken, (req, res) => {
  if (!req.user) {
    return res.json({});
  }
  res.json({
    username: req.user.username,
    boothName: req.user.boothName,
    eventId: req.user.eventId,
    isAdmin: req.user.isAdmin
  });
});

// ログアウトAPI (クライアント側でトークンを捨てるだけなので、サーバー側は成功を返すのみ)
app.post('/api/logout', (req, res) => {
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
  // authenticateToken を先に通す前提、またはここで呼ぶ
  // 今回は個別にauthenticateTokenを呼んでいないルートもあるので、
  // ここでheadersを見てverifyするか、ルート定義時に authenticateToken, adminOnly と繋ぐのが綺麗
  // 簡易的にここで検証も兼ねる実装にする
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    if (!user.isAdmin) return res.status(403).json({ error: 'admin only' });
    req.user = user;
    next();
  });
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
app.post('/api/posts', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const { title, body, posted_at, eventId: bodyEventId } = req.body;
  const eventId = req.user.isAdmin ? (bodyEventId || req.user.eventId) : req.user.eventId;
  const boothId = req.user.boothId;

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

// Netlify Functions用エクスポート
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
