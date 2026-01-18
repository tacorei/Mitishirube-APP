// src/supabaseClient.js

// 1) Netlifyの環境変数から注入された値を読み取る (ビルド時注入が必要)
// あるいは、パブリックな値としてハードコードする
// ※SupabaseのURLとAnon Keyは公開しても安全な設計になっています (RLSで守るため)
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
    console.warn('⚠️ Supabase URL/Key is not set in public/js/supabaseClient.js');
}

// 2) クライアント作成
const supabase = (window.supabase && SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// 3) グローバルに公開
window.appSupabase = supabase;
