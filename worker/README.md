# 家計とカードのCloudflare運用

HOMEWARDと同じCloudflareアカウントで、家計専用のWorkerとD1を使います。GitHubはソース管理に使います。画面・ログイン・保存・食費の助言の入口は同じWorkerです。

1. Workers Freeのアカウントで `kakei-to-card` 専用のD1を用意し、設定の `d1_databases` にデータベースIDを入れます。 `wrangler d1 migrations apply DB --remote` で空の家計データベースを初期化します。
2. `refresh/` で `VITE_CLOUDFLARE=1` を設定して `pnpm build` し、ルートで `pnpm dlx wrangler@4.92.0 deploy` を実行します。作成したデータベースIDをローカル設定に分ける場合は `--config wrangler.local.json` を付けます。
3. WorkerのSecretsに、家計専用のランダムな `APP_PASSWORD`（24文字以上）と `SESSION_SECRET`（32文字以上）を設定します。どちらかを変更すると、すべての既存ログインが無効になります。
4. 既存のGeminiプロジェクトが無料枠であることを確認したら、WorkerのSecretsに `GEMINI_API_KEY` と `GEMINI_FREE_TIER_CONFIRMED=true` を設定します。この設定は確認済みという意味で、Google側の契約状態を自動判定するものではありません。食費の助言は1日15回までで、ボタンを押したときに集計額と残り日数を送ります。
5. iPhoneでは新URLをSafariで開き、ホーム画面へ追加します。

家計はパスワードで保護します。招待やメールでの新規登録はありません。保存が競合した場合は最新版を保護し、未送信の内容を書き出せます。
