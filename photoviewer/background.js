// background.js
const API_BASE = "http://localhost:8000";

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "sendImageUrls") return;
  const tabId = sender?.tab?.id;
  if (!Array.isArray(msg.urls) || msg.urls.length === 0 || !tabId) return;

  // 去重 + 限流（最多 20 張）
  const urls = Array.from(new Set(msg.urls)).slice(0, 20);
  console.log("Sending to /evaluate:", urls);

  fetch(`${API_BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls,
      agg: "max_pos",
      weight_key: "diff",
      combine: "max",
      timeout: 8
    })
  })
    .then((r) => r.json())
    .then((data) => {
      console.log("[/evaluate] result:", data);
      // 把結果傳回 content.js 顯示
      chrome.tabs.sendMessage(tabId, {
        action: "evaluateResult",
        results: data // [{ url, final_prob, ... }]
      });
    })
    .catch((err) => {
      console.error("Evaluate error:", err);
      // 回報錯誤給 content.js（可選）
      chrome.tabs.sendMessage(tabId, {
        action: "evaluateResult",
        results: [],
        error: String(err)
      });
    });
});
