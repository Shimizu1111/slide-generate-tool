# slide-generate-tool

スライド(PPTX)を自動生成するツール。

## 技術スタック

- Python
- python-pptx (テンプレート構築・解析・スライド生成)
- Streamlit (Web UI)
- LibreOffice / pdf2image (スライド→画像変換、プレビュー用)

## 3つの機能

### 1. テンプレート作成 (Web UI: チャット + ライブプレビュー)

会話形式でテンプレート(.pptx)をゼロから作る。

- 左ペイン: チャットでデザイン意図を伝える
- 右ペイン: テンプレートのライブプレビュー（スライド画像）
- 対話を通じてレイアウト・配色・フォント・構成を詰める
- 納得いくまで修正を繰り返す

### 2. テンプレート複製 (Web UI: 左右比較 + 差分表示)

既存の .pptx を完全に再現可能なテンプレートとして複製する。

- 左ペイン: 元テンプレートのプレビュー
- 右ペイン: 再現中テンプレートのプレビュー
- 差分を自動検出し表示（フォント差、配置差、色差など）
- 自動修正 or 手動指示で差がなくなるまで繰り返す
- 最終的にピクセルレベルで一致させる

### 3. スライド生成 (CLI)

テンプレート + 入力データ → 完成スライドを生成する。

```bash
python generate.py --template templates/sales.pptx --input data.json --output output/sales_q1.pptx
```

- テンプレートのプレースホルダーに内容を流し込む
- コード側にデザイン情報を持たない（テンプレートの書式をそのまま継承）
- 入力はJSON等の構造化データ、またはテキスト

## アーキテクチャ原則

### テンプレート駆動（スライド生成時）

- **コードでデザインしない** — レイアウト・配置・フォント・配色はすべてテンプレート(.pptx)が持つ
- **コードは内容の流し込みだけ** — スライド生成時にコードがやるのはレイアウト選択とプレースホルダーへの投入のみ

```python
# ✅ OK: プレースホルダーに内容を流し込む
layout = prs.slide_layouts[1]
slide = prs.slides.add_slide(layout)
slide.placeholders[0].text = "タイトル"
slide.placeholders[1].text = "本文"

# ❌ NG: コードで座標・フォントを指定する (スライド生成時)
txBox = slide.shapes.add_textbox(Inches(1.2), Inches(0.8), Inches(8), Inches(1))
txBox.text_frame.paragraphs[0].font.size = Pt(28)
```

※ テンプレート作成・複製時はデザインを構築するため、座標・フォント指定は許容される。

## プロジェクト構成

```
slide-generate-tool/
├── CLAUDE.md
├── requirements.txt
├── src/
│   ├── core/                    # 基盤ロジック
│   │   ├── inspector.py         #   テンプレート解析
│   │   ├── builder.py           #   テンプレート構築
│   │   ├── comparator.py        #   テンプレート比較・差分検出
│   │   ├── renderer.py          #   スライド→画像変換(プレビュー用)
│   │   └── generator.py         #   スライド生成エンジン
│   │
│   └── ui/                      # Streamlit Web UI
│       ├── app.py               #   メインアプリ (ページルーティング)
│       ├── create_template.py   #   テンプレート作成ページ
│       └── clone_template.py    #   テンプレート複製ページ
│
├── generate.py                  # CLI: スライド生成
├── templates/                   # テンプレート .pptx
├── input/                       # 入力データ
└── output/                      # 生成されたスライド
```
