.PHONY: help setup dev build deploy

# ============================================================
#  make help で使い方を表示
# ============================================================

help:
	@echo ""
	@echo "  slide-generate-tool"
	@echo "  ==================="
	@echo ""
	@echo "  \033[1mセットアップ\033[0m"
	@echo "    make setup              初回セットアップ (npm install + .dev.vars作成)"
	@echo ""
	@echo "  \033[1m開発\033[0m"
	@echo "    make dev                ローカル開発サーバー起動"
	@echo "    make build              ビルドのみ"
	@echo ""
	@echo "  \033[1mデプロイ\033[0m"
	@echo "    make deploy             Cloudflare Pagesにデプロイ"
	@echo ""
	@echo "  \033[1m使い方の流れ\033[0m"
	@echo "    1. make setup    → 初回セットアップ"
	@echo "    2. .dev.vars に ANTHROPIC_API_KEY を設定"
	@echo "    3. make dev      → ローカルで動作確認"
	@echo "    4. make deploy   → 本番デプロイ (.dev.varsからシークレット自動同期)"
	@echo ""

# ============================================================
#  セットアップ
# ============================================================

setup:
	npm install
	@if [ ! -f .dev.vars ]; then \
		cp .dev.vars.example .dev.vars; \
		echo ""; \
		echo "  セットアップ完了。"; \
		echo "  .dev.vars の ANTHROPIC_API_KEY を設定してください。"; \
	else \
		echo ""; \
		echo "  セットアップ完了。(.dev.vars は既に存在します)"; \
	fi

# ============================================================
#  開発
# ============================================================

dev:
	npm run build && wrangler pages dev dist

build:
	npm run build

# ============================================================
#  デプロイ
# ============================================================

deploy:
	bash scripts/deploy.sh
