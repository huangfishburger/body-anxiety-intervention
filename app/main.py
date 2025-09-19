# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from .clip_wrapper import load_clip_model, predict_probs_from_url
from .logic import evaluate_image

app = FastAPI(title="Body-Image CLIP Service")

# 允許前端（例如你的 Chrome 擴充）從本機呼叫
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 若要更安全可改成 ["http://localhost:xxxx"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 啟動時載入一次模型
model, preprocess, device = load_clip_model()


# ---------- Schemas ----------
class AnalyzeReq(BaseModel):
    urls: List[str]
    prompts: Optional[List[str]] = None     # 不給就用 clip_wrapper 的內建/或你自己在呼叫時傳
    timeout: int = 8


class EvalReq(BaseModel):
    urls: List[str]
    agg: str = "max_pos"                    # max_pos | max_gap | weighted_pos | weighted_gap
    weight_key: str = "diff"                # 加權模式下的權重欄位
    combine: str = "max"                    # FF 與 BE 合併：'max' 或 'mean'
    timeout: int = 8


# ---------- Health ----------
@app.get("/health")
def health():
    return {"ok": True}


# ---------- Endpoints ----------
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
            res = predict_probs_from_url(
                u, model, preprocess, device,
                req.prompts, timeout=req.timeout
            )
            # 預期 res = {"scores": {...}}，若下載或推論失敗會帶 "error"
            res_out = {"url": u}
            res_out.update(res)
            results.append(res_out)
        except Exception as e:
            results.append({"url": u, "error": str(e)})
    return results


@app.post("/evaluate")
def evaluate(req: EvalReq):
    """
    走 logic.py 的完整規則，輸出單一機率 final_prob 與詳細過程（FF/BE 兩面向）。
    回傳格式（單筆）：
      {
        "url": "...",
        "final_prob": 0.xx,
        "form_fitting": {...},
        "body_exposure": {...},
        "ff_value": ...,
        "be_value": ...,
        "agg": "...",
        "combine": "...",
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
                weight_key=req.weight_key,
                combine=req.combine
            )
            out.append(r)
        except Exception as e:
            out.append({"url": u, "error": str(e)})
    return out
