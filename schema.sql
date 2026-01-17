-- 0) イベント情報を一元管理するテーブル
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, -- 'michishirube-2026' 等の文字列ID
  name TEXT NOT NULL,
  subtitle TEXT,
  date TEXT,
  location TEXT
);

-- 1) ブース情報を管理するテーブル
CREATE TABLE IF NOT EXISTS booths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- 2) ブース担当者（簡易ログイン用）を管理するテーブル
CREATE TABLE IF NOT EXISTS booth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booth_id INTEGER, -- NULL の場合は全イベント共通の管理者等
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0, -- 1 なら管理者（イベント編集可能）
  FOREIGN KEY (booth_id) REFERENCES booths(id)
);

-- 3) 最新情報の投稿を管理するテーブル
CREATE TABLE IF NOT EXISTS booth_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL, -- どのイベントの投稿か
  booth_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  FOREIGN KEY (booth_id) REFERENCES booths(id)
);

-- 4) 日程表を管理するテーブル
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL, -- どのイベントのスケジュールか
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  description TEXT
);
