# --- add this block at the very top ---
import os, sys
HERE = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, ".."))   # 專案根目錄
PKG_DIR = os.path.abspath(HERE)                             # prompt_evaluation 目錄
for p in (PROJECT_ROOT, PKG_DIR):                           # 兩個都塞，兩種執行法都能跑
    if p not in sys.path:
        sys.path.insert(0, p)
# --------------------------------------

import pandas as pd
from typing import List, Tuple

from app.clip_wrapper import load_clip_model
from app.logic import evaluate_image

# ✅ 同一層就用相對匯入；若直接跑檔案失敗則退回絕對匯入
try:
    from .resources import normal_images, beauty_images   # python -m 時會走這條
except ImportError:
    from resources import normal_images, beauty_images    # 直接 python prompt_evaluation/evaluation.py 時會走這條


# ---------- helpers: 重建與讀取代表值，讓 CSV 與 final_prob 對齊 ----------

def _weighted_mean(pairs, value_key="pos_prob", weight_key="diff"):
    num = den = 0.0
    for p in pairs:
        if p.get("passed"):
            v = float(p.get(value_key, 0.0))
            w = float(p.get(weight_key, 0.0))
            if w > 0:
                num += v * w
                den += w
    return (num / den) if den > 0 else 0.0

def _ff_value_from_packed(packed: dict, agg: str, weight_key: str) -> float:
    """優先使用 logic.py 回傳的 ff_value；否則依 agg/weight_key 以 ff.pairs 重建"""
    if "ff_value" in packed and packed["ff_value"] is not None:
        return float(packed["ff_value"])
    ff = packed.get("form_fitting", {}) or {}
    pairs = ff.get("pairs", []) or []
    passed = [p for p in pairs if p.get("passed")]
    if not passed:
        return 0.0
    if agg == "weighted_pos":
        return _weighted_mean(passed, value_key="pos_prob", weight_key=weight_key)
    if agg == "weighted_gap":
        # 若需要用 gap 作為代表，可回傳加權後的 diff；多數情況仍建議 weighted_pos
        return _weighted_mean(passed, value_key="diff", weight_key=weight_key)
    if agg == "max_gap":
        return float(max(passed, key=lambda p: p.get("diff", 0.0)).get("pos_prob", 0.0))
    # 預設：max_pos
    return float(max(passed, key=lambda p: p.get("pos_prob", 0.0)).get("pos_prob", 0.0))

def _be_value_from_packed(packed: dict) -> float:
    """優先使用 logic.py 回傳的 be_value；否則在 be_passed=True 時回傳該組 pos_prob，否則 0.0"""
    if "be_value" in packed and packed["be_value"] is not None:
        return float(packed["be_value"])
    be = packed.get("body_exposure", {}) or {}
    if not be.get("passed"):
        return 0.0
    pair = be.get("pair") or {}
    return float(pair.get("pos_prob", 0.0))


def batch_predict_and_format(
    normal_images: List[str],
    beauty_images: List[str],
    timeout: int = 8,
    group_labels: Tuple[str, str] = ("normal", "beauty"),
    agg: str = "weighted_pos",          # ⭐ 預設使用加權平均
    weight_key: str = "diff",           # ⭐ 預設權重 = diff
    combine: str = "max",               # ⭐ FF 與 BE 合併策略
):
    """
    建立格式化的 DataFrame，包含每張圖片的：
    - final_prob（整體代表機率，與 evaluate_image 完全一致）
    - form_fitting（= FF 代表值，來源與 final_prob 相同聚合）
    - body_exposure（= BE 代表值，通過時的 pos_prob，未通過為 0）
    - ff_passed / ff_votes / be_passed / be_diff（診斷用）
    - ff_mode / ff_used_votes / ff_weight_sum（加權聚合 meta）
    """
    columns = [
        "type", "link", "final_prob",
        "form_fitting", "ff_passed", "ff_votes",
        "body_exposure", "be_passed", "be_diff",
        "ff_mode", "ff_used_votes", "ff_weight_sum"
    ]

    model, preprocess, device = load_clip_model()
    rows = []

    for group_name, urls in zip(group_labels, [normal_images, beauty_images]):
        for url in urls:
            packed = evaluate_image(
                url, model, preprocess, device,
                timeout=timeout,
                agg=agg,
                weight_key=weight_key,
                combine=combine,
            )

            ff_meta = packed.get("ff_meta", {}) or {}
            ff_value = _ff_value_from_packed(packed, agg=agg, weight_key=weight_key)
            be_value = _be_value_from_packed(packed)

            # 基礎診斷欄位
            ff_dict = packed.get("form_fitting", {}) or {}
            be_dict = packed.get("body_exposure", {}) or {}
            be_pair = be_dict.get("pair", {}) or {}

            row = {
                "type": group_name,
                "link": url,
                "final_prob": float(packed["final_prob"]),
                "form_fitting": float(ff_value),  # ✅ 與 final_prob 的 FF 來源一致
                "ff_passed": bool(ff_dict.get("passed", False)),
                "ff_votes": int(ff_dict.get("votes", 0)),
                "body_exposure": float(be_value),  # ✅ 未通過時為 0.0，與 final_prob 的使用規則一致
                "be_passed": bool(be_dict.get("passed", False)),
                "be_diff": float(be_pair.get("diff", 0.0)),
                # 加權相關 meta
                "ff_mode": ff_meta.get("mode"),
                "ff_used_votes": ff_meta.get("used_votes"),
                "ff_weight_sum": ff_meta.get("weight_sum", 0.0),
            }
            rows.append(row)

    df = pd.DataFrame(rows, columns=columns)
    return df


if __name__ == "__main__":
    print("🚀 Running evaluation on resources images (agg=weighted_pos)...")
    df = batch_predict_and_format(normal_images, beauty_images, timeout=8)
    print(df.head())
    out_path = "test_final_prob.csv"
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"✅ Results saved to {out_path}")
