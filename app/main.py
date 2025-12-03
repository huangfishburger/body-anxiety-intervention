import logging
import torch 

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
    weight_key: str = "diff"       # weighted
    timeout: int = 8

# ---------- Endpoints ----------
app.include_router(home_router)

@app.post("/analyze")
def analyze(req: AnalyzeReq):
    """
    Pure CLIP probabilities: Run predict_probs_from_url on each image, returning the softmax probability for each prompt.
    Return format（single entry）：
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
    Apply the full rules from logic.py, outputting a single probability final_prob along with the detailed process.

    return format（single entry）：
      {
        "url": "...",
        "final_prob": 0.xx,
        "clothing_value": ...,
        "clothing_meta": {...}, 
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
    same as /evaluate, but additionally add:
      - window: latest final_prob
      - cumulative: only add probability > min_prob 
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
            # failed fallback
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
