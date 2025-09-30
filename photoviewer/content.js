/*
----------------------
 instagram crawler
 ----------------------
*/


let imageUrls = new Set();
let debounceTimeout = null;
let lastProcessedUrls = new Set(); // Cache for incremental updates

// Debounce function to limit update frequency
function debounce(func, wait) {
  return function (...args) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Create floating window with status
const floatingWindow = document.createElement('div');
floatingWindow.id = 'image-url-window';
floatingWindow.innerHTML = `
  <div id="window-header">
    <span>Visible Post Image URLs (<span id="url-count">0</span>)</span>
    <button id="toggle-window">Hide</button>
  </div>
  <div id="url-list">Loading...</div>
`;
document.body.appendChild(floatingWindow);

// Make window draggable
let isDragging = false;
let currentX = 10, currentY = 10, initialX, initialY;

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
    currentY = e.clientY - initialY;
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
  chrome.storage.local.set({ windowVisible: isHidden });
});

// Initialize window state
chrome.storage.local.get(['windowVisible'], (result) => {
  const urlList = document.getElementById('url-list');
  urlList.style.display = result.windowVisible ? 'block' : 'none';
  toggleButton.textContent = result.windowVisible ? 'Hide' : 'Show';
  floatingWindow.style.left = '10px';
  floatingWindow.style.top = '10px';
});

// Update floating window with URLs
const updateFloatingWindow = debounce((urls) => {
  requestAnimationFrame(() => {
    requestIdleCallback(() => {
      const urlList = document.getElementById('url-list');
      const urlCount = document.getElementById('url-count');
      urlCount.textContent = urls.length;
      if (urls.length === 0) {
        urlList.innerHTML = '<div>No visible post images found</div>';
      } else {
        // Incremental update: only re-render if URLs changed
        if (urls.join() !== [...lastProcessedUrls].join()) {
          urlList.innerHTML = urls.map(url => `<div><a href="${url}" target="_blank">${url}</a></div>`).join('');
          lastProcessedUrls = new Set(urls);
        }
      }
    });
  });
}, 50);

// Check if element is partially in viewport with at least 50% visible
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
  const elementHeight = rect.bottom - rect.top;
  const visibleRatio = elementHeight > 0 ? visibleHeight / elementHeight : 0;
  return (
    rect.bottom > 0 &&
    rect.top < windowHeight &&
    rect.right > 0 &&
    rect.left < windowWidth &&
    visibleRatio >= 0.5 // At least 50% of the image is visible
  );
}

// Check if element is visible (not hidden by CSS)
function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
}

let intervention = false;
// Extract visible post image URLs
function extractImageUrls() {
  console.log('Extracting visible post image URLs...');
  const newUrls = new Set();

  // Only scan visible articles
  const articles = Array.from(document.querySelectorAll('article'))
    .filter(article => 
      !article.dataset.fakePost &&  // ← 排除假貼文本身
      !article.dataset.fakeInserted &&  // ← 排除已插入假貼文的文章
      isInViewport(article)
    );
  articles.forEach(article => {
    // Skip sponsored posts
    if (article.querySelector('[class*="sponsored"], [data-ad-id]') || article.innerHTML.includes('Sponsored')) {
      return;
    }
    const images = article.querySelectorAll('img[src], img[data-src], img[srcset]');
    images.forEach(img => {
      const src = img.src || img.dataset.src || (img.srcset && img.srcset.split(' ')[0]);
      if (
        src &&
        src.startsWith('https://') &&
        (src.includes('cdninstagram.com') || src.includes('fbcdn.net')) &&
        src.includes('t51.2885-15') && // Post images
        !src.includes('t51.2885-19') && // Exclude profile pictures
        !src.includes('profile_pic') &&
        !src.includes('ad') && // Exclude ad images
        isInViewport(img) && // At least 50% visible
        isVisible(img) // Currently displayed (not hidden in carousel)
      ) {
        newUrls.add(src);
      }
    });
  });

  // Only update if URLs changed
  if (newUrls.size !== imageUrls.size || [...newUrls].some(url => !imageUrls.has(url))) {
    imageUrls = newUrls;
    console.log('Found visible URLs:', [...imageUrls]);
    updateFloatingWindow([...imageUrls]);
    chrome.runtime.sendMessage({ action: 'sendImageUrls', urls: [...imageUrls] }, (response) => {
      if (Array.isArray(response)) {
        intervention = response.some(item => item.intervention === true);
        console.log('intervention', intervention);
        if (intervention) {
          insertFakePost();
          intervention = false;
        } else {
          console.log('機率未達，未插入假貼文');
        }
      };
    });
  }
}

let isInsertingFakePost = false;
// Observe changes in post container and scroll events
function observePosts() {
  const target = document.querySelector('main[role="main"] div[role="feed"]') ||
                document.querySelector('main[role="main"]') ||
                document.querySelector('div[class*="x9f619"]') ||
                document.body;
  console.log('Observing target:', target.tagName, target.className);
  const observer = new MutationObserver(debounce(() => {
    if (isInsertingFakePost) {
      console.log('正在插入假貼文，忽略 MutationObserver');
      return;
    }
    console.log('MutationObserver triggered');
    extractImageUrls();
  }, 50));

  observer.observe(target, {
    childList: true,
    subtree: true
  });

  // Update on scroll to ensure URLs are removed when images leave viewport
  window.addEventListener('scroll', debounce(() => {
    console.log('Scroll event triggered');
    requestAnimationFrame(extractImageUrls);
  }, 50));

  // Initial extraction
  extractImageUrls();
}

// Wait for Instagram to load
function init() {
  console.log('Initializing plugin...');
  const checkMain = setInterval(() => {
    if (document.querySelector('main[role="main"]') || document.querySelector('div[class*="x9f619"]')) {
      console.log('Instagram page loaded, starting observer');
      clearInterval(checkMain);
      observePosts();
    }
  }, 1000);
}

// Error handling
try {
  init();
} catch (error) {
  console.error('Plugin error:', error);
  const urlList = document.getElementById('url-list');
  urlList.innerHTML = '<div>Error: Failed to load URLs. Check console for details.</div>';
}


/*
----------------------
 intervention fake posts
 ----------------------
*/


const fakePosts = [
  {
    username: "@dog_on_a_trip",
    caption: "開車兜風 ❤️🚗✨",
    image: chrome.runtime.getURL("images/icon1.png")
  },
  {
    username: "@chill_cat",
    caption: "午睡時光 💤☀️",
    image: chrome.runtime.getURL("images/icon2.png")
  },
  {
    username: "@abcd_eat",
    caption: `什麼！星期一了😱
              嘿嘿好險我只是可愛狗勾不用上班的
              就讓再我多睡一點吧😴😴😴`,
    image: chrome.runtime.getURL("images/icon3.png")
  },
];


function createFakePost({ username, caption, image }) {
  const post = document.createElement('article');
  post.classList.add('fake-inserted');
  post.style = `
      max-width: 470px;
      width: 100%;
      margin: 0 auto 24px;
      border: 1px solid #dbdbdb;
      border-radius: 3px;
      background-color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      min-height: 300px;
    `;
    post.innerHTML = `
      <header style="display: flex; align-items: center; padding: 14px;">
        <img src="${image}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;">
        <strong>${username}</strong>
      </header>
      <img src="${image}" style="width: 100%; display: block;">
      <div style="padding: 10px;">
        <p><strong>${username}</strong> ${caption}</p>
      </div>
    `;
  return post;
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
  currentArticle.article.dataset.fakeInserted = 'true';
  post.dataset.fakePost = 'true';
  console.log('已插入一則假貼文');
  
  setTimeout(() => {
    isInsertingFakePost = false;
  }, 500);
}