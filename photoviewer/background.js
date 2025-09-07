const API_BASE = "http://localhost:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendImageUrls') {
    console.log('Sending image URLs to backend:', message.urls);
    const urls = Array.from(new Set(message.urls || [])).slice(0, 20); // 先設一次最多 20 張
    if (urls.length === 0) return;

    fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    })
    .then(res => res.json())
    .then(data => {
      console.log('Analyze result:', data);
    })
    .catch(err => {
      console.error('Analyze error:', err);
    });
  }
});