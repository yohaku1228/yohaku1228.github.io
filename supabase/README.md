# 家計とカードのクラウド接続

GitHub Pagesのフロントと、Supabase Freeの認証・データベース・Edge Functionを組み合わせます。家計はアカウントごとに保存します。

1. Supabase Freeで専用のプロジェクトを用意し、`migrations/202611100001_household_ledger.sql` を適用します。
2. 一般の新規登録を無効にし、Authenticationの管理画面で本人のメールとパスワードを登録します。確認済みユーザーのUUIDを控えます。
3. Edge Function Secretsで `HOUSEHOLD_OWNER_ID` にそのUUIDを入れます。既存のGeminiプロジェクトが無料枠で動いていることを確認してから、`GEMINI_API_KEY` と `GEMINI_FREE_TIER_CONFIRMED=true` を設定します。このフラグは管理者の確認を表し、Googleの契約状態を自動で検証するものではありません。支払いを有効にしたプロジェクトのキーは使用しないでください。
4. リポジトリのルートから `supabase functions deploy receipt --project-ref <プロジェクトID> --no-verify-jwt` でデプロイします。関数自身がSupabase Authでトークンを確認し、指定した本人以外の呼び出しを拒否します。別ドメインで試す場合は `APP_ORIGIN` をそのオリジンに設定します。
5. フロントの `refresh/.env.local` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定し、`pnpm build` します。これらは公開用です。サービスロールキーやGeminiキーは `VITE_` の変数に入れないでください。
6. 最初のログインでクラウドが空なら「この端末のデータを取り込む」が表示されます。移行を確定するか、別端末のバックアップを「設定とバックアップ」から復元します。以後、編集の確定時にクラウドへ保存します。通信エラー時には未送信のデータを端末に一時保管し、再送できます。複数端末で同時に変更すると最新版への上書きを防ぎ、未送信の内容を書き出せます。
7. もう1台で同じアカウントにログインして反映を確認し、レシートを1枚読み取り、保存前に内容と金額を確認します。Googleへ送るのは読み取り時に選んだ画像です。画像は家計データには保存されません。

公式資料：[SupabaseのSecrets](https://supabase.com/docs/guides/functions/secrets)・[Geminiの料金](https://ai.google.dev/gemini-api/docs/pricing)
