# app/logic.py — Dual-gate (PERSON+FEMALE) with per-pair renormalization (pos+neg=1)
# -----------------------------------------------------------------------------------
# Stage-1 gate: PERSON + FEMALE scores >= GATE_THRESHOLD (both). If fail -> final_prob=0, skip Stage-2
# Stage-2: Combine FF + BE into one pool, ALWAYS evaluate all 13 pairs (FF6 + BE7)
#          Require TOTAL_VOTE_REQUIRE=8 passed pairs; else final_prob=0
#          Aggregate passed pairs into clothing_value using agg (default "weighted_pos")
#          final_prob = clothing_value
# Efficiency: exactly one CLIP forward per stage (batch prompts)
# Important: For every pair (pos_text, neg_text), we re-normalize to ensure pos_prob+neg_prob == 1,
#            regardless of whether upstream returns global softmax or raw logits.

from .clip_wrapper import predict_probs_from_url

# ====== Thresholds (tunable) ======
MARGIN_THRESHOLD = 0.5           # positive prob lower bound for a pair to be considered
BORDERLINE_ABS_MARGIN = 0.12     # evidence floor (max(pos,neg) must be >= this)
DIFF_MIN = 0.05                  # pair-wise gap lower bound (pos - neg)

# Stage-1 gate (BOTH PERSON & FEMALE must be >= this)
GATE_THRESHOLD = 0.3

# Stage-2: fixed requirement "8 out of 13"
TOTAL_VOTE_REQUIRE = 8
EXPECTED_TOTAL_PAIRS = 13  # FF(6) + BE(7)

# ====== Prompts ======
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

# Stage-1 pairs
PERSON_PAIRS = [
    ("a photo with a visible person", "no person in the image"),
]
FEMALE_PAIRS = [
    ("a woman in the photo", "a man in the photo"),
]

# ====== Helpers ======
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
        "confidence": float(maxp),
    }

def _weighted_mean(pairs, value_key="pos_prob", weight_key="diff"):
    """
    Weighted mean over pairs; only positive weights are counted.
    Returns (value, weight_sum). If no positive weights, returns (None, 0.0).
    """
    num, den = 0.0, 0.0
    for p in pairs:
        v = float(p.get(value_key, 0.0))
        w = float(p.get(weight_key, 0.0))
        if w > 0:
            num += w * v
            den += w
    if den <= 0:
        return None, 0.0
    return num / den, den

def _aggregate_value_from_passed(records, agg="weighted_pos", weight_key="diff"):
    """
    Aggregate a single score from passed=True records.
    agg: "max_pos" | "max_gap" | "weighted_pos" | "weighted_gap"
    Default is weighted_pos -> sum(pos*diff)/sum(diff)
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

    if agg == "weighted_gap":
        val, wsum = _weighted_mean(passed, value_key="diff", weight_key=weight_key)
        if val is not None:
            return val, {"mode": f"weighted_gap[{weight_key}]", "used_votes": len(passed), "weight_sum": wsum}

    # default and recommended: weighted_pos
    val, wsum = _weighted_mean(passed, value_key="pos_prob", weight_key=weight_key)
    if val is not None:
        return val, {"mode": f"weighted_pos[{weight_key}]", "used_votes": len(passed), "weight_sum": wsum}

    best = max(passed, key=lambda r: r["pos_prob"])
    return best["pos_prob"], {"mode": "fallback_max_pos", "used_votes": len(passed)}

def _aggregate_group_score_all(records, value_key="pos_prob", weight_key="diff"):
    """
    For Stage-1 gate: aggregate over ALL judged rows,
    but only include those with evidence_ok and diff > 0 to reduce noise.
    """
    usable = [{
        "pos_prob": r["pos_prob"],
        "diff": r["diff"],
        "confidence": r["confidence"]
    } for r in records if r.get("evidence_ok") and r.get("diff", 0.0) > 0.0]

    val, wsum = _weighted_mean(usable, value_key=value_key, weight_key=weight_key)
    if val is None:
        return 0.0, {"mode": f"gate_weighted[{value_key}|{weight_key}]", "used": 0, "weight_sum": 0.0}
    return float(val), {"mode": f"gate_weighted[{value_key}|{weight_key}]", "used": len(usable), "weight_sum": float(wsum)}

def _pairs_to_prompts_with_index(group_name, pairs):
    prompts, idx_map = [], {}
    for i, (pos, neg) in enumerate(pairs):
        idx_map[(group_name, i, "pos")] = len(prompts); prompts.append(pos)
        idx_map[(group_name, i, "neg")] = len(prompts); prompts.append(neg)
    return prompts, idx_map

def _gather_rows(scores_dict, prompts, idx_map, group_name, num_pairs):
    """
    Build per-pair rows with *pairwise renormalization* so that:
        pos_prob + neg_prob == 1   (unless both raw scores are 0)
    This keeps our thresholds meaningful even if upstream used a global softmax.
    """
    rows = []
    for i in range(num_pairs):
        pos_p = prompts[idx_map[(group_name, i, "pos")]]
        neg_p = prompts[idx_map[(group_name, i, "neg")]]

        raw_pos = float(scores_dict.get(pos_p, 0.0))
        raw_neg = float(scores_dict.get(neg_p, 0.0))

        denom = raw_pos + raw_neg
        if denom <= 0.0:
            pos_prob = 0.0
            neg_prob = 0.0
        else:
            pos_prob = raw_pos / denom
            neg_prob = raw_neg / denom

        rows.append((pos_prob, neg_prob, pos_p, neg_p))
    return rows

# ====== Main pipeline: 2-stage ======
def evaluate_image(image_url, model, preprocess, device, timeout=8,
                   agg="weighted_pos", weight_key="diff",
                   fast=True, k=4):
    """
    Stage-1: PERSON + FEMALE gate (one forward; Top-K per group; both >= GATE_THRESHOLD)
    Stage-2: Merge FF + BE (one forward; ALWAYS evaluate all 13 pairs; require votes >= 8)
             final_prob = clothing_value (aggregated with 'agg', default weighted_pos)
    """
    # ---------- Stage-1 (PERSON + FEMALE gate in one forward) ----------
    def _select_idx(pairs, k):
        return list(range(min(k, len(pairs)))) if fast else list(range(len(pairs)))

    female_idx = _select_idx(FEMALE_PAIRS, k)
    person_idx = _select_idx(PERSON_PAIRS, k)  # PERSON currently 1 pair

    f_prompts, f_map = _pairs_to_prompts_with_index("FEMALE", [FEMALE_PAIRS[i] for i in female_idx])
    p_prompts, p_map = _pairs_to_prompts_with_index("PERSON", [PERSON_PAIRS[i] for i in person_idx])

    stage1_prompts = f_prompts + p_prompts

    # stage1_map with PERSON offset
    stage1_map = {}
    stage1_map.update(f_map)
    offset1 = len(f_prompts)
    stage1_map.update({k: idx + offset1 for k, idx in p_map.items()})

    res1 = predict_probs_from_url(image_url, model, preprocess, device, stage1_prompts, timeout=timeout)
    s1 = res1.get("scores", {}) if isinstance(res1, dict) else {}
    if not s1 or len(s1) < len(stage1_prompts):
        return {
            "url": image_url,
            "final_prob": 0.0,
            "error": "stage1_scores_incomplete",
            "thresholds": {
                "GATE_THRESHOLD": GATE_THRESHOLD,
                "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
                "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
                "DIFF_MIN": DIFF_MIN,
                "TOTAL_VOTE_REQUIRE": TOTAL_VOTE_REQUIRE,
                "EXPECTED_TOTAL_PAIRS": EXPECTED_TOTAL_PAIRS,
            }
        }

    def _judge_rows(rows):
        out = []
        for pos_prob, neg_prob, pos_txt, neg_txt in rows:
            rec = _judge_pair_by_thresholds(pos_prob, neg_prob)
            rec.update({"pos_text": pos_txt, "neg_text": neg_txt})
            out.append(rec)
        return out

    female_rows = _gather_rows(s1, stage1_prompts, stage1_map, "FEMALE", len(female_idx))
    person_rows = _gather_rows(s1, stage1_prompts, stage1_map, "PERSON", len(person_idx))

    female_judged = _judge_rows(female_rows)
    person_judged = _judge_rows(person_rows)

    female_score, female_meta2 = _aggregate_group_score_all(female_judged, value_key="pos_prob", weight_key="diff")
    person_score, person_meta2 = _aggregate_group_score_all(person_judged, value_key="pos_prob", weight_key="diff")

    gate_pass = (female_score >= GATE_THRESHOLD and person_score >= GATE_THRESHOLD)
    if not gate_pass:
        return {
            "url": image_url,
            "final_prob": 0.0,
            "clothing_value": None,
            "clothing_meta": {"skipped": True, "reason": "gate_not_pass"},
            "ff_breakdown": {"pairs": [], "votes": 0},
            "be_breakdown": {"pairs": [], "votes": 0},
            "person_meta": {"pairs": person_judged, "score": person_score, "gate_threshold": GATE_THRESHOLD, **person_meta2},
            "female_meta": {"pairs": female_judged, "score": female_score, "gate_threshold": GATE_THRESHOLD, **female_meta2},
            "thresholds": {
                "GATE_THRESHOLD": GATE_THRESHOLD,
                "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
                "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
                "DIFF_MIN": DIFF_MIN,
                "TOTAL_VOTE_REQUIRE": TOTAL_VOTE_REQUIRE,
                "EXPECTED_TOTAL_PAIRS": EXPECTED_TOTAL_PAIRS,
            }
        }

    # ---------- Stage-2 (ALWAYS full coverage: FF6 + BE7) ----------
    ff_pairs = FORM_FIT_PAIRS          # 6
    be_pairs = BODY_EXPOSURE_PAIRS     # 7

    ff_prompts, ff_map = _pairs_to_prompts_with_index("FF", ff_pairs)
    be_prompts, be_map = _pairs_to_prompts_with_index("BE", be_pairs)

    stage2_prompts = ff_prompts + be_prompts

    # stage2_map with BE offset
    stage2_map = {}
    stage2_map.update(ff_map)
    offset2 = len(ff_prompts)
    stage2_map.update({k: idx + offset2 for k, idx in be_map.items()})

    res2 = predict_probs_from_url(image_url, model, preprocess, device, stage2_prompts, timeout=timeout)
    s2 = res2.get("scores", {}) if isinstance(res2, dict) else {}
    if not s2 or len(s2) < len(stage2_prompts):
        return {
            "url": image_url,
            "final_prob": 0.0,
            "error": "stage2_scores_incomplete",
            "person_meta": {"pairs": person_judged, "score": person_score, "gate_threshold": GATE_THRESHOLD, **person_meta2},
            "female_meta": {"pairs": female_judged, "score": female_score, "gate_threshold": GATE_THRESHOLD, **female_meta2},
            "thresholds": {
                "GATE_THRESHOLD": GATE_THRESHOLD,
                "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
                "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
                "DIFF_MIN": DIFF_MIN,
                "TOTAL_VOTE_REQUIRE": TOTAL_VOTE_REQUIRE,
                "EXPECTED_TOTAL_PAIRS": EXPECTED_TOTAL_PAIRS,
            }
        }

    def _judge_and_count(rows):
        judged, votes = [], 0
        for pos_prob, neg_prob, pos_txt, neg_txt in rows:
            rec = _judge_pair_by_thresholds(pos_prob, neg_prob)
            rec.update({"pos_text": pos_txt, "neg_text": neg_txt})
            judged.append(rec)
            if rec["passed"]:
                votes += 1
        return judged, votes

    ff_rows = _gather_rows(s2, stage2_prompts, stage2_map, "FF", len(ff_pairs))
    be_rows = _gather_rows(s2, stage2_prompts, stage2_map, "BE", len(be_pairs))

    ff_judged, ff_votes = _judge_and_count(ff_rows)
    be_judged, be_votes = _judge_and_count(be_rows)

        # === DEBUG PRINT for pairwise probs ===
    print("\n===== [PAIRWISE RESULTS] =====")
    for rec in ff_judged + be_judged:
        print(f"[{'FF' if rec in ff_judged else 'BE'}] "
              f"pos={rec['pos_prob']:.3f}, neg={rec['neg_prob']:.3f}, diff={rec['diff']:.3f}, "
              f"passed={rec['passed']}, "
              f"{rec['pos_text']}  |  {rec['neg_text']}")
    print("==============================\n")


    # Combined pool
    clothing_judged = ff_judged + be_judged
    clothing_votes = ff_votes + be_votes
    clothing_total = len(ff_pairs) + len(be_pairs)  # should be 13

    # Aggregate
    clothing_value, clothing_meta2 = _aggregate_value_from_passed(clothing_judged, agg=agg, weight_key=weight_key)
    ff_value, _ = _aggregate_value_from_passed(ff_judged, agg=agg, weight_key=weight_key)
    be_value, _ = _aggregate_value_from_passed(be_judged, agg=agg, weight_key=weight_key)

    if clothing_votes < TOTAL_VOTE_REQUIRE:
        return {
            "url": image_url,
            "final_prob": 0.0,
            "clothing_value": clothing_value,
            "clothing_meta": {**clothing_meta2, "votes": clothing_votes, "pairs": clothing_judged, "total_pairs": clothing_total},
            "ff_breakdown": {"pairs": ff_judged, "votes": ff_votes},
            "be_breakdown": {"pairs": be_judged, "votes": be_votes},
            "ff_value": ff_value,
            "be_value": be_value,
            "person_meta": {"pairs": person_judged, "score": person_score, "gate_threshold": GATE_THRESHOLD, **person_meta2},
            "female_meta": {"pairs": female_judged, "score": female_score, "gate_threshold": GATE_THRESHOLD, **female_meta2},
            "thresholds": {
                "GATE_THRESHOLD": GATE_THRESHOLD,
                "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
                "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
                "DIFF_MIN": DIFF_MIN,
                "TOTAL_VOTE_REQUIRE": TOTAL_VOTE_REQUIRE,
                "EXPECTED_TOTAL_PAIRS": EXPECTED_TOTAL_PAIRS,
            }
        }

    final_prob = float(clothing_value or 0.0)

    return {
        "url": image_url,
        "final_prob": final_prob,
        "clothing_value": clothing_value,
        "clothing_meta": {**clothing_meta2, "votes": clothing_votes, "pairs": clothing_judged, "total_pairs": clothing_total},
        "ff_breakdown": {"pairs": ff_judged, "votes": ff_votes},
        "be_breakdown": {"pairs": be_judged, "votes": be_votes},
        "ff_value": ff_value,
        "be_value": be_value,
        "person_meta": {"pairs": person_judged, "score": person_score, "gate_threshold": GATE_THRESHOLD, **person_meta2},
        "female_meta": {"pairs": female_judged, "score": female_score, "gate_threshold": GATE_THRESHOLD, **female_meta2},
        "thresholds": {
            "GATE_THRESHOLD": GATE_THRESHOLD,
            "MARGIN_THRESHOLD": MARGIN_THRESHOLD,
            "BORDERLINE_ABS_MARGIN": BORDERLINE_ABS_MARGIN,
            "DIFF_MIN": DIFF_MIN,
            "TOTAL_VOTE_REQUIRE": TOTAL_VOTE_REQUIRE,
            "EXPECTED_TOTAL_PAIRS": EXPECTED_TOTAL_PAIRS,
        }
    }
