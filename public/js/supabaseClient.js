
// src/supabaseClient.js
// Supabaseクライアントの初期化
// ※利用するには、SupabaseのダッシュボードからURLとAnon Keyを取得して書き換えてください。

// CDNから読み込んでいるため、window.supabase が利用可能です (index.html等のscriptタグで読み込みが必要)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
    console.warn('Supabase URL is not configured in supabaseClient.js');
}

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// エクスポート (module形式でない場合は window に生やすなど必要ですが、今回は簡易的にグローバル変数として扱う想定、あるいはmoduleとして読み込む)
if (typeof module !== 'undefined') {
    module.exports = { supabase };
} else {
    window.appSupabase = supabase;
}
