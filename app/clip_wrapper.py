import logging
import torch
import clip
from PIL import Image
import requests
from io import BytesIO
import time
import os
import io
import hashlib
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import List, Dict
from contextlib import nullcontext

logger = logging.getLogger(__name__)

# ----------------------- 下載＆快取工具 -----------------------

def _http_session():
    """回傳帶重試與 UA 的 requests Session。"""
    retry = Retry(
        total=3,                # 失敗重試 3 次
        backoff_factor=0.6,     # 0.6s, 1.2s, 1.8s
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"],
        raise_on_status=False,
    )
    s = requests.Session()
    s.headers.update({
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36"),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    })
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s

def _cache_path_for_url(url: str, cache_dir: str = ".cache/images") -> str:
    os.makedirs(cache_dir, exist_ok=True)
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()[:20]
    return os.path.join(cache_dir, f"{h}.img")

def _load_image_with_cache(url: str, timeout_read: int = 20,
                           cache_dir: str = ".cache/images") -> Image.Image:
    """
    先查本地快取；沒有就下載（帶重試/UA/Referer），並寫入快取。
    - connect-timeout 固定 5 秒；read-timeout 由 timeout_read 控制。
    - 支援本地檔路徑或 file://
    """
    # 本地檔支援
    if url.startswith("file://") or os.path.exists(url):
        path = url.replace("file://", "")
        return Image.open(path).convert("RGB")

    cache_path = _cache_path_for_url(url, cache_dir)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Image.open(io.BytesIO(f.read())).convert("RGB")

    # 避免有些站檢查 Referer
    try:
        host = url.split("/")[2]
        referer = f"https://{host}"
    except Exception:
        referer = ""

    sess = _http_session()
    try:
        resp = sess.get(
            url,
            timeout=(5, max(8, int(timeout_read))),  # (connect, read)
            stream=True,
            headers={"Referer": referer} if referer else None,
        )
        resp.raise_for_status()
        data = resp.content
    except Exception as e:
        raise

    # 寫入快取
    try:
        with open(cache_path, "wb") as f:
            f.write(data)
    except Exception:
        pass

    return Image.open(io.BytesIO(data)).convert("RGB")


# ----------------------- 加速輔助工具 -----------------------

_TOKEN_CACHE: Dict[str, torch.Tensor] = {}

def _tokenize_cached(prompts: List[str], device):
    """避免重複 tokenize 相同 prompt，加速但不改結果。"""
    cached, missed = [], []
    for p in prompts:
        t = _TOKEN_CACHE.get(p)
        if t is None:
            missed.append(p)
            cached.append(None)
        else:
            cached.append(t)
    if missed:
        toks = clip.tokenize(missed)
        idx = 0
        for i, t in enumerate(cached):
            if t is None:
                _TOKEN_CACHE[missed[idx]] = toks[idx]
                cached[i] = toks[idx]
                idx += 1
    tokens = torch.stack(cached, dim=0)
    return tokens.to(device)

def _to_device_image(tensor, device):
    """安全搬移：CUDA 才使用 pinned/non_blocking。"""
    if hasattr(device, "type") and device.type == "cuda":
        if tensor.device.type == "cpu":
            tensor = tensor.half().pin_memory()
        return tensor.to(device, non_blocking=True)
    return tensor.to(device)

def _amp_ctx_for(device):
    """自動啟用半精度加速（僅 CUDA）。"""
    if hasattr(device, "type") and device.type == "cuda":
        return torch.cuda.amp.autocast(dtype=torch.float16)
    return nullcontext()

# ----------------------- CLIP -----------------------

def load_clip_model(device=None):
    """
    載入 CLIP 模型
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load("ViT-B/32", device=device)
    if str(device).startswith("cuda") or (hasattr(device, "type") and device.type == "cuda"):
        model.half()
    model.eval()
    return model, preprocess, device

def predict_probs_from_url(
    image_url: str,
    model,
    preprocess,
    device,
    prompts: List[str],
    timeout: int = 8
) -> dict:
    """
    使用 CLIP 模型預測圖片內容
    """
    try:
        image = _load_image_with_cache(image_url, timeout_read=timeout, cache_dir=".cache/images")
    except Exception as e:
        msg = f"圖片載入失敗: {str(e)}"
        logger.error(msg)
        return {"url": image_url, "error": str(e)}

    # 前處理 & 推論
    image_input = _to_device_image(preprocess(image).unsqueeze(0), device)
    text_tokens = _tokenize_cached(prompts, device)

    amp_ctx = _amp_ctx_for(device)
    with torch.no_grad(), amp_ctx:
        start = time.time()
        logits_per_image, _ = model(image_input, text_tokens)
        probs = logits_per_image.softmax(dim=-1).cpu().numpy()[0].tolist()
        logger.info(f"圖片推論時間: {time.time() - start:.4f} 秒")

    return {
        "url": image_url,
        "scores": {p: float(s) for p, s in zip(prompts, probs)}
    }
