import logging
import torch  # ✅ 新增

# ⚡ 初始化階段優化設定（不影響 CLIP 輸出結果）
torch.backends.cudnn.benchmark = True
torch.set_float32_matmul_precision("high")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from app.clip_wrapper import load_clip_model, predict_probs_from_url
from app.logic import evaluate_image
from app.window import push_and_decide, snapshot, MIN_PROB, THRESHOLD
from app.home import router as home_router

# logger = logging.getLogger("uvicorn.error")
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(asctime)s %(message)s",
    force=True
)
logger = logging.getLogger(__name__)


app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

# 啟動時載入模型
model, preprocess, device = load_clip_model()

# ---------- Schemas ----------
class AnalyzeReq(BaseModel):
    urls: List[str]
    prompts: Optional[List[str]] = None
    timeout: int = 8


class EvalReq(BaseModel):
    user_id: str = "default_user"
    urls: List[str]
    agg: str = "weighted_pos"      # max_pos | max_gap | weighted_pos | weighted_gap
    weight_key: str = "diff"       # 加權模式下的權重欄位
    timeout: int = 8

# ---------- Endpoints ----------
app.include_router(home_router)

@app.post("/analyze")
def analyze(req: AnalyzeReq):
    """
    純 CLIP 機率：對每張圖跑一次 predict_probs_from_url，回傳每個 prompt 的 softmax 機率。
    回傳格式（單筆）：
      { "url": "...", "scores": { "<prompt>": 0.12, ... } }
    """
    results = []
    for u in req.urls:
        try:
            DEFAULT_PROMPTS = ["a normal woman", "a woman showing her perfect body"]
            prompts = req.prompts or DEFAULT_PROMPTS
            res = predict_probs_from_url(
                u, model, preprocess, device,
                prompts, timeout=req.timeout
            )
            res_out = {"url": u}
            res_out.update(res)
            results.append(res_out)
        except Exception as e:
            results.append({"url": u, "error": str(e)})
    return results


@app.post("/evaluate")
def evaluate(req: EvalReq):
    """
    走 logic.py 的完整規則，輸出單一機率 final_prob 與詳細過程。

    回傳格式（單筆）：
      {
        "url": "...",
        "final_prob": 0.xx,
        "clothing_value": ...,
        "clothing_meta": {...},    # 票數與 pairs 細節
        "ff_value": ...,
        "be_value": ...,
        "ff_breakdown": {...},
        "be_breakdown": {...},
        "person_meta": {...},
        "female_meta": {...},
        "thresholds": {...}
      }
    """
    out = []
    for u in req.urls:
        try:
            r = evaluate_image(
                u, model, preprocess, device,
                timeout=req.timeout,
                agg=req.agg,
                weight_key=req.weight_key
            )
            out.append(r)
        except Exception as e:
            out.append({"url": u, "error": str(e)})
    return out


@app.post("/evaluate_with_window")
def evaluate_with_window(req: EvalReq):
    """
    和 /evaluate 相同，但額外多回傳：
      - window: 最近 5 個 final_prob
      - cumulative: 只加 > min_prob 的總和
      - intervention: cumulative > threshold
    """
    out = []
    for u in req.urls:
        try:
            r = evaluate_image(
                u, model, preprocess, device,
                timeout=req.timeout,
                agg=req.agg,
                weight_key=req.weight_key
            )
            fp = r.get("final_prob", None)

            if fp is None:
                raise ValueError("final_prob missing")

            window_list, cumulative, intervention = push_and_decide(req.user_id, fp)

            r["window"] = window_list
            r["cumulative"] = cumulative
            r["intervention"] = intervention
            out.append(r)

        except Exception as e:
            # 失敗 fallback
            window_list = snapshot()
            cumulative = sum(x for x in window_list if x > MIN_PROB)
            intervention = cumulative > THRESHOLD
            out.append({
                "url": u,
                "error": str(e),
                "window": window_list,
                "cumulative": cumulative,
                "intervention": intervention
            })
    return out
