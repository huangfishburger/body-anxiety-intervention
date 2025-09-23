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

// Observe changes in post container and scroll events
function observeContent() {
  const target = document.querySelector('main[role="main"]') || document.body;

  if (observer) {
      observer.disconnect();
  }

  observer = new MutationObserver(debounce(() => {
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