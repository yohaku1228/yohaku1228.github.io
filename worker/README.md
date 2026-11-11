# MoneyFlow ManagerのCloudflare運用

HOMEWARDと同じCloudflareアカウントで、家計専用のWorkerとD1を使います。GitHubはソース管理に使います。画面・ログイン・保存・食費の助言の入口は同じWorkerです。

1. Workers Freeのアカウントで `kakei-to-card` 専用のD1を用意し、設定の `d1_databases` にデータベースIDを入れます。 `wrangler d1 migrations apply DB --remote` で空の家計データベースを初期化します。
2. `refresh/` で `VITE_CLOUDFLARE=1` を設定して `pnpm build` し、ルートで `pnpm dlx wrangler@4.92.0 deploy` を実行します。作成したデータベースIDをローカル設定に分ける場合は `--config wrangler.local.json` を付けます。
3. WorkerのSecretsに、家計専用のランダムな `APP_PASSWORD`（24文字以上）と `SESSION_SECRET`（32文字以上）を設定します。どちらかを変更すると、すべての既存ログインが無効になります。
4. Workers AIは設定の `ai: { "binding": "AI" }` で接続します。モデルは `vars.AI_MODEL = "@cf/google/gemma-4-26b-a4b-it"`。Workerは `env.AI.run` を利用し、Geminiへの通信・APIキーは不要です。既存のGemini Secretsは参照しません。
5. iPhoneでは新URLをSafariで開き、ホーム画面へ追加します。

家計はパスワードで保護します。招待やメールでの新規登録はありません。保存が競合した場合は最新版を保護し、未送信の内容を書き出せます。

## 食費チャット

- このリポジトリはwrangler.jsoncを使用します。TOMLの場合は `[ai]` の下に `binding = "AI"` を指定します。重複する設定ファイルは作りません。
- Workers Freeで運用します。1日10,000 Neuronsの無料枠を超えるとAIの呼び出しは失敗します。Paidへ変更すると超過分は課金対象です。https://developers.cloudflare.com/workers-ai/platform/pricing/
- 既存のD1テーブルreceipt_quotaを再利用し、家族全体で1日15回までに制限します。追加質問・推論エラーも1回に含みます。日付はUTC（日本時間9時切替）。アカウント全体の無料枠とは別の制限です。
- 当月の食費予算がある場合、ホームにチャットを表示します。食費の集計額・残り日数・直近5往復と質問（合計10,000文字以内）を送ります。質問は1,000文字以内。会話は画面を離れると消え、家計には保存しません。通信エラー時は入力を保持します。
- POST /api/food-adviceは従来の集計のみの送信にも対応します。messages（user/assistant交互、最後はuser）付きで追加質問に回答します。ログイン・同一Originの検証は維持します。
- 本番画面とAPIは同じWorkerで配信します。GitHubはソース管理に使います。
- 検証: `node --test worker/index.test.mjs` と `pnpm --dir refresh build`。
- モデル情報: https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
