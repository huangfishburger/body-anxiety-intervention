const API_BASE = "http://localhost:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendImageUrls') {
    console.log('Sending image URLs to backend:', message.urls);
    const urls = Array.from(new Set(message.urls || [])).slice(0, 20);
    if (urls.length === 0) {
      sendResponse([]);
      return;
    }

    fetch(`${API_BASE}/evaluate_with_window`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    })
    .then(res => res.json())
    .then(data => {
      console.log('Analyze result:', data);
      sendResponse(data);
    })
    .catch(err => {
      console.error('Analyze error:', err);
      sendResponse({ error: err.message })
    });
    return true;
  }
});
