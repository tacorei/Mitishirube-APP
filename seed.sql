-- seed.sql
-- みちしるべ 2026 の初期データ

-- 0) イベント情報の投入
INSERT INTO events (id, name, subtitle, date, location) VALUES
('michishirube-2026', 'Michishirube 2026', '集い、響き合い、一歩踏み出す。心地よい未来へ。', '2026-02-14 (Sat) 09:00-18:00', '沖縄国際大学'),
('sample-event-1', 'Sample Event A', 'サンプルイベントAのキャッチコピー', '2026-06-01 (Mon)', 'Sample Venue A');

-- 1) スケジュールの投入
INSERT INTO schedule (event_id, title, start_time, end_time, description) VALUES
('michishirube-2026', 'オープニング', '2026-02-14 09:00', '2026-02-14 09:30', 'イベントの開始宣言と概要説明'),
('michishirube-2026', 'デジタル体験ワークショップ', '2026-02-14 10:00', '2026-02-14 12:00', '最新テクノロジーに触れる親子向け講座'),
('michishirube-2026', 'ダンスパフォーマンス', '2026-02-14 13:00', '2026-02-14 14:00', '地元の学生によるストリートダンス'),
('michishirube-2026', '教育シンポジウム', '2026-02-14 14:30', '2026-02-14 16:30', 'これからの教育と子育てを考えるパネルディスカッション'),
('michishirube-2026', 'フィナーレ', '2026-02-14 17:30', '2026-02-14 18:00', '一日の振り返りと閉会式');

-- 2) サンプルブースの投入
INSERT INTO booths (event_id, name) VALUES
('michishirube-2026', 'デジタルブース'),
('michishirube-2026', 'スポーツ体験'),
('michishirube-2026', 'わくわくマルシェ'),
('michishirube-2026', '子育て相談室');

-- 3) サンプルユーザーの投入 (pass123)
INSERT INTO booth_users (booth_id, username, password_hash, is_admin) VALUES
(1, 'digital_user', '$2b$10$TPC8wvdhvECqeIKY26nTHuCRJh3xhTPxe0IStHhUZBmArlF8nIW5u', 0),
(NULL, 'admin', '$2b$10$TPC8wvdhvECqeIKY26nTHuCRJh3xhTPxe0IStHhUZBmArlF8nIW5u', 1);
