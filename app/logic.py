# Merged logic.py
# Source A: app/logic.py from body-image-main_new0919.zip
# Source B: /mnt/data/logic.py (uploaded)
# Notes:
# - Keeps Form-Fit voting (VOTE_REQUIRE) logic intact from Source A
# - Upgrades Body Exposure to multi-pair voting/aggregation from Source B
# - Fixes indentation and threshold bugs observed in Source B
# - Adds be_meta and BE_VOTE_REQUIRE to the returned payload

# app/logic.py
from .clip_wrapper import predict_probs_from_url

# ====== 門檻（可調）======
MARGIN_THRESHOLD = 0.5           # 正向機率下限
BORDERLINE_ABS_MARGIN = 0.12     # 證據不足閾值（max(prob) 低於此值不計票）
DIFF_MIN = 0.05                  # 組內差距（pos - neg）下限
VOTE_REQUIRE = 4                 # 合身服裝 6 組中至少需通過的組數
BE_VOTE_REQUIRE = 4              # 身體暴露 7 組中至少需通過的組數（可調）

# ====== prompts（你提供的 6 組 + 1 組）======
FORM_FIT_PAIRS = [
    ("an instagram photo of a woman wearing a form-fitting top",
     "an instagram photo of a woman wearing a loose or oversized top"),
    ("an instagram photo of a woman wearing a fitted, body-hugging top",
     "an instagram photo of a woman wearing a relaxed-fit top"),
    ("an instagram photo of a woman wearing a tight bodycon dress",
     "an instagram photo of a woman wearing a loose dress"),
    ("an instagram photo emphasizing a close-fitting silhouette",
     "an instagram photo emphasizing a relaxed, flowy silhouette"),
    ("an instagram photo of a woman wearing stretchy ribbed knit that clings to the body",
     "an instagram photo of a woman wearing flowy fabric that drapes away from the body"),
    ("an instagram photo of a woman wearing a slim or tailored top",
     "an instagram photo of a woman wearing a boxy top"),
]

BODY_EXPOSURE_PAIRS = [
    ("an instagram photo of a woman wearing a crop top that reveals the midriff",
     "an instagram photo of a woman wearing a top that covers the midriff"),
    ("an instagram photo with a low-cut neckline showing cleavage",
     "an instagram photo with a high neckline that covers the chest"),
    ("an instagram photo of a woman wearing a mini skirt showing the upper thighs",
     "an instagram photo of a woman wearing a knee-length or midi skirt covering the thighs"),
    ("an instagram photo featuring a high-slit dress revealing the leg",
     "an instagram photo featuring a dress without a slit or with a low slit"),
    ("an instagram photo of a woman wearing a backless or deep-back dress revealing the back",
     "an instagram photo of a woman wearing a dress that covers the back"),
    ("an instagram photo with sheer or mesh fabric that reveals skin",
     "an instagram photo with opaque fabrics that do not reveal skin"),
    ("an instagram photo of a woman wearing a strapless or spaghetti-strap top revealing the shoulders",
     "an instagram photo of a woman wearing a sleeved top that covers the shoulders"),
]
# ====== 規則小工具 ======
def _judge_pair_by_thresholds(pos_prob: float, neg_prob: float) -> dict:
    maxp = max(pos_prob, neg_prob)
    diff = pos_prob - neg_prob
    evidence_ok = (maxp >= BORDERLINE_ABS_MARGIN)
    margin_ok = (pos_prob >= MARGIN_THRESHOLD)
    gap_ok = (diff >= DIFF_MIN)
    passed = bool(evidence_ok and margin_ok and gap_ok)
    return {
        "pos_prob": float(pos_prob),
        "neg_prob": float(neg_prob),
        "diff": float(diff),
        "evidence_ok": evidence_ok,
        "margin_ok": margin_ok,
        "gap_ok": gap_ok,
        "passed": passed,
        # 可做權重的信心值
        "confidence": float(maxp),
    }

def _weighted_mean(pairs, value_key="pos_prob", weight_key="diff"):
    """
    對已通過的 pairs 做加權平均。
    回傳 (weighted_value, weight_sum)。若無有效權重，回傳 (None, 0.0)
    """
    num, den = 0.0, 0.0
    for p in pairs:
        v = float(p.get(value_key, 0.0))
        w = float(p.get(weight_key, 0.0))
        if w > 0:  # 僅計入正權重
            num += w * v
            den += w
    if den <= 0:
        return None, 0.0
    return num / den, den

def _aggregate_ff_value(records, agg="max_pos", weight_key="diff"):
    """
    將合身服裝 6 組的 records 彙整為單一代表值。
    agg: "max_pos" | "max_gap" | "weighted_pos" | "weighted_gap"
    回傳 (value, meta)
    """
    passed = [r for r in records if r.get("passed")]
    if not passed:
        return None, {"mode": agg, "used_votes": 0}

    if agg == "max_pos":
        best = max(passed, key=lambda r: r["pos_prob"])
        return best["pos_prob"], {"mode": "max_pos", "used_votes": len(passed)}

    if agg == "max_gap":
        best = max(passed, key=lambda r: r["diff"])
        return best["pos_prob"], {"mode": "max_gap", "used_votes": len(passed), "best_gap": best["diff"]}

    if agg == "weighted_pos":
        val, wsum = _weighted_mean(passed, value_key="pos_prob", weight_key=weight_key)
        if val is not None:
            return val, {"mode": f"weighted_pos[{weight_key}]", "used_votes": len(passed), "weight_sum": wsum}

    if agg == "weighted_gap":
        val, wsum = _weighted_mean(passed, value_key="diff", weight_key=weight_key)
        if val is not None:
            return val, {"mode": f"weighted_gap[{weight_key}]", "used_votes": len(passed), "weight_sum": wsum}

    # fallback
    best = max(passed, key=lambda r: r["pos_prob"])
    return best["pos_prob"], {"mode": "fallback_max_pos", "used_votes": len(passed)}

# ====== 面向評估 ======
def evaluate_form_fitting_from_url(image_url, model, preprocess, device, timeout=8):
    """6 組合身服裝對比 → 個別判斷 → 投票彙總"""
    pair_results, votes = [], 0
    for (pos, neg) in FORM_FIT_PAIRS:
        res = predict_probs_from_url(image_url, model, preprocess, device, [pos, neg], timeout=timeout)
        if "scores" not in res:
            pair_results.append({"prompts": (pos, neg), "error": res.get("error", "unknown error")})
            continue
        pos_prob = float(res["scores"][pos])
        neg_prob = float(res["scores"][neg])
        judged = _judge_pair_by_thresholds(pos_prob, neg_prob)
        judged["prompts"] = (pos, neg)
        pair_results.append(judged)
        if judged["passed"]:
            votes += 1
    return {
        "passed": bool(votes >= VOTE_REQUIRE),
        "votes": votes,
        "required": VOTE_REQUIRE,
        "pairs": pair_results,
    }

def evaluate_body_exposure_from_url(image_url, model, preprocess, device, timeout=8):
    """7 組身體暴露對比 → 個別判斷 → 投票彙總"""
    pair_results, votes = [], 0
    for (pos, neg) in BODY_EXPOSURE_PAIRS:
        res = predict_probs_from_url(image_url, model, preprocess, device, [pos, neg], timeout=timeout)
        if "scores" not in res:
            pair_results.append({"prompts": (pos, neg), "error": res.get("error", "unknown error")})
            continue
        pos_prob = float(res["scores"][pos])
        neg_prob = float(res["scores"][neg])
        judged = _judge_pair_by_thresholds(pos_prob, neg_prob)
        judged["prompts"] = (pos, neg)
        pair_results.append(judged)
        if judged["passed"]:
            votes += 1
    return {
        "passed": bool(votes >= BE_VOTE_REQUIRE),
        "votes": votes,
        "required": BE_VOTE_REQUIRE,
        "pairs": pair_results,
    }






def evaluate_image(image_url, model, preprocess, device, timeout=8,
                   agg="max_pos", weight_key="diff", combine="max"):
    """
    兩大維度 → 代表值 → final_prob
      - 兩者皆未通過 → final_prob = 0.0
      - 否則：FF 依 agg 聚合；BE 亦以多組聚合（同 FF 規則）；再以 combine('max'|'mean') 合併
    """
    form_fit = evaluate_form_fitting_from_url(image_url, model, preprocess, device, timeout)
    body_exp = evaluate_body_exposure_from_url(image_url, model, preprocess, device, timeout)

    def ff_value_from_records(ff_dict):
        if not ff_dict.get("passed"):
            return None, {"mode": agg, "used_votes": 0}
        records = [p for p in ff_dict.get("pairs", []) if p.get("passed")]
        if not records:
            return None, {"mode": agg, "used_votes": 0}
        return _aggregate_ff_value(records, agg=agg, weight_key=weight_key)

    def be_value_from_records(be_dict):
        if not be_dict.get("passed"):
            return None, {"mode": agg, "used_votes": 0}
        records = [p for p in be_dict.get("pairs", []) if p.get("passed")]
        if not records:
            return None, {"mode": agg, "used_votes": 0}
        return _aggregate_ff_value(records, agg=agg, weight_key=weight_key)

    ff_value, ff_meta = ff_value_from_records(form_fit)
    be_value, be_meta = be_value_from_records(body_exp)

    candidates = [v for v in (ff_value, be_value) if v is not None]
    if not candidates:
        final_prob = 0.0
    else:
        final_prob = float(sum(candidates) / len(candidates)) if combine == "mean" else float(max(candidates))

    return {
        "url": image_url,
        "form_fitting": form_fit,
        "body_exposure": body_exp,
        "final_prob": final_prob,   # ⭐ 交付用單一機率
        "agg": agg,                 # max_pos / max_gap / weighted_pos / weighted_gap
        "weight_key": weight_key,   # 加權時採用的權重欄位（預設 diff）
        "combine": combine,         # FF 與 BE 合併策略：'max' 或 'mean'
        "ff_meta": ff_meta,         # FF 聚合的說明資訊
        "be_meta": be_meta,
        "ff_value": ff_value,       # ⭐ FF 代表值（已依 agg 算好）
        "be_value": be_value,       # ⭐ BE 代表值（通過才有值，否則 None）
        "thresholds": {
            "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
            "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
            "DIFF_MIN": DIFF_MIN,
            "VOTE_REQUIRE": VOTE_REQUIRE,
            "BE_VOTE_REQUIRE": BE_VOTE_REQUIRE,
        }
    }