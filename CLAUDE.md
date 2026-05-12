# slide-generate-tool

世の中のスライドデザインを真似して、自分のスライドを作るツール。
画像や .pptx をアップロードすると、そのデザインを再現したテンプレートを作成し、
そのテンプレートを使って自分のコンテンツでスライドを生成できる。

## 技術スタック

### Web版（メイン / Cloudflare Pages）
- Vite + Tailwind CSS (フロントエンド)
- PptxGenJS (ブラウザ上でpptx生成)
- JSZip (pptx解析・読み込み)
- Claude API (デザイン解析・スライド生成)
- Cloudflare Pages Functions (APIプロキシ)

### Python版（ローカル開発用）
- python-pptx (テンプレート構築・スライド生成)
- Streamlit (Web UI)
- Claude Vision API (画像からデザイン解析)
- LibreOffice / pdf2image (スライド→画像変換、プレビュー用)

## 2つの機能

### 1. デザインキャプチャ (Web UI)

アップロードされたファイルからデザインを解析し、再現可能なテンプレート(.pptx)を作る。

**入力**:
- 画像 (PNG, JPG など) — スライドのスクリーンショットやデザイン画像
- .pptx — 既存のパワーポイントファイル
- PDF — スライド資料

**処理**:
1. 画像/.pptx/PDF からデザイン要素を解析（レイアウト、配色、フォント、余白、装飾など）
2. 解析結果をもとに python-pptx でテンプレート(.pptx)を構築
3. 元のデザインと並べてプレビュー比較
4. 差分があれば調整を繰り返し、再現精度を上げる

**出力**:
- テンプレート .pptx（プレースホルダー付き）
- デザイン定義ファイル（レイアウト構成・色・フォント等のメタデータ）

### 2. スライド生成 (Web UI)

テンプレート + コンテンツ → 完成スライド(.pptx)を生成する。

**コンテンツの入力方法**:
- チャットで伝える: 「Q1の営業報告を作って」→ テンプレートのデザインで生成
- 直接編集: タイトル・本文などをフォームで入力・編集

**処理**:
- テンプレートのプレースホルダーにコンテンツを流し込む
- コード側にデザイン情報を持たない（テンプレートの書式をそのまま継承）

**出力**:
- 完成スライド .pptx（ダウンロード可能）

## アーキテクチャ原則

### テンプレート駆動（スライド生成時）

- **コードでデザインしない** — レイアウト・配置・フォント・配色はすべてテンプレート(.pptx)が持つ
- **コードは内容の流し込みだけ** — スライド生成時にコードがやるのはレイアウト選択とプレースホルダーへの投入のみ

```python
# OK: プレースホルダーに内容を流し込む
layout = prs.slide_layouts[1]
slide = prs.slides.add_slide(layout)
slide.placeholders[0].text = "タイトル"
slide.placeholders[1].text = "本文"

# NG: コードで座標・フォントを指定する (スライド生成時)
txBox = slide.shapes.add_textbox(Inches(1.2), Inches(0.8), Inches(8), Inches(1))
txBox.text_frame.paragraphs[0].font.size = Pt(28)
```

※ デザインキャプチャ時はデザインを構築するため、座標・フォント指定は許容される。

### デザインキャプチャ → スライド生成の連携

- デザインキャプチャで作ったテンプレート + デザイン定義を、スライド生成が参照する
- この連携により、元のデザインを高精度に再現したスライドが生成できる

## デプロイ（Cloudflare Pages）

### 初回セットアップ
```bash
make web-setup                          # npm install
cp web/.dev.vars.example web/.dev.vars  # API キーを設定
# web/.dev.vars の ANTHROPIC_API_KEY に実際のキーを記入
```

### デプロイ手順
```bash
make web-deploy   # ビルド → デプロイ → .dev.vars からシークレット自動同期
```

### シークレット管理
- **ローカル開発**: `web/.dev.vars` に `ANTHROPIC_API_KEY=sk-ant-...` を記入
- **本番**: `make web-deploy` (deploy.sh) が `.dev.vars` を読んで `wrangler pages secret put` で自動同期
- `.dev.vars` は `.gitignore` 済み、Git に入らない

### ローカル開発
```bash
make web-dev   # vite build → wrangler pages dev dist (Functions含む)
```

### 注意事項
- `wrangler pages deploy` のコミットメッセージは ASCII のみ（日本語不可）
- deploy.sh 内で `--commit-message` を英語で指定している

## プロジェクト構成

```
slide-generate-tool/
├── CLAUDE.md
├── Makefile
├── requirements.txt
│
├── web/                          # Web版（Cloudflare Pages）★メイン
│   ├── src/
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── main.js           #   エントリーポイント
│   │       ├── router.js         #   ページルーティング
│   │       ├── pages/
│   │       │   ├── capture.js    #   デザインキャプチャページ
│   │       │   └── generate.js   #   スライド生成ページ
│   │       └── lib/
│   │           ├── chat.js       #   チャットUI
│   │           ├── preview.js    #   スライドプレビュー
│   │           ├── pptx-builder.js  # pptxgenjs ラッパー
│   │           └── pptx-reader.js   # pptx解析（JSZip）
│   ├── functions/
│   │   └── api/
│   │       └── chat.js           #   Claude APIプロキシ (Pages Function)
│   ├── scripts/deploy.sh
│   ├── wrangler.toml
│   ├── .dev.vars.example
│   ├── package.json
│   └── vite.config.js
│
├── src/                          # Python版（ローカル開発用）
│   ├── core/
│   │   ├── analyzer.py
│   │   ├── builder.py
│   │   ├── renderer.py
│   │   └── generator.py
│   └── ui/
│       ├── app.py
│       ├── capture.py
│       └── generate.py
│
├── templates/                    # テンプレート .pptx
├── designs/                      # デザイン定義ファイル
└── output/                       # 生成されたスライド
```
