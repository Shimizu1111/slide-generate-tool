"""テンプレート比較・差分検出モジュール。

2つのpptxテンプレートを比較し、フォント差・配置差・色差などを
構造化データとしてレポートする。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.inspector import inspect_template, emu_to_mm


def compare_templates(
    source_path: str | Path,
    target_path: str | Path,
) -> dict[str, Any]:
    """2つのテンプレートを比較して差分を返す。"""
    source = inspect_template(source_path)
    target = inspect_template(target_path)

    diffs: list[dict[str, Any]] = []

    # スライドサイズ比較
    if source["slide_width"] != target["slide_width"]:
        diffs.append(_diff("slide_width", source["slide_width"], target["slide_width"], "mm"))
    if source["slide_height"] != target["slide_height"]:
        diffs.append(_diff("slide_height", source["slide_height"], target["slide_height"], "mm"))

    # レイアウト比較
    layout_diffs = _compare_layouts(source["slide_layouts"], target["slide_layouts"])
    diffs.extend(layout_diffs)

    # スライド比較
    slide_diffs = _compare_slides(source["slides"], target["slides"])
    diffs.extend(slide_diffs)

    return {
        "total_diffs": len(diffs),
        "diffs": diffs,
        "summary": _summarize_diffs(diffs),
    }


def _compare_layouts(
    source_layouts: list[dict], target_layouts: list[dict]
) -> list[dict[str, Any]]:
    """レイアウト群を比較。"""
    diffs: list[dict[str, Any]] = []
    max_len = max(len(source_layouts), len(target_layouts))

    for i in range(max_len):
        prefix = f"layout[{i}]"

        if i >= len(source_layouts):
            diffs.append({"path": prefix, "type": "extra_in_target", "detail": target_layouts[i]["name"]})
            continue
        if i >= len(target_layouts):
            diffs.append({"path": prefix, "type": "missing_in_target", "detail": source_layouts[i]["name"]})
            continue

        src = source_layouts[i]
        tgt = target_layouts[i]

        if src["name"] != tgt["name"]:
            diffs.append(_diff(f"{prefix}.name", src["name"], tgt["name"]))

        ph_diffs = _compare_placeholders(src["placeholders"], tgt["placeholders"], prefix)
        diffs.extend(ph_diffs)

    return diffs


def _compare_placeholders(
    source_phs: list[dict], target_phs: list[dict], prefix: str
) -> list[dict[str, Any]]:
    """プレースホルダー群を比較。"""
    diffs: list[dict[str, Any]] = []

    src_by_idx = {ph["idx"]: ph for ph in source_phs}
    tgt_by_idx = {ph["idx"]: ph for ph in target_phs}

    all_idxs = set(src_by_idx.keys()) | set(tgt_by_idx.keys())

    for idx in sorted(all_idxs):
        ph_prefix = f"{prefix}.placeholder[{idx}]"

        if idx not in src_by_idx:
            diffs.append({"path": ph_prefix, "type": "extra_in_target"})
            continue
        if idx not in tgt_by_idx:
            diffs.append({"path": ph_prefix, "type": "missing_in_target"})
            continue

        src_ph = src_by_idx[idx]
        tgt_ph = tgt_by_idx[idx]

        # 位置・サイズ比較
        for prop in ["left", "top", "width", "height"]:
            if src_ph.get(prop) != tgt_ph.get(prop):
                diffs.append(_diff(f"{ph_prefix}.{prop}", src_ph.get(prop), tgt_ph.get(prop), "mm"))

        # テキストフレーム比較
        if "text_frame" in src_ph and "text_frame" in tgt_ph:
            tf_diffs = _compare_text_frames(src_ph["text_frame"], tgt_ph["text_frame"], ph_prefix)
            diffs.extend(tf_diffs)

    return diffs


def _compare_slides(
    source_slides: list[dict], target_slides: list[dict]
) -> list[dict[str, Any]]:
    """スライド群を比較。"""
    diffs: list[dict[str, Any]] = []
    max_len = max(len(source_slides), len(target_slides))

    for i in range(max_len):
        prefix = f"slide[{i}]"

        if i >= len(source_slides):
            diffs.append({"path": prefix, "type": "extra_in_target"})
            continue
        if i >= len(target_slides):
            diffs.append({"path": prefix, "type": "missing_in_target"})
            continue

        src = source_slides[i]
        tgt = target_slides[i]

        if src["layout_name"] != tgt["layout_name"]:
            diffs.append(_diff(f"{prefix}.layout_name", src["layout_name"], tgt["layout_name"]))

        shape_diffs = _compare_shapes(src["shapes"], tgt["shapes"], prefix)
        diffs.extend(shape_diffs)

    return diffs


def _compare_shapes(
    source_shapes: list[dict], target_shapes: list[dict], prefix: str
) -> list[dict[str, Any]]:
    """シェイプ群を比較。"""
    diffs: list[dict[str, Any]] = []

    # 名前でマッチング
    src_by_name = {s["name"]: s for s in source_shapes}
    tgt_by_name = {s["name"]: s for s in target_shapes}

    all_names = list(dict.fromkeys(
        [s["name"] for s in source_shapes] + [s["name"] for s in target_shapes]
    ))

    for name in all_names:
        shape_prefix = f"{prefix}.shape[{name}]"

        if name not in src_by_name:
            diffs.append({"path": shape_prefix, "type": "extra_in_target"})
            continue
        if name not in tgt_by_name:
            diffs.append({"path": shape_prefix, "type": "missing_in_target"})
            continue

        src_shape = src_by_name[name]
        tgt_shape = tgt_by_name[name]

        # 位置・サイズ比較（許容誤差 0.5mm）
        for prop in ["left", "top", "width", "height"]:
            src_val = src_shape.get(prop)
            tgt_val = tgt_shape.get(prop)
            if src_val is not None and tgt_val is not None:
                if abs(src_val - tgt_val) > 0.5:
                    diffs.append(_diff(f"{shape_prefix}.{prop}", src_val, tgt_val, "mm"))

        # テキストフレーム比較
        if "text_frame" in src_shape and "text_frame" in tgt_shape:
            tf_diffs = _compare_text_frames(
                src_shape["text_frame"], tgt_shape["text_frame"], shape_prefix
            )
            diffs.extend(tf_diffs)

    return diffs


def _compare_text_frames(
    src_tf: dict, tgt_tf: dict, prefix: str
) -> list[dict[str, Any]]:
    """テキストフレームを比較。"""
    diffs: list[dict[str, Any]] = []

    src_paras = src_tf.get("paragraphs", [])
    tgt_paras = tgt_tf.get("paragraphs", [])

    max_len = max(len(src_paras), len(tgt_paras))
    for i in range(max_len):
        p_prefix = f"{prefix}.paragraph[{i}]"

        if i >= len(src_paras):
            diffs.append({"path": p_prefix, "type": "extra_in_target"})
            continue
        if i >= len(tgt_paras):
            diffs.append({"path": p_prefix, "type": "missing_in_target"})
            continue

        src_p = src_paras[i]
        tgt_p = tgt_paras[i]

        if src_p.get("alignment") != tgt_p.get("alignment"):
            diffs.append(_diff(f"{p_prefix}.alignment", src_p.get("alignment"), tgt_p.get("alignment")))

        # ラン比較
        src_runs = src_p.get("runs", [])
        tgt_runs = tgt_p.get("runs", [])
        run_max = max(len(src_runs), len(tgt_runs))

        for j in range(run_max):
            r_prefix = f"{p_prefix}.run[{j}]"

            if j >= len(src_runs) or j >= len(tgt_runs):
                if j >= len(src_runs):
                    diffs.append({"path": r_prefix, "type": "extra_in_target"})
                else:
                    diffs.append({"path": r_prefix, "type": "missing_in_target"})
                continue

            src_r = src_runs[j]
            tgt_r = tgt_runs[j]

            for prop in ["font_name", "font_size_pt", "bold", "italic", "underline", "color_rgb"]:
                if src_r.get(prop) != tgt_r.get(prop):
                    unit = "pt" if prop == "font_size_pt" else None
                    diffs.append(_diff(f"{r_prefix}.{prop}", src_r.get(prop), tgt_r.get(prop), unit))

    return diffs


def _diff(
    path: str,
    source_value: Any,
    target_value: Any,
    unit: str | None = None,
) -> dict[str, Any]:
    """差分レコードを生成。"""
    d: dict[str, Any] = {
        "path": path,
        "type": "value_mismatch",
        "source": source_value,
        "target": target_value,
    }
    if unit:
        d["unit"] = unit
    return d


def _summarize_diffs(diffs: list[dict[str, Any]]) -> dict[str, int]:
    """差分の種別ごとのカウントを返す。"""
    summary: dict[str, int] = {}
    for d in diffs:
        category = _categorize_diff(d["path"])
        summary[category] = summary.get(category, 0) + 1
    return summary


def _categorize_diff(path: str) -> str:
    """差分パスからカテゴリを推定。"""
    if "font" in path or "bold" in path or "italic" in path:
        return "font"
    if "color" in path:
        return "color"
    if any(p in path for p in ["left", "top", "width", "height"]):
        return "position_size"
    if "alignment" in path:
        return "alignment"
    if "layout" in path:
        return "layout"
    return "other"
