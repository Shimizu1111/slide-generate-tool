# slide-generate-tool

世の中のスライドデザインを真似して、自分のスライドを作るツール。
画像や .pptx をアップロードすると、そのデザインを再現したテンプレートを作成し、
そのテンプレートを使って自分のコンテンツでスライドを生成できる。

## 技術スタック

- Vite + Tailwind CSS (フロントエンド)
- PptxGenJS (ブラウザ上でpptx生成)
- JSZip (pptx解析・読み込み)
- Claude API (デザイン解析・スライド生成)
- Cloudflare Pages + Functions (ホスティング・APIプロキシ)

## 2つの機能

### 1. デザインキャプチャ

アップロードされたファイルからデザインを解析し、再現可能なテンプレート(.pptx)を作る。

**入力**: 画像 (PNG, JPG) / .pptx / PDF

**処理**:
1. 画像/PDF → Claude Vision APIでデザイン解析
2. PPTX → JSZipで構造解析
3. 解析結果をもとにAIがpptxgenjsコードを生成しテンプレート構築
4. チャットで修正指示 → 再現精度を上げる

**出力**: テンプレート .pptx（ダウンロード or IndexedDBに保存）

### 2. スライド生成

キャプチャで保存したテンプレート + コンテンツ → 完成スライド(.pptx)を生成する。
テンプレートはIndexedDBから読み込み、キャプチャページと連携する。

**コンテンツの入力方法**:
- **フォームモード**: テンプレートのスライドを選び、プレースホルダーを直接編集
- **チャットモード**: 「Q1の営業報告を作って」→ テンプレートのデザインで生成

**出力**: 完成スライド .pptx（ダウンロード）

## デプロイ（Cloudflare Pages）

- **本番URL**: https://slide-generate-tool.pages.dev
- **プロジェクト名**: `slide-generate-tool`
- デプロイごとに `https://<hash>.slide-generate-tool.pages.dev` の個別URLが発行される
- 本番URLは常に最新のProductionデプロイを指す

### 初回セットアップ
```bash
make setup            # npm install + .dev.vars作成
# .dev.vars の ANTHROPIC_API_KEY に実際のキーを記入
```

### デプロイ手順
```bash
make deploy   # ビルド → デプロイ → .dev.vars からシークレット自動同期
```

### シークレット管理
- **ローカル開発**: `.dev.vars` に `ANTHROPIC_API_KEY=sk-ant-...` を記入
- **本番**: `make deploy` (deploy.sh) が `.dev.vars` を読んで `wrangler pages secret put` で自動同期
- `.dev.vars` は `.gitignore` 済み、Git に入らない

### ローカル開発
```bash
make dev   # vite build → wrangler pages dev dist (Functions含む)
```

### 注意事項
- `wrangler pages deploy` のコミットメッセージは ASCII のみ（日本語不可）
- deploy.sh 内で英語メッセージを指定

## プロジェクト構成

```
slide-generate-tool/
├── CLAUDE.md
├── Makefile
├── package.json
├── vite.config.js
├── wrangler.toml
├── .dev.vars.example
├── src/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js              # エントリーポイント
│       ├── router.js            # ページルーティング
│       ├── pages/
│       │   ├── capture.js       # デザインキャプチャページ
│       │   └── generate.js      # スライド生成ページ
│       └── lib/
│           ├── chat.js          # チャットUI
│           ├── preview.js       # スライドプレビュー
│           ├── pptx-builder.js  # pptxgenjs ラッパー
│           ├── pptx-reader.js   # pptx解析（JSZip）
│           └── template-store.js # テンプレート保存（IndexedDB）
├── functions/
│   └── api/
│       └── chat.js              # Claude APIプロキシ (Pages Function)
└── scripts/deploy.sh
```
