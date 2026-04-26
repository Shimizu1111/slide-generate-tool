.PHONY: help setup create clone generate generate-ui inspect test clean

# ============================================================
#  make help で使い方を表示
# ============================================================

help:
	@echo ""
	@echo "  slide-generate-tool"
	@echo "  ==================="
	@echo ""
	@echo "  \033[1mセットアップ\033[0m"
	@echo "    make setup              初回セットアップ (依存関係インストール)"
	@echo ""
	@echo "  \033[1m3つの機能\033[0m"
	@echo "    make create             テンプレートを会話形式で作る (Web UI)"
	@echo "    make clone              既存テンプレートを完全に複製する (Web UI)"
	@echo "    make generate-ui        画面でスライドを組み立てて生成する (Web UI)"
	@echo "    make generate           テンプレートからスライドを生成する (CLI)"
	@echo ""
	@echo "  \033[1mユーティリティ\033[0m"
	@echo "    make inspect            テンプレートの構造を確認する"
	@echo "    make test               全モジュールの動作確認"
	@echo "    make clean              生成物を削除"
	@echo ""
	@echo "  \033[1m使い方の例\033[0m"
	@echo "    make create                                           → チャットでデザインを伝える"
	@echo "    make clone                                            → pptxをアップロードして複製"
	@echo "    make generate-ui                                      → 画面でスライドを組み立てる"
	@echo "    make generate T=templates/sales.pptx I=input/q1.json  → CLIでスライド生成"
	@echo "    make inspect T=templates/sales.pptx                   → レイアウト情報を表示"
	@echo ""

# ============================================================
#  セットアップ
# ============================================================

setup:
	pip install -r requirements.txt
	@echo ""
	@echo "  セットアップ完了。make help で使い方を確認してください。"

# ============================================================
#  機能1: テンプレート作成 (Web UI)
# ============================================================

create:
	@echo "  テンプレート作成UIを起動します..."
	@echo "  ブラウザでチャットしながらテンプレートを作れます。"
	@echo ""
	streamlit run src/ui/app.py -- --page create

# ============================================================
#  機能2: テンプレート複製 (Web UI)
# ============================================================

clone:
	@echo "  テンプレート複製UIを起動します..."
	@echo "  元のpptxをアップロードし、差分がゼロになるまで改善します。"
	@echo ""
	streamlit run src/ui/app.py -- --page clone

# ============================================================
#  機能3a: スライド生成 (Web UI)
# ============================================================

generate-ui:
	@echo "  スライド生成UIを起動します..."
	@echo "  テンプレートを選んでスライドを組み立てます。"
	@echo ""
	streamlit run src/ui/app.py -- --page generate

# ============================================================
#  機能3b: スライド生成 (CLI)
# ============================================================

T ?= templates/test_template.pptx
I ?= input/test_data.json
O ?= output/$(shell basename $(T) .pptx)_generated.pptx

generate:
ifndef T
	@echo "  使い方: make generate T=<テンプレート> I=<入力JSON>"
	@echo "  例:     make generate T=templates/sales.pptx I=input/q1.json"
	@exit 1
endif
ifndef I
	@echo "  使い方: make generate T=<テンプレート> I=<入力JSON>"
	@echo "  例:     make generate T=templates/sales.pptx I=input/q1.json"
	@exit 1
endif
	python generate.py --template $(T) --input $(I) --output $(O)

# ============================================================
#  ユーティリティ
# ============================================================

inspect:
	python generate.py --template $(T) --inspect

test:
	@python -c "\
from src.core.inspector import inspect_template; \
from src.core.builder import create_blank_presentation, add_slide, add_textbox, save_presentation; \
from src.core.generator import generate_slides; \
from src.core.comparator import compare_templates; \
from src.core.renderer import check_libreoffice; \
prs = create_blank_presentation(); \
slide = add_slide(prs, 0); \
add_textbox(slide, 25, 20, 200, 30, 'Test', font_name='Arial', font_size_pt=28); \
save_presentation(prs, 'templates/test_template.pptx'); \
info = inspect_template('templates/test_template.pptx'); \
print('  inspector:  OK'); \
import json; \
open('input/test_data.json','w').write(json.dumps({'slides':[{'layout':0,'placeholders':{'0':'Hello'}}]})); \
generate_slides('templates/test_template.pptx','input/test_data.json','output/test_output.pptx'); \
print('  generator:  OK'); \
diffs = compare_templates('templates/test_template.pptx','output/test_output.pptx'); \
print(f'  comparator: OK ({diffs[\"total_diffs\"]} diffs)'); \
print(f'  renderer:   {\"OK\" if check_libreoffice() else \"SKIP (LibreOffice not found)\"}'); \
print(); \
print('  All checks passed.')"

clean:
	rm -rf output/*.pptx
	@echo "  output/ を削除しました。"
