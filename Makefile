.PHONY: help setup capture generate test clean web-setup web-dev web-build web-deploy

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
	@echo "  \033[1m2つの機能\033[0m"
	@echo "    make capture            デザインキャプチャ (Web UI)"
	@echo "    make generate           スライド生成 (Web UI)"
	@echo ""
	@echo "  \033[1mユーティリティ\033[0m"
	@echo "    make test               全モジュールの動作確認"
	@echo "    make clean              生成物を削除"
	@echo ""
	@echo "  \033[1mWeb版 (Cloudflare Pages)\033[0m"
	@echo "    make web-setup          Web版の初回セットアップ"
	@echo "    make web-dev            ローカル開発サーバー起動"
	@echo "    make web-deploy         Cloudflare Pagesにデプロイ"
	@echo ""
	@echo "  \033[1m使い方の流れ\033[0m"
	@echo "    1. make capture   → 画像/pptx/PDFをアップロードしてテンプレート作成"
	@echo "    2. make generate  → テンプレートを選んでスライド生成"
	@echo ""

# ============================================================
#  セットアップ
# ============================================================

setup:
	pip install -r requirements.txt
	@echo ""
	@echo "  セットアップ完了。make help で使い方を確認してください。"

# ============================================================
#  機能1: デザインキャプチャ (Web UI)
# ============================================================

capture:
	@echo "  デザインキャプチャUIを起動します..."
	@echo "  画像・pptx・PDFをアップロードしてテンプレートを作れます。"
	@echo ""
	streamlit run src/ui/app.py -- --page capture

# ============================================================
#  機能2: スライド生成 (Web UI)
# ============================================================

generate:
	@echo "  スライド生成UIを起動します..."
	@echo "  テンプレートを選んでスライドを生成します。"
	@echo ""
	streamlit run src/ui/app.py -- --page generate

# ============================================================
#  ユーティリティ
# ============================================================

test:
	@python -c "\
from src.core.analyzer import analyze_pptx, analyze_pptx_summary; \
from src.core.builder import create_blank_presentation, add_slide, add_textbox, save_presentation; \
from src.core.generator import generate_slides; \
from src.core.renderer import check_libreoffice; \
prs = create_blank_presentation(); \
slide = add_slide(prs, 0); \
add_textbox(slide, 25, 20, 200, 30, 'Test', font_name='Arial', font_size_pt=28); \
save_presentation(prs, 'templates/test_template.pptx'); \
info = analyze_pptx('templates/test_template.pptx'); \
print('  analyzer:   OK'); \
import json; \
open('output/test_data.json','w').write(json.dumps({'slides':[{'layout':0,'placeholders':{'0':'Hello'}}]})); \
generate_slides('templates/test_template.pptx','output/test_data.json','output/test_output.pptx'); \
print('  generator:  OK'); \
print(f'  renderer:   {\"OK\" if check_libreoffice() else \"SKIP (LibreOffice not found)\"}'); \
print(); \
print('  All checks passed.')"

clean:
	rm -rf output/*.pptx
	@echo "  output/ を削除しました。"

# ============================================================
#  Web版 (Cloudflare Pages)
# ============================================================

web-setup:
	cd web && npm install
	@echo ""
	@echo "  Web版セットアップ完了。"
	@echo "  1. cp web/.dev.vars.example web/.dev.vars して API_KEY を設定"
	@echo "  2. make web-dev でローカル起動"

web-dev:
	cd web && npm run build && wrangler pages dev dist

web-build:
	cd web && npm run build

web-deploy:
	cd web && bash scripts/deploy.sh
