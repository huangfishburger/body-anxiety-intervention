const API_BASE = "http://localhost:8000";

// Supabase 設定
const SUPABASE_URL = 'https://fuaikgvegpycefcpncwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1YWlrZ3ZlZ3B5Y2VmY3BuY3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTQxMDcsImV4cCI6MjA3NTIzMDEwN30.-5c9K3Wf9zLZWD99M29tBcifSBlkrgxJmRymQhEdm_8';

// 儲存互動到 Supabase
async function saveInteractionToSupabase(interactionData) {
  try {
    // 先確保 user 存在
    const userResponse = await fetch(`${SUPABASE_URL}/rest/v1/users?anonymous_id=eq.${interactionData.anonymousId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    const users = await userResponse.json();
    let userId;
    
    if (users.length === 0) {
      // 建立新 user
      const createUserResponse = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          anonymous_id: interactionData.anonymousId
        })
      });
      
      const newUser = await createUserResponse.json();
      userId = newUser[0].id;
      console.log('Created new user:', userId);
    } else {
      userId = users[0].id;
      console.log('Using existing user:', userId);
    }
    
    // 儲存互動記錄
    const interactionResponse = await fetch(`${SUPABASE_URL}/rest/v1/post_interactions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        action: interactionData.actionType,
        post_url: interactionData.post_url,
        post_caption: interactionData.post_caption,
        created_at: interactionData.timestamp,
      })
    });
    
    if (interactionResponse.ok) {
      console.log('Interaction saved to Supabase');
    } else {
      console.error('Failed to save interaction:', await interactionResponse.text());
    }
    
  } catch (error) {
    console.error('Error saving to Supabase:', error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // send image 計算機率
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

  // 儲存資料
  if (message.action === 'logPostInteraction') {
    console.log('Received interaction log:', message.data);
    saveInteractionToSupabase(message.data);
  }
});
