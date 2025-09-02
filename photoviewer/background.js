chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendImageUrls') {
    console.log('Sending image URLs to backend:', message.urls);
    // Example: fetch('https://your-backend-api.com/analyze', {
    //   method: 'POST',
    //   body: JSON.stringify({ urls: message.urls }),
    //   headers: { 'Content-Type': 'application/json' }
    // });
  }
});