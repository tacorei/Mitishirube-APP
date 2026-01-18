-- RLSポリシーの修正用スクリプト
-- イベントが表示されない場合、このスクリプトを実行してください

-- 1) イベントテーブルのRLSを確実に有効化
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 2) 既存の閲覧ポリシーがあれば一旦削除（衝突回避）
DROP POLICY IF EXISTS "Public view events" ON public.events;

-- 3) 「誰でも（publicロール＝未ログイン含む）閲覧可能」なポリシーを再作成
CREATE POLICY "Public view events"
ON public.events
FOR SELECT
TO public
USING (true);

-- 4) 念のため anon (未ログイン) ロールへのSELECT権限を付与
GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.events TO authenticated;
