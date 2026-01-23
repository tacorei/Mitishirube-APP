// app.js
// Express + Supabaseで日程表APIと最新情報APIを提供する
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken'); // 互換性のため残すが、基本Supabase Authを使う
const bcrypt = require('bcryptjs');

// 1) Expressアプリを作成
const app = express();

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

// --- 認証用エンドポイント / ミドルウェア ---

// 旧来の自前ログイン (/api/login) は廃止し、フロントエンド側でSupabase Authを行う。
// サーバー側は送られてきたJWTを検証し、Profileテーブルから権限を確認する。

// トークン検証用ミドルウェア
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (!token) {
    return next(); // ゲスト扱い
  }

  try {
    // 1) ユーザーのトークンを使って、そのユーザー権限でDBにアクセスするクライアントを作成
    // これにより、署名の検証、有効期限の確認、RLS用コンテキストの確立が全て行われる
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 2) Supabase公式の方法でユーザーを取得・検証
    const { data: { user }, error } = await userSupabase.auth.getUser();

    if (error || !user) {
      // トークンが無効または期限切れ
      return res.status(403).json({ error: 'Invalid Token' });
    }

    // 3) Profilesテーブルから権限を取得
    const { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const role = profile ? profile.role : 'user';

    // 4) req.user を構築
    req.user = {
      id: user.id,
      role: role,
      isAdmin: role === 'admin',
      isStaff: role === 'staff' || role === 'admin',
      username: profile ? profile.username : (user.user_metadata.full_name || 'User')
    };
    next();

  } catch (e) {
    console.error('Internal Auth Error:', e);
    return res.status(500).json({ error: 'Internal Auth Error' });
  }
};

// 権限チェックミドルウェア
const requireStaff = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  // authenticateTokenが先に実行されている前提なら req.user があるはずだが、
  // 安全のためここでも verify フローを通すか、route定義で authenticateToken -> requireStaff の順にする。
  // ここでは route定義側で `authenticateToken` を必須とする。
  if (!req.user || !req.user.isStaff) {
    return res.status(403).json({ error: 'Forbidden: Staff access required' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access only' });
  }
  next();
};

// /api/me: 自分の情報を返す (デバッグ/確認用)
app.get('/api/me', authenticateToken, (req, res) => {
  if (!req.user) return res.json({});
  res.json(req.user);
});

// 全イベント取得 (公開API: 誰でも閲覧可能)
app.get('/api/events', async (req, res) => {
  const { data, error } = await supabase.from('events').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data });
});

// イベント作成
app.post('/api/events', authenticateToken, requireStaff, async (req, res) => {
  const { id, name, subtitle, date, location } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Id and name are required' });

  const { error } = await supabase
    .from('events')
    .insert([{ id, name, subtitle, date, location }]);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// イベント更新
app.put('/api/events/:id', authenticateToken, requireStaff, async (req, res) => {
  const { name, subtitle, date, location } = req.body;
  const { error } = await supabase
    .from('events')
    .update({ name, subtitle, date, location })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// イベント削除 (Admin only)
app.delete('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- コンテンツ用API ---

// スケジュール取得 (全員ログイン必須: User以上)
app.get('/api/schedule', authenticateToken, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

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

app.get('/api/timeline', authenticateToken, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

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

app.get('/api/posts', authenticateToken, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

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

// 最新情報（ブース投稿）を保存するAPI (要ログイン: Staff以上)
app.post('/api/posts', authenticateToken, requireStaff, async (req, res) => {
  const { title, body, posted_at, eventId: bodyEventId } = req.body;

  // スタッフはどのイベントにも投稿できる(簡易実装)
  // あるいは profiles に担当イベントを持たせる設計もありだが、今回は自由
  const eventId = bodyEventId;

  // ブースIDの扱いは、profilesテーブルには無いので一旦NULLにするか、
  // 必要な場合は profiles に booth_id カラムを追加する必要がある。
  // 今回は「スタッフ投稿」として booth_id は NULL または汎用的な値でも許容する、
  // もしくはSupabase側で booth_posts の booth_id を nullable にしておく推奨。
  // ここでは暫定的に NULL を送る (booth_users テーブルは使わなくなったため)
  const boothId = null;

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
