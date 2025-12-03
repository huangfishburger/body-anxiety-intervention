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

# ----------------------- download -----------------------

def _http_session():
    """Returns a requests.Session with retry logic and User-Agent."""
    retry = Retry(
        total=3,              
        backoff_factor=0.6,    
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
    Check the local cache first; if missing, download (with retries, User-Agent, and Referer) and write to cache.
    - Connect timeout fixed at 5 seconds; read timeout controlled by timeout_read.
    - Supports local file paths or file://.
    """
    if url.startswith("file://") or os.path.exists(url):
        path = url.replace("file://", "")
        return Image.open(path).convert("RGB")

    cache_path = _cache_path_for_url(url, cache_dir)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Image.open(io.BytesIO(f.read())).convert("RGB")

    # avoid Referer
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

    # cache
    try:
        with open(cache_path, "wb") as f:
            f.write(data)
    except Exception:
        pass

    return Image.open(io.BytesIO(data)).convert("RGB")


# ----------------------- accumulation tool -----------------------

_TOKEN_CACHE: Dict[str, torch.Tensor] = {}

def _tokenize_cached(prompts: List[str], device):
    """Avoid redundant tokenization of the same prompt to speed up processing without changing results."""
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
    """Safe transfer: use pinned/non_blocking only with CUDA."""
    if hasattr(device, "type") and device.type == "cuda":
        if tensor.device.type == "cpu":
            tensor = tensor.half().pin_memory()
        return tensor.to(device, non_blocking=True)
    return tensor.to(device)

def _amp_ctx_for(device):
    """Automatically enable half-precision acceleration (CUDA only)."""
    if hasattr(device, "type") and device.type == "cuda":
        return torch.cuda.amp.autocast(dtype=torch.float16)
    return nullcontext()

# ----------------------- CLIP -----------------------

def load_clip_model(device=None):
    """
    load CLIP model
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
    Use CLIP model to predict content of photo
    """
    try:
        image = _load_image_with_cache(image_url, timeout_read=timeout, cache_dir=".cache/images")
    except Exception as e:
        msg = f"Failed to load photos: {str(e)}"
        logger.error(msg)
        return {"url": image_url, "error": str(e)}

    # preprocessing & inference
    image_input = _to_device_image(preprocess(image).unsqueeze(0), device)
    text_tokens = _tokenize_cached(prompts, device)

    amp_ctx = _amp_ctx_for(device)
    with torch.no_grad(), amp_ctx:
        start = time.time()
        logits_per_image, _ = model(image_input, text_tokens)
        probs = logits_per_image.softmax(dim=-1).cpu().numpy()[0].tolist()
        logger.info(f"Image inference time: {time.time() - start:.4f} 秒")

    return {
        "url": image_url,
        "scores": {p: float(s) for p, s in zip(prompts, probs)}
    }
