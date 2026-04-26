# slide-generate-tool

スライド(PPTX)を自動生成するツール。3つの機能を提供します。

## セットアップ

```bash
make setup
```

前提: Python 3.9+、LibreOffice（プレビュー表示に必要）

## 3つの機能

### 1. テンプレートを作る → `make create`

チャットでデザインの要望を伝えると、テンプレート(.pptx)を作ってくれます。

```bash
make create
```

ブラウザが開き、左にチャット・右にプレビューが表示されます。
「青ベースで、タイトルスライドと本文スライドが欲しい」のように伝えてください。
納得いくまで何度でも修正できます。完成したらダウンロード。

### 2. テンプレートを複製する → `make clone`

手元にある .pptx をプログラムで完全に再現可能なテンプレートに変換します。

```bash
make clone
```

ブラウザが開き、元テンプレートをアップロードすると自動で複製を開始。
左に元、右に複製中のプレビューが並び、差分（フォント差、配置差、色差など）が表示されます。
「自動修正」ボタンか手動指示で、差分ゼロになるまで繰り返します。

### 3. スライドを生成する → `make generate`

テンプレート + 入力データ(JSON) → 完成スライドを出力します。

```bash
make generate T=templates/sales.pptx I=input/q1.json
```

出力先は `output/sales_generated.pptx` に自動決定されます。
`O=` で明示指定も可能:

```bash
make generate T=templates/sales.pptx I=input/q1.json O=output/custom_name.pptx
```

#### 入力JSONの形式

```json
{
  "slides": [
    {
      "layout": 0,
      "placeholders": {
        "0": "スライドタイトル",
        "1": "本文テキスト"
      }
    },
    {
      "layout_name": "2カラム",
      "placeholders": {
        "0": "比較タイトル",
        "1": "左カラムの内容",
        "2": "右カラムの内容"
      }
    }
  ]
}
```

`layout` (番号) か `layout_name` (名前) でレイアウトを指定し、
`placeholders` にプレースホルダー番号とテキストを書きます。

## ユーティリティ

```bash
make inspect T=templates/sales.pptx   # テンプレートの構造(レイアウト・プレースホルダー一覧)を表示
make test                               # 全モジュールの動作確認
make clean                              # output/ の生成物を削除
```

## 全体の流れ

```
make create  or  make clone
       ↓
   templates/my_template.pptx  ← テンプレートができる
       ↓
make generate T=templates/my_template.pptx I=input/data.json
       ↓
   output/my_template_generated.pptx  ← 完成スライド
```
