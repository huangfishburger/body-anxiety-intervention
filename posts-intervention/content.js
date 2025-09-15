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
  post.className = 'fake-inserted';
  post.style = `
    max-width: 470px;
    width: 100%;
    margin: 0 auto 24px;
    border: 1px solid #dbdbdb;
    border-radius: 3px;
    background-color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
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


const intersectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;

    const article = entry.target;

    if (article.previousElementSibling?.classList?.contains('fake-inserted')) return;

    const randomValue = Math.random();
    console.log(`正在觀看一篇貼文，隨機值：${randomValue}`);

    if (randomValue > 0.75) {
      const feed = article.parentElement;
      const postData = fakePosts[Math.floor(Math.random() * fakePosts.length)];
      const post = createFakePost(postData);
      insertAfter(post, article);
      console.log('已插入一則假貼文');
    } else {
      console.log('機率未達，未插入假貼文');
    }
  });
}, {
  root: null,
  rootMargin: '0px',
  threshold: 0.5
});

function observeArticles() {
  const articles = document.querySelectorAll('main article');
  articles.forEach(article => intersectionObserver.observe(article));
}

// 啟動初始觀察
observeArticles();

// 用 MutationObserver 監控 DOM 變化，自動對新貼文啟用 intersectionObserver
if (!window.__positivityMutationObserver) {
  const mutationObserver = new MutationObserver(() => {
    observeArticles();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  window.__positivityMutationObserver = mutationObserver;
}
