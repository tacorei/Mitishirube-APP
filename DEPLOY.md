# Netlify デプロイ手順

このアプリは **Netlify** で公開することを想定しています。
（GitHub Pagesではバックエンド機能が動かないため、正常に動作しません）

## 手順

1. **GitHubにプッシュする**
   - 最新のコードをGitHubリポジトリにプッシュします。

2. **Netlifyでサイトを作成する**
   - [Netlify](https://app.netlify.com/) にログインします。
   - "Add new site" -> "Import from existing project" を選択します。
   - "GitHub" を選び、このリポジトリを選択します。

3. **設定の確認**
   - `netlify.toml` というファイルを含めているため、設定は自動的に検出されるはずです。
   - **Build settings** が以下のようになっているか確認してください（変更不要なはずです）：
     - **Build command**: (空欄 または `npm install`)
     - **Publish directory**: `public`
     - **Functions directory**: `functions`

4. **環境変数の設定 (重要)**
   - "Site configuration" -> "Environment variables" に移動します。
   - 以下の変数を追加してください（`.env` の内容と同じもの）：
     - `SUPABASE_URL`: (SupabaseのURL)
     - `SUPABASE_KEY`: (SupabaseのAnon Key)
     - `JWT_SECRET`: (任意の文字列、例: `my-secret-key-123`)

5. **デプロイ**
   - 設定が終わると自動的にデプロイが始まります。
   - 完了すると `https://xxxxxx.netlify.app` というURLが発行されます。

## トラブルシューティング

### 404 Not Found になる場合
- **GitHub Pagesを見ていませんか？**
  - URLが `github.io` の場合は GitHub Pages です。NetlifyのURLを確認してください。
- **Publish directory の設定**
  - Netlify上で Publish directory が `public` になっているか再確認してください。設定ファイル (`netlify.toml`) があれば優先されますが、念のため。
