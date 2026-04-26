"""CLI: スライド生成。

テンプレート + 入力データ → 完成スライドを生成する。

Usage:
    python generate.py --template templates/sales.pptx --input data.json --output output/sales_q1.pptx
    python generate.py --template templates/sales.pptx --input data.json  # output/ に自動保存
    python generate.py --template templates/sales.pptx --input data.json --validate  # 検証のみ
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from src.core.generator import generate_slides, validate_input_data
from src.core.inspector import inspect_template


def main():
    parser = argparse.ArgumentParser(description="テンプレートからスライドを生成する")
    parser.add_argument(
        "--template", "-t",
        required=True,
        help="テンプレート .pptx ファイルのパス",
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="入力データファイル (JSON) のパス",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="出力先パス (デフォルト: output/<テンプレート名>_generated.pptx)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="生成せず入力データの検証のみ行う",
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="テンプレートの構造を表示する",
    )

    args = parser.parse_args()

    template_path = Path(args.template)
    if not template_path.exists():
        print(f"エラー: テンプレートが見つかりません: {template_path}", file=sys.stderr)
        sys.exit(1)

    # テンプレート構造表示
    if args.inspect:
        import json
        info = inspect_template(template_path)
        print(json.dumps(info, ensure_ascii=False, indent=2))
        return

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"エラー: 入力ファイルが見つかりません: {input_path}", file=sys.stderr)
        sys.exit(1)

    # 検証モード
    if args.validate:
        issues = validate_input_data(template_path, input_path)
        if issues:
            print("検証エラー:")
            for issue in issues:
                print(f"  - {issue}")
            sys.exit(1)
        else:
            print("検証OK: 入力データはテンプレートと整合しています。")
        return

    # 出力先
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = Path("output") / f"{template_path.stem}_generated.pptx"

    # 検証
    issues = validate_input_data(template_path, input_path)
    if issues:
        print("警告:")
        for issue in issues:
            print(f"  - {issue}")
        print()

    # 生成
    result = generate_slides(template_path, input_path, output_path)
    print(f"生成完了: {result}")


if __name__ == "__main__":
    main()
