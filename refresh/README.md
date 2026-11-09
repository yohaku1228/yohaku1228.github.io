# 家計とカード Phase 1

iPhoneから使う家計管理のレビュー版です。既存サイトのコードと保存データには手を加えず、`refresh/` に独立したアプリを置いています。

```powershell
cd refresh
pnpm install --frozen-lockfile
pnpm dev
```

表示されたURLの `/refresh/` を開きます。初期設定ファイルは個別に配布します。開始月を選択して「その他」→「設定とバックアップ」から読み込むか、予算画面で入力してください。レビュー時はテストデータを使ってください。

端末内保存で、別のiPhoneとは同期しません。設定からCSV、JSON保存、JSON復元を利用できます。旧一括バックアップはファイルの月数と件数を確認できます。旧明細の取込、AI、画像添付、共同利用、オフライン起動は後続です。

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

調査・移行・技術選定・ロードマップは [設計と移行](./設計と移行.md) を参照してください。
