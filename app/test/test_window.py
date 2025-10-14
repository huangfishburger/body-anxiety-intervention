import pytest
from concurrent.futures import ThreadPoolExecutor, as_completed
from app import window

def setup_function():
    """每個測試前都清空測試用戶的 window"""
    test_users = [f"u{i}" for i in range(5)]
    for uid in test_users:
        if uid in window._locks:
            window.reset(uid)

def test_push_and_decide_basic():
    user = "u1"
    # push 0.6
    window_list, cumulative, intervention = window.push_and_decide(user, 0.6)
    assert window_list == [0.6]
    assert cumulative == pytest.approx(0.6)
    assert intervention is False

    # push 0.7
    window_list, cumulative, intervention = window.push_and_decide(user, 0.7)
    assert window_list == [0.6, 0.7]
    assert cumulative == pytest.approx(1.3)
    assert intervention is False

    # push 0.8, cumulative > 1.8
    window_list, cumulative, intervention = window.push_and_decide(user, 0.8)
    assert window_list == [0.6, 0.7, 0.8]
    assert cumulative == pytest.approx(2.1)
    assert intervention is True

def test_ignore_below_min_prob():
    user = "u1"
    # push 0.4 (below 0.5)
    window_list, cumulative, intervention = window.push_and_decide(user, 0.4)
    assert cumulative == pytest.approx(0)  # 不會加到累積
    assert intervention is False
    assert len(window_list) == 1

def test_window_size_limit():
    user = "u1"
    for i in range(6):
        window.push_and_decide(user, 0.6)

    window_list = window.snapshot(user)
    assert len(window_list) == 5

def test_intervention_progress():
    user = "u1"
    probs = [0.4, 0.7, 0.6, 0.3, 0.8, 0.2, 0.4]
    expected_interventions = [False, False, False, False, True, True, False]

    for i, p in enumerate(probs):
        window_list, cumulative, intervention = window.push_and_decide(user, p)
        assert intervention == expected_interventions[i], f"step {i}, cum={cumulative}, window={window_list}"
    
    last_window = window.snapshot(user)
    assert len(last_window) == 5

def test_multiple_users():
    user_1 = "u1"
    user_2 = "u2"

    window.push_and_decide(user_1, 0.6)
    window.push_and_decide(user_1, 0.7)
    window.push_and_decide(user_1, 0.8)

    window.push_and_decide(user_2, 0.9)

    a_window = window.snapshot(user_1)
    b_window = window.snapshot(user_2)

    assert a_window == [0.6, 0.7, 0.8]
    assert b_window == [0.9]

def test_threaded_multi_user():
    """
    確認多使用者在多執行緒下能同時寫入且資料獨立。
    """
    num_users = 5
    num_pushes = 10
    users = [f"u{i}" for i in range(num_users)]

    def worker(uid):
        for j in range(num_pushes):
            window_list, cumulative, intervention = window.push_and_decide(uid, round(0.5 + j * 0.01, 2))
            print(f"[{uid}] push {round(0.5 + j * 0.01, 2)} -> window={window_list}, cum={cumulative:.2f}, int={intervention}")
        return uid

    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [executor.submit(worker, uid) for uid in users]
        for f in as_completed(futures):
            f.result()

    for uid in users:
        w = window.snapshot(uid)
        assert len(w) == 5, f"{uid} window length error: {w}"
        assert all(isinstance(x, float) for x in w)
        assert w[-1] > w[0], f"{uid} window not increasing: {w}"
