from app.clip_wrapper import load_clip_model, predict_probs_from_url
from resources import normal_images, beauty_images
from typing import List, Tuple
import pandas as pd


def batch_predict_and_format(
    normal_images: List[str],
    beauty_images: List[str],
    prompt_pairs: List[Tuple[str, str]],
    timeout: int = 8,
    group_labels: Tuple[str, str] = ("normal", "beauty"),
) -> pd.DataFrame:
    """
    建立格式化的 DataFrame，包含所有圖片的預測結果
    """

    # 準備欄位名稱
    columns = ["type", "link"]
    columns.extend([f"[{i}] {p}" for i, pair in enumerate(prompt_pairs, start=1) for p in pair])

    # 載入模型
    model, preprocess, device = load_clip_model()
    
    rows = []
    for group_name, urls in zip(group_labels, [normal_images, beauty_images]):
        for url in urls:
            row = {"type": group_name, "link": url}

            # 對每對 prompt 進行預測
            for i, (a, b) in enumerate(prompt_pairs, start=1):
                result = predict_probs_from_url(
                    url, model, preprocess, device, [a, b], timeout
                )
                
                if "error" in result:
                    row[f"[{i}] {a}"] = None
                    row[f"[{i}] {b}"] = None
                else:
                    scores = result["scores"]
                    row[f"[{i}] {a}"] = scores[a]
                    row[f"[{i}] {b}"] = scores[b]
            
            rows.append(row)
    
    df = pd.DataFrame(rows, columns=columns)
    return df