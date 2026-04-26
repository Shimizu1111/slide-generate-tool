"""メインアプリ — ページルーティング。"""

import sys
from pathlib import Path

# プロジェクトルートをsys.pathに追加
_project_root = str(Path(__file__).resolve().parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# .env から環境変数を読み込み
from dotenv import load_dotenv
load_dotenv(Path(_project_root) / ".env", override=True)

import streamlit as st

st.set_page_config(
    page_title="Slide Generate Tool",
    page_icon="📊",
    layout="wide",
)

# --page 引数でデフォルトページを指定可能
default_page = "テンプレート作成"
if "--page" in sys.argv:
    idx = sys.argv.index("--page")
    if idx + 1 < len(sys.argv):
        page_arg = sys.argv[idx + 1]
        if page_arg == "clone":
            default_page = "テンプレート複製"
        elif page_arg == "generate":
            default_page = "スライド生成"

pages = ["テンプレート作成", "テンプレート複製", "スライド生成"]

st.sidebar.title("Slide Generate Tool")
selection = st.sidebar.radio(
    "機能を選択",
    pages,
    index=pages.index(default_page),
)

if selection == "テンプレート作成":
    from src.ui.create_template import render_page
    render_page()
elif selection == "テンプレート複製":
    from src.ui.clone_template import render_page
    render_page()
elif selection == "スライド生成":
    from src.ui.generate_slides import render_page
    render_page()
