import logging
import torch
import clip
from PIL import Image
import requests
from io import BytesIO
import time

logger = logging.getLogger(__name__)


def load_clip_model(device=None):
    """
    載入 CLIP 模型
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load("ViT-B/32", device=device)
    return model, preprocess, device


def predict_probs_from_url(
    image_url: str,
    model,
    preprocess,
    device,
    prompts: list,
    timeout: int = 5
) -> dict:
    """
    使用 CLIP 模型預測圖片內容

    Args:
        image_url: 圖片URL
        model: CLIP 模型
        preprocess: 預處理函數
        device: 運算設備
        prompts: 提示詞列表
        timeout: 請求超時時間(秒)

    Returns:
        dict: 包含預測結果的字典
    """
    try:
        r = requests.get(image_url, timeout=timeout)
        r.raise_for_status()
        image = Image.open(BytesIO(r.content)).convert("RGB")
    except Exception as e:
        logger.error(f"圖片載入失敗: {str(e)}")
        return {"url": image_url, "error": str(e)}

    image_input = preprocess(image).unsqueeze(0).to(device)
    text_tokens = clip.tokenize(prompts).to(device)

    with torch.no_grad():
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        start = time.time()

        logits_per_image, _ = model(image_input, text_tokens)
        probs = logits_per_image.softmax(dim=-1).cpu().numpy()[0].tolist()

        if torch.cuda.is_available():
            torch.cuda.synchronize()

        end = time.time()
        logger.info(f"圖片推論時間: {end - start:.4f} 秒")

    results = {
        "url": image_url,
        "scores": {p: float(s) for p, s in zip(prompts, probs)}
    }

    return results