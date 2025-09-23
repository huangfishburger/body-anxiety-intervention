import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from app.clip_wrapper import load_clip_model, predict_probs_from_url

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
DEFAULT_PROMPTS = ["a normal woman", "a woman showing her perfect body"]

class AnalyzeReq(BaseModel):
    urls: List[str]
    prompts: Optional[List[str]] = None

@app.post("/analyze")
def analyze(req: AnalyzeReq):
    prompts = req.prompts or DEFAULT_PROMPTS
    results = [
        predict_probs_from_url(u, model, preprocess, device, prompts)
        for u in req.urls
    ]
    return {"prompts": prompts, "results": results}
