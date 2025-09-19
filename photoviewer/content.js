/**************************************
 * IG Visible Image Collector + UI
 * - 掃可見貼文圖片 URL（debounced）
 * - 把新 URL 丟給 background → /evaluate
 * - 接收 evaluate 結果，浮窗顯示 final_prob
 **************************************/

// ====== 設定 ======
const FINAL_PASS_THRESHOLD = 0.5; // 觸發/通過門檻（可調）

// ====== 狀態 ======
let imageUrls = new Set();
let debounceTimeout = null;
let lastProcessedUrls = new Set();    // UI 增量渲染對照
let resultsCache = new Map();         // url -> { final_prob, ts, error }
let isDragging = false;
let currentX = 10, currentY = 10, initialX, initialY;

// ====== 小工具 ======
function debounce(func, wait) {
  return function (...args) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => func.apply(this, args), wait);
  };
}
function fmt(p) {
  if (typeof p !== "number" || Number.isNaN(p)) return "-";
  return (Math.round(p * 1000) / 1000).toFixed(3);
}

// ====== 浮窗 ======
const floatingWindow = document.createElement('div');
floatingWindow.id = 'image-url-window';
floatingWindow.style.cssText = `
  position: fixed; left: 10px; top: 10px; z-index: 999999;
  width: 420px; max-height: 320px; background: #fff; border: 1px solid #ddd; box-shadow: 0 4px 16px rgba(0,0,0,.1);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  color: #111;
`;
floatingWindow.innerHTML = `
  <div id="window-header" style="cursor: move; background:#111;color:#fff;padding:6px 8px; display:flex; align-items:center; justify-content:space-between;">
    <span style="font-size:13px;">Visible Post Image URLs (<span id="url-count">0</span>)</span>
    <div>
      <button id="toggle-window" style="margin-right:8px;">Hide</button>
      <button id="clear-cache" title="Clear evaluated cache">Clear</button>
    </div>
  </div>
  <div id="url-list" style="max-height:260px;overflow:auto;background:#fafafa;padding:6px 8px;margin:0;font-size:12px; line-height:1.45;">Loading...</div>
`;
document.body.appendChild(floatingWindow);

// 拖曳
const header = document.getElementById('window-header');
header.addEventListener('mousedown', (e) => {
  initialX = e.clientX - currentX;
  initialY = e.clientY - currentY;
  isDragging = true;
});
document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;
  floatingWindow.style.left = `${currentX}px`;
  floatingWindow.style.top = `${currentY}px`;
  floatingWindow.style.position = "fixed";
});
document.addEventListener('mouseup', () => {
  isDragging = false;
});

// 顯示/隱藏
const toggleButton = document.getElementById('toggle-window');
toggleButton.addEventListener('click', () => {
  const urlList = document.getElementById('url-list');
  const isHidden = urlList.style.display === 'none';
  urlList.style.display = isHidden ? 'block' : 'none';
  toggleButton.textContent = isHidden ? 'Hide' : 'Show';
  chrome.storage?.local?.set({ windowVisible: isHidden });
});

// 清除快取
document.getElementById('clear-cache').addEventListener('click', () => {
  resultsCache.clear();
  renderList(); // 立即刷新
});

// 初始化面板狀態
chrome.storage?.local?.get(['windowVisible'], (result) => {
  const urlList = document.getElementById('url-list');
  const vis = result?.windowVisible ?? true;
  urlList.style.display = vis ? 'block' : 'none';
  toggleButton.textContent = vis ? 'Hide' : 'Show';
  floatingWindow.style.left = '10px';
  floatingWindow.style.top = '10px';
});

// ====== 視窗/可見檢測 ======
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
    visibleRatio >= 0.5
  );
}
function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
}

// ====== 抽取可見貼文圖片 URL ======
function extractImageUrls() {
  const newUrls = new Set();
  const articles = Array.from(document.querySelectorAll('article')).filter(article => isInViewport(article));
  articles.forEach(article => {
    // 跳過廣告
    if (article.querySelector('[class*="sponsored"], [data-ad-id]') || article.innerHTML.includes('Sponsored')) {
      return;
    }
    const images = article.querySelectorAll('img[src], img[data-src], img[srcset]');
    images.forEach(img => {
      const src = img.src || img.dataset?.src || (img.srcset && img.srcset.split(' ')[0]);
      if (
        src &&
        src.startsWith('https://') &&
        (src.includes('cdninstagram.com') || src.includes('fbcdn.net')) &&
        src.includes('t51.2885-15') &&     // 貼文圖片
        !src.includes('t51.2885-19') &&    // 排除大頭貼
        !src.includes('profile_pic') &&
        !src.includes('ad') &&
        isInViewport(img) &&
        isVisible(img)
      ) {
        newUrls.add(src);
      }
    });
  });

  // 若集合有變 → 更新面板與通知 background
  const changed = (newUrls.size !== imageUrls.size) || [...newUrls].some(url => !imageUrls.has(url));
  if (changed) {
    imageUrls = newUrls;
    renderList();
    chrome.runtime.sendMessage({ action: 'sendImageUrls', urls: [...imageUrls] });
  }
}

// ====== UI 渲染（含 final_prob 顯示） ======
const updateFloatingWindow = debounce((urls) => {
  requestAnimationFrame(() => {
    const urlList = document.getElementById('url-list');
    const urlCount = document.getElementById('url-count');
    urlCount.textContent = urls.length;

    // 僅在 URL 改變時重繪；但若有分數更新也會重繪（看下方 renderList ）
    if (urls.length === 0) {
      urlList.innerHTML = '<div style="color:#666;">No visible post images found</div>';
      lastProcessedUrls = new Set();
      return;
    }

    // 生成行
    const rows = urls.map(u => {
      const r = resultsCache.get(u);
      let badge = `<span style="background:#ddd;color:#333;padding:1px 6px;border-radius:10px;font-size:11px;">pending</span>`;
      if (r?.error) {
        badge = `<span style="background:#e11;color:#fff;padding:1px 6px;border-radius:10px;font-size:11px;">error</span>`;
      } else if (typeof r?.final_prob === "number") {
        const pass = r.final_prob >= FINAL_PASS_THRESHOLD;
        badge = `<span style="background:${pass ? "#16a34a" : "#6b7280"};color:#fff;padding:1px 6px;border-radius:10px;font-size:11px;">
          ${fmt(r.final_prob)} ${pass ? "PASS" : "FAIL"}
        </span>`;
      }
      return `
        <div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
          ${badge}
          <a href="${u}" target="_blank" style="word-break:break-all;color:#0366d6;text-decoration:none;">${u}</a>
        </div>
      `;
    });

    const newHtml = rows.join('');
    // 僅在 URL 集合變更或內容不同時更新 DOM
    if (urls.join() !== [...lastProcessedUrls].join() || urlList.dataset.hash !== String(newHtml.length)) {
      urlList.innerHTML = newHtml;
      urlList.dataset.hash = String(newHtml.length);
      lastProcessedUrls = new Set(urls);
    }
  });
}, 50);

function renderList() {
  updateFloatingWindow([...imageUrls]);
}

// ====== 接收 background 回傳的結果 ======
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== 'evaluateResult') return;
  const arr = Array.isArray(msg.results) ? msg.results : [];
  const now = Date.now();
  arr.forEach(item => {
    const url = item?.url;
    if (!url) return;
    if (item?.error) {
      resultsCache.set(url, { error: String(item.error), ts: now });
    } else {
      resultsCache.set(url, {
        final_prob: typeof item.final_prob === "number" ? item.final_prob : null,
        ts: now
      });
    }
  });
  renderList(); // 更新 UI 顯示分數
});

// ====== 監聽 DOM 與滾動 ======
function observePosts() {
  const target =
    document.querySelector('main[role="main"] div[role="feed"]') ||
    document.querySelector('main[role="main"]') ||
    document.querySelector('div[class*="x9f619"]') ||
    document.body;

  const observer = new MutationObserver(debounce(() => {
    extractImageUrls();
  }, 50));
  observer.observe(target, { childList: true, subtree: true });

  window.addEventListener('scroll', debounce(() => {
    requestAnimationFrame(extractImageUrls);
  }, 50));

  // 初始抓取
  extractImageUrls();
}

// ====== 啟動 ======
function init() {
  const checkMain = setInterval(() => {
    if (document.querySelector('main[role="main"]') || document.querySelector('div[class*="x9f619"]')) {
      clearInterval(checkMain);
      observePosts();
    }
  }, 800);
}

try {
  init();
} catch (error) {
  console.error('Plugin error:', error);
  const urlList = document.getElementById('url-list');
  if (urlList) urlList.innerHTML = '<div>Error: Failed to load URLs. Check console for details.</div>';
}
