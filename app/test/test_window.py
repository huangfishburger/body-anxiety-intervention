import pytest
from app import window

def setup_function():
    """每個測試前都清空 window"""
    window.reset()

def test_push_and_decide_basic():
    # push 0.6
    window_list, cumulative, intervention = window.push_and_decide(0.6)
    assert window_list == [0.6]
    assert cumulative == pytest.approx(0.6)
    assert intervention is False

    # push 0.7
    window_list, cumulative, intervention = window.push_and_decide(0.7)
    assert window_list == [0.6, 0.7]
    assert cumulative == pytest.approx(1.3)
    assert intervention is False

    # push 0.8, cumulative > 1.8
    window_list, cumulative, intervention = window.push_and_decide(0.8)
    assert window_list == [0.6, 0.7, 0.8]
    assert cumulative == pytest.approx(2.1)
    assert intervention is True

def test_ignore_below_min_prob():
    # push 0.4 (below 0.5)
    window_list, cumulative, intervention = window.push_and_decide(0.4)
    assert cumulative == pytest.approx(0)  # 不會加到累積
    assert intervention is False
    assert len(window_list) == 1

def test_window_size_limit():
    for i in range(6):
        window.push_and_decide(0.6)

    window_list = window.snapshot()
    assert len(window_list) == 5

def test_intervention_progress():
    probs = [0.4, 0.7, 0.6, 0.3, 0.8, 0.2, 0.4]
    expected_interventions = [False, False, False, False, True, True, False]

    for i, p in enumerate(probs):
        window_list, cumulative, intervention = window.push_and_decide(p)
        assert intervention == expected_interventions[i], f"step {i}, cum={cumulative}, window={window_list}"
    
    last_window = window.snapshot()
    assert len(last_window) == 5
