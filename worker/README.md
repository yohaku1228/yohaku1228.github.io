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
- アプリ独自の1日あたりの回数制限は設けません。Cloudflareアカウント全体の無料枠が利用上限です。旧receipt_quotaテーブルは参照しません。
- 当月の食費予算がある場合、ホームにチャットを表示します。食費の集計額・残り日数・直近5往復と質問（合計10,000文字以内）を送ります。質問は1,000文字以内。会話は画面を離れると消え、家計には保存しません。通信エラー時は入力を保持します。
- POST /api/food-adviceは従来の集計のみの送信にも対応します。messages（user/assistant交互、最後はuser）付きで追加質問に回答します。ログイン・同一Originの検証は維持します。
- 本番画面とAPIは同じWorkerで配信します。GitHubはソース管理に使います。
- 検証: `node --test worker/index.test.mjs` と `pnpm --dir refresh build`。
- モデル情報: https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- 献立は親2人・食べ盛りの子ども3人を前提に、主食・十分な主菜・野菜をそろえ、主要な材料量と作り方を提案します。手持ち食材を生かし、不足する食材は量・目的・購入優先度・代用品を示します。予算不足を食事量の削減だけで解決せず、食費への再配分も相談します。価格・在庫は推測して断定しません。生成結果の分量や価格が保証されるものではありません。

## 晩ごはんカレンダー

- ホームとメニューから独立した「晩ごはん」を開き、日付を選んで予定または食べた記録を登録・編集・削除します。未来の日付は予定として登録し、当日以降に「食べた」へ変更できます。予定は最終調理日や調理履歴に含めません。支出のカレンダー・家計集計にも加算しません。
- favoriteMeals / mealHistoryを家計JSONの任意項目として保存します。既存の家計データはそのまま読み込め、D1のスキーマ変更は不要です。晩ごはんは既存のクラウド保存・競合検知に従います。
- 定番未設定の場合は32種類を表示します。チキンステーキ・からあげ・パスタ・グラタンなどを追加し、うどんは1つに統一。既存のうどんの履歴はIDをまとめて最終調理日を計算します。旧カタログに新しい候補を追加し、mealCatalogVersion=2以降の明示的な削除は尊重します。明示的な空リストも空のまま維持します。
- 最終調理日から14日以上の定番を間隔の長い順に表示します。未記録は「記録なし」とし、作っていないと断定しません。未来の記録は候補の計算から除外します。
- AIへ定番（材料の好みと最終日を含む）と直近30件の料理・メモを送信します。経過日数はWorkerでも計算します。買い物リストは生成文として表示し、食材の在庫はユーザーの申告を使います。献立記録から在庫を推測しません。
- 献立相談は食費予算未設定でも使用できます。会話は一時的ですが、料理の記録は端末をまたいで共有されます。
- 選択日の予定を優先してAIが買い物リストを提案します。回答は日付別のmealShoppingへ保存・手入力編集ができ、既存のクラウド保存で夫婦共有します。別端末で更新した内容は再読み込みで取得します。
- mealPreferencesに家族の好み・量・買い物ルールを保存できます。AIは予定・履歴・好みをリクエストごとに参照します。モデル自体を自動再学習する機能ではありません。
- 追加検証: `node --test worker/meal-context.test.mjs` と `node --experimental-strip-types --test refresh/src/meals.test.ts`。
