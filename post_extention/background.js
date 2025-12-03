const API_BASE = "https://karenhsieh-body-image.hf.space";

// Supabase setting
const SUPABASE_URL = 'https://fuaikgvegpycefcpncwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1YWlrZ3ZlZ3B5Y2VmY3BuY3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTQxMDcsImV4cCI6MjA3NTIzMDEwN30.-5c9K3Wf9zLZWD99M29tBcifSBlkrgxJmRymQhEdm_8';

function getAnonymousId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['instagram_extension_user_id'], (result) => {
      if (result.instagram_extension_user_id) {
        resolve(result.instagram_extension_user_id);
      } else {
        const newId = crypto.randomUUID();
        chrome.storage.local.set({ instagram_extension_user_id: newId }, () => {
          resolve(newId);
        });
      }
    });
  });
}

// save interaction to Supabase
async function saveInteractionToSupabase(interactionData) {
  try {
    // user existed
    const userResponse = await fetch(`${SUPABASE_URL}/rest/v1/users?anonymous_id=eq.${interactionData.anonymousId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    const users = await userResponse.json();
    let userId;
    
    if (users.length === 0) {
      // create new user
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
    
    // save
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

// send image to calculate probability
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendImageUrls') {
    console.log('Sending image URLs to backend:', message.urls);
    const urls = Array.from(new Set(message.urls || [])).slice(0, 20);
    if (urls.length === 0) {
      sendResponse([]);
      return;
    }
    
    // get anonymous ID and send request
    getAnonymousId().then(anonymousId => {
      fetch(`${API_BASE}/evaluate_with_window`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          urls: urls,
          user_id: anonymousId  
        })
      })
      .then(res => res.json())
      .then(data => {
        console.log('Analyze result:', data);

        // intervention 
        const hasIntervention = data.some(result => result.intervention === true);
        
        if (hasIntervention) {
          console.log('Intervention detected.');

          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'insertFakePost',
            data: data
          });
        }
        else {
          console.log('The probability threshold was not met, so no fake posts were inserted.');
        }
      })
      .catch(err => {
        console.error('Analyze error:', err);
        sendResponse({ error: err.message })
      });
    return true;
    });
  }
  // save
  if (message.action === 'logPostInteraction') {
    console.log('Received interaction log:', message.data);
    saveInteractionToSupabase(message.data);
  }
});
