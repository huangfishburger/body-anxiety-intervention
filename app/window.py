from collections import deque
import threading
from typing import List, Tuple, Optional

WINDOW_SIZE = 5
MIN_PROB = 0.5
THRESHOLD = 1.8

_lock = threading.Lock()
_window = deque(maxlen=WINDOW_SIZE)

def reset() -> None:
    """清空全域 window"""
    with _lock:
        _window.clear()

def snapshot() -> List[float]:
    """回傳目前 window"""
    with _lock:
        return list(_window)

def _safe_to_float(x) -> Optional[float]:
    try:
        v = float(x)
        if v == float("inf") or v == float("-inf"):
            return None
        return v
    except Exception:
        return None

def push_and_decide(prob) -> Tuple[List[float], float, bool]:
    """
    把單一機率推進全域 window，並回傳：
    - window: List[float] (最近 5 張的機率)
    - cumulative: float (只加 > 0.5 的總和)
    - intervention: bool (cumulative > 1.8)
    """
    with _lock:
        v = _safe_to_float(prob)
        if v is not None:
            _window.append(v)

        window_list = list(_window)
        cumulative = sum(x for x in window_list if x > MIN_PROB)
        intervention = cumulative > THRESHOLD
        return window_list, cumulative, intervention
