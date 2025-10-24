/*
----------------------
SUPABASE 追蹤設定
----------------------
*/


let anonymousUserId = null;

function getOrCreateAnonymousId() {
  let anonymousId = localStorage.getItem('instagram_extension_user_id');
  
  if (!anonymousId) {
    anonymousId = crypto.randomUUID();
    localStorage.setItem('instagram_extension_user_id', anonymousId);
    console.log('Created new anonymous ID:', anonymousId);
  }
  
  return anonymousId;
}

// 紀錄互動
function logInteraction(action, url, caption) {
  if (!anonymousUserId) {
    console.warn('Cannot log interaction: missing user ID');
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'logPostInteraction',
    data: {
      anonymousId: anonymousUserId,
      actionType: action,
      post_url: url,
      post_caption: caption,
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`Logged: ${action} - ${url}`);
}

// 初始化 anonymous ID
anonymousUserId = getOrCreateAnonymousId();
console.log('Using anonymous ID:', anonymousUserId);


/*
----------------------
instagram crawler
----------------------
*/

let imageUrls = new Set();
let debounceTimeout = null;
let lastProcessedUrls = new Set();
let observer = null;

// Debounce function to limit update frequency
function debounce(func, wait) {
  return function(...args) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create floating window with status
const floatingWindow = document.createElement('div');
floatingWindow.id = 'image-url-window';
floatingWindow.innerHTML = `
  <div id="window-header">
    <span>Visible Post URLs (<span id="url-count">0</span>)</span>
    <button id="toggle-window">Hide</button>
  </div>
  <div id="url-list">Loading...</div>
`;
floatingWindow.style.display = 'none';
document.body.appendChild(floatingWindow);

// Make window draggable
let isDragging = false;
let currentX = 10,
  currentY = 10,
  initialX, initialY;

const header = document.getElementById('window-header');
header.addEventListener('mousedown', (e) => {
  initialX = e.clientX - currentX;
  initialY = e.clientY - currentY;
  isDragging = true;
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - currentY;
    floatingWindow.style.left = `${currentX}px`;
    floatingWindow.style.top = `${currentY}px`;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// Toggle window visibility
const toggleButton = document.getElementById('toggle-window');
toggleButton.addEventListener('click', () => {
  const urlList = document.getElementById('url-list');
  const isHidden = urlList.style.display === 'none';
  urlList.style.display = isHidden ? 'block' : 'none';
  toggleButton.textContent = isHidden ? 'Hide' : 'Show';
  chrome.storage.local.set({
    windowVisible: !isHidden
  });
});

// Initialize window state and position
chrome.storage.local.get(['windowVisible', 'windowPosition'], (result) => {
  const urlList = document.getElementById('url-list');
  const isHidden = result.windowVisible === false;
  urlList.style.display = isHidden ? 'none' : 'block';
  toggleButton.textContent = isHidden ? 'Show' : 'Hide';
  if (result.windowPosition) {
    floatingWindow.style.left = `${result.windowPosition.left}px`;
    floatingWindow.style.top = `${result.windowPosition.top}px`;
    currentX = result.windowPosition.left;
    currentY = result.windowPosition.top;
  } else {
    floatingWindow.style.left = '10px';
    floatingWindow.style.top = '10px';
  }
});

// Save window position on mouseup
document.addEventListener('mouseup', () => {
  isDragging = false;
  const position = floatingWindow.getBoundingClientRect();
  chrome.storage.local.set({
    windowPosition: {
      left: position.left,
      top: position.top
    }
  });
});

// Update floating window with URLs
const updateFloatingWindow = debounce((urls) => {
  const urlList = document.getElementById('url-list');
  const urlCount = document.getElementById('url-count');
  urlCount.textContent = urls.length;
  if (urls.length === 0) {
    urlList.innerHTML = '<div>No visible post URLs found</div>';
  } else {
    urlList.innerHTML = urls.map(url => `<div><a href="${url}" target="_blank">${url}</a></div>`).join('');
  }
  
  // Send the URLs to the background script
  chrome.runtime.sendMessage({ action: 'sendImageUrls', urls: [...urls] });
}, 100);

// Check if an element is visible on the page (not just in DOM)
function isVisible(element) {
  return element.offsetParent !== null && window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).opacity !== '0';
}

// Check if an image is likely a profile picture or a small icon
function isProfilePic(image) {
  const url = image.src;
  if (url.includes('/s150x150/') || url.includes('/_n/') || url.includes('profile_pic_') || url.includes('/v/t51.2885-19/')) {
    return true;
  }
  if (image.width <= 150 || image.height <= 150) {
    return true;
  }
  const parentLink = image.closest('a[role="link"]');
  if (parentLink && parentLink.querySelector('img[alt]')) {
    const altText = parentLink.querySelector('img[alt]').alt;
    if (altText.includes(' profile picture') || altText.includes('profile_picture')) {
      return true;
    }
  }
  return false;
}

// Check if a post article is at least 50% in the vertical viewport (for Home feed)
function isPostSignificantlyVisible(article) {
  const rect = article.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
  const articleHeight = rect.bottom - rect.top;
  const visibleRatio = articleHeight > 0 ? visibleHeight / articleHeight : 0;
  return visibleRatio >= 0.5;
}

// Check if an element is at least 40% in the vertical viewport (for Explore grid)
function isExploreImageSignificantlyVisible(element) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
  const elementHeight = rect.bottom - rect.top;
  const visibleRatio = elementHeight > 0 ? visibleHeight / elementHeight : 0;
  return visibleRatio >= 0.4;
}

// Attach listeners to carousel navigation buttons
function attachCarouselListeners(article) {
  if (article.dataset.listenersAttached) {
    return; // Already attached
  }

  const carouselButtons = article.querySelectorAll('[role="button"][tabindex="0"]');
  if (carouselButtons.length > 0) {
    carouselButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Add a small, fixed delay to allow DOM to update before running the extraction
        setTimeout(() => {
          requestAnimationFrame(extractUrls);
        }, 150);
      });
    });
    article.dataset.listenersAttached = 'true';
  }
}


// Main function to extract visible post URLs
function extractUrls() {
  const newUrls = new Set();

  // Handle pop-up modals first (for Explore)
  const modal = document.querySelector('div[role="dialog"]');
  if (modal && isVisible(modal)) {
    const mainMedia = modal.querySelector('img[src*="cdninstagram.com"], video');
    if (mainMedia) {
      const src = mainMedia.tagName === 'IMG' ? mainMedia.src : mainMedia.poster;
      if (src && !isProfilePic(mainMedia)) {
        newUrls.add(src);
      }
    }
  } else {
    // Handle standard page views (Home, Explore)
    document.querySelectorAll('article, [role="feed"] > div, [role="feed"] > ._aayx, main div[class*="x78536"], main section[class*="x78536"]').forEach(article => {
      // First, check if the entire article is vertically in the viewport
      if (!isPostSignificantlyVisible(article)) {
          return;
      }

      // Attach carousel listeners to ensure updates on click
      attachCarouselListeners(article);

      const mediaElements = article.querySelectorAll('img[src*="cdninstagram.com"], video');

      if (mediaElements.length > 1) {
        // Handle carousel images and videos
        const viewportCenter = window.innerWidth / 2;
        let mostCenteredMedia = null;
        let smallestDistance = Infinity;

        mediaElements.forEach(media => {
          const rect = media.getBoundingClientRect();
          const mediaCenter = rect.left + rect.width / 2;
          const distanceToCenter = Math.abs(mediaCenter - viewportCenter);

          // Find the media closest to the center of the viewport
          if (isVisible(media) && distanceToCenter < smallestDistance) {
            smallestDistance = distanceToCenter;
            mostCenteredMedia = media;
          }
        });

        if (mostCenteredMedia) {
          let src;
          if (mostCenteredMedia.tagName === 'IMG') {
              src = mostCenteredMedia.src;
          } else if (mostCenteredMedia.tagName === 'VIDEO') {
              const videoPoster = article.querySelector('img[src*="/v/t51.71878-15/"]');
              src = mostCenteredMedia.poster || (videoPoster ? videoPoster.src : undefined);
          }
          if (src && !isProfilePic(mostCenteredMedia)) {
            newUrls.add(src);
          }
        }
      } else if (mediaElements.length === 1) {
        // Handle single image/video post
        const media = mediaElements[0];
        let src;

        if (media.tagName === 'IMG') {
            src = media.src;
        } else if (media.tagName === 'VIDEO') {
            const videoPoster = article.querySelector('img[src*="/v/t51.71878-15/"]');
            src = media.poster || (videoPoster ? videoPoster.src : undefined);
        }

        if (!src) return;

        const isElementVisible = isVisible(media);
        const isElementProfilePic = isProfilePic(media);

        if (isElementVisible && !isElementProfilePic) {
          if (!media.closest('article')?.querySelector('a[href*="sponsored"]')) {
            newUrls.add(src);
          }
        }
      }
    });

    // Also handle Explore grid images (not in articles)
    document.querySelectorAll('main img[src*="cdninstagram.com"]').forEach(image => {
      if (isVisible(image) && !image.closest('article') && !isProfilePic(image)) {
        if (isExploreImageSignificantlyVisible(image)) {
            newUrls.add(image.src);
        }
      }
    });
  }

  const urlsArray = [...newUrls];
  if (urlsArray.join() !== [...imageUrls].join()) {
    imageUrls = newUrls;
    updateFloatingWindow(urlsArray);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'insertFakePost') {
    insertFakePost();
  }
});

let isInsertingFakePost = false;
// Observe changes in post container and scroll events
function observeContent() {
  const target = document.querySelector('main[role="main"]') || document.body;
  console.log('Observing target:', target.tagName, target.className);

  if (observer) {
      observer.disconnect();
  }
  

  observer = new MutationObserver(debounce(() => {
    if (isInsertingFakePost) {
      console.log('正在插入假貼文，忽略 MutationObserver');
      return;
    }
    console.log('MutationObserver triggered');
    extractUrls();
  }, 50));

  observer.observe(target, {
    childList: true,
    subtree: true
  });

  // Update on scroll
  window.addEventListener('scroll', debounce(() => {
    requestAnimationFrame(extractUrls);
  }, 50));

  // Initial extraction
  extractUrls();
}

// Wait for Instagram to load
function init() {
  const checkMain = setInterval(() => {
    if (document.querySelector('main[role="main"]')) {
      clearInterval(checkMain);
      observeContent();
    }
  }, 500);
}

try {
  init();
} catch (error) {
  console.error('Plugin error:', error);
  const urlList = document.getElementById('url-list');
  if (urlList) {
    urlList.innerHTML = '<div>Error: Failed to load URLs. Check console for details.</div>';
  }
}

/*
----------------------
 intervention fake posts
 ----------------------
*/


const fakePosts = [
  {
    username: "dog_on_a_trip",
    caption: "開車兜風 ❤️🚗✨",
    image: chrome.runtime.getURL("images/icon1.png"),
    comments: 50
  },
  {
    username: "chill_cat",
    caption: "午睡時光 💤☀️",
    image: chrome.runtime.getURL("images/icon2.png"),
    comments: 1
  },
  {
    username: "abcd_eat",
    caption: `什麼！星期一了😱
              嘿嘿好險我只是可愛狗勾不用上班的
              就讓再我多睡一點吧😴😴😴`,
    image: chrome.runtime.getURL("images/icon3.png"),
    comments: 23
  },
];

function createFakePost({ username, caption, image, comments }) {
  const post = document.createElement('article');
  post.classList.add('fake-inserted');
  post.dataset.caption = caption;
  post.style = `
    max-width: 470px;
    width: 100%;
    margin: 0 auto 24px;
    background-color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
    min-height: 300px;
    post.style.position = 'static';
    post.style.display = 'block';
    post.style.alignSelf = 'auto';
    post.style.margin = '0 auto';
    post.style.width = '100%';
    post.style.maxWidth = '470px'; // Instagram feed 寬度
    post.style.zIndex = '1';
    post.style.transform = 'none';
  `;

  post.innerHTML = `
    <header style="display: flex; align-items: center; padding: 14px;">
      <img src="${image}" style="width: 40px; height: 40px; border-radius: 50%; padding-right: 6px;">
      <div style="display: flex; justify-content: space-between; width: 100%;">
        <strong>${username}</strong>
        <svg aria-label="更多選項" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
          <circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle>
        </svg>
      </div>
    </header>
    <img src="${image}" style="width: 100%; display: block;">
    <div style="display: flex; justify-content: space-between; padding: 0 10px;">
      <div style="display: flex; gap: 12px; align-items: center;">
        <svg aria-label="讚" class="like-btn" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
          <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"></path>
        </svg>
        <svg aria-label="留言" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
            <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path>
        </svg>
        <p><strong>${comments}</strong></p>
        <svg aria-label="分享" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
          <line fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2" x1="22" x2="9.218" y1="3" y2="10.083"></line>
          <polygon fill="none" points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></polygon>
        </svg>
      </div>
      <div style="display: flex; align-items: center;">
        <svg aria-label="儲存" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
          <polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polygon>
        </svg>
      </div>
    </div>
    <div style="padding: 0 10px;">
      <p style="margin: 2px 0 6px;"><strong>${username}</strong> ${caption}</p>
    </div>
  `;

  return post;
}

function setupLikeButton(post) {
    const likeBtn = post.querySelector('.like-btn');
    let liked = false;

    const svgBefore = `
      <svg aria-label="讚" class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"></path>
      </svg>
    `;

    const svgAfter = `
      <svg aria-label="收回讚" class="x1lliihq x1n2onr6 xxk16z8" fill="currentColor" height="24" role="img" viewBox="0 0 48 48" width="24">
        <path d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.3 1.1 1.9 1.7l2.3 2c4.4 3.9 6.6 5.9 7.6 6.5.5.3 1.1.5 1.6.5s1.1-.2 1.6-.5c1-.6 2.8-2.2 7.8-6.8l2-1.8c.7-.6 1.3-1.2 2-1.7C42.7 29.6 48 25 48 17.6c0-8-6-14.5-13.4-14.5z"></path>
      </svg>
    `;

    likeBtn.addEventListener('click', () => {
      liked = !liked;
      likeBtn.innerHTML = liked ? svgAfter : svgBefore;
      logInteraction(liked ? 'like' : 'unlike', post.querySelector('img').src, post.dataset.caption)
    });
}


function insertAfter(newNode, referenceNode) {
  if (referenceNode.parentNode) {
    if (referenceNode.nextSibling) {
      referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    } else {
      referenceNode.parentNode.appendChild(newNode);
    }
  }
}


function insertFakePost() {
  isInsertingFakePost = true;
  
  const articles = Array.from(document.querySelectorAll('main article'));
  
  const currentArticle = articles
    .filter(article => !article.dataset.fakePost)
    .reduce((closest, article) => {
      const rect = article.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const distance = Math.abs(center - viewportCenter);
      
      if (!closest || distance < closest.distance) {
        return { article, distance };
      }
      return closest;
    }, null);
  
  if (!currentArticle || currentArticle.article.dataset.fakeInserted) {
    console.log('沒有可插入的目標文章');
    isInsertingFakePost = false;
    return;
  }

  const postData = fakePosts[Math.floor(Math.random() * fakePosts.length)];
  const post = createFakePost(postData);

  insertAfter(post, currentArticle.article);
  setupLikeButton(post);
  currentArticle.article.dataset.fakeInserted = 'true';
  post.dataset.fakePost = 'true';
  console.log('已插入一則假貼文');
  
  setTimeout(() => {
    isInsertingFakePost = false;
  }, 500);
}