from collections import defaultdict, deque
import threading
from typing import List, Tuple, Optional

WINDOW_SIZE = 5
MIN_PROB = 0.5
THRESHOLD = 1.8

_locks = defaultdict(lambda: threading.Lock())
_windows = defaultdict(lambda: deque(maxlen=WINDOW_SIZE))

def reset(user_id: str) -> None:
    """
    clear user's window。
    """
    if user_id in _locks:
        with _locks[user_id]:
            _windows.pop(user_id, None)

def snapshot(user_id: str) -> List[float]:
    """
    return window
    """
    with _locks[user_id]:
        return list(_windows.get(user_id, []))

def _safe_to_float(x) -> Optional[float]:
    try:
        v = float(x)
        if v == float("inf") or v == float("-inf"):
            return None
        return v
    except Exception:
        return None

def push_and_decide(user_id: str, prob: float) -> Tuple[List[float], float, bool]:
    """
    append probability to user window and return:
    - window: List[float] (latest 5 posts)
    - cumulative: float (only add probability > 0.5)
    - intervention: bool (cumulative > 1.8)
    """
    with _locks[user_id]:
        w = _windows[user_id]
        prob = _safe_to_float(prob)
        if prob is not None:
            w.append(float(prob))

        window_list = list(w)
        cumulative = sum(x for x in window_list if x > MIN_PROB)
        intervention = cumulative > THRESHOLD
        return window_list, cumulative, intervention
