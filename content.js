if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCat);
} else {
  initCat();
}

function initCat() {
  if (document.getElementById('corner-cat')) return;

  if (!document.getElementById('cat-styles')) {
    const style = document.createElement('style');
    style.id = 'cat-styles';
    style.textContent = `
      #corner-cat {
        position: fixed;
        bottom: 5px;
        right: 10px;
        z-index: 999999;
        pointer-events: none;
      }
      
      #corner-cat img {
        width: 200px;
        height: 140px;
        object-fit: contain;
        opacity: 1;
        transition: opacity 0.3s ease, transform 0.3s ease;
        display: block;
        pointer-events: auto;
        cursor: pointer;
        border-radius: 8px;
        filter: drop-shadow(0 2px 8px rgba(0,0,0,0.1));
      }
      
      #corner-cat img:hover {
        transform: translateY(-2px);
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
      }
      
      #cat-main-menu, #cat-action-menu {
        position: fixed;
        bottom: 160px;
        right: 20px;
        background: white;
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border: 1px solid rgba(0,0,0,0.05);
        animation: slideIn 0.3s ease-out;
        max-width: 200px;
      }

      #cat-eat-menu, #cat-eat-message {
        position: fixed;
        bottom: 160px;
        right: 35px;
        background: white;
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border: 1px solid rgba(0,0,0,0.05);
        animation: slideIn 0.3s ease-out;
        max-width: 200px;
      }
      
      #cat-main-menu::after, #cat-action-menu::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 30px;
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid white;
      }

      #cat-eat-menu::after, #cat-eat-message::after, #cat-talk::after, #cat-play::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 20px;
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid white;
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      #cat-main-menu div:first-child, #cat-action-menu div:first-child {
        font-size: 13px;
        color: #333;
        margin-bottom: 16px;
        text-align: center;
        line-height: 1.4;
      }
      
      #cat-main-menu button, #cat-action-menu button {
        background: white;
        border: 2px solid #e1e5e9;
        padding: 5px 8px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
        font-family: inherit;
        margin: 4px 0;
        width: 100%;
        color: #555;
      }
      
      #cat-main-menu button:hover, #cat-action-menu button:hover {
        background: #4ECDC4;
        border-color: #4ECDC4;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);
      }
      
      #cat-action-menu {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 200px;
      }
    `;
    document.head.appendChild(style);
  }

  // container
  const catContainer = document.createElement('div');
  catContainer.id = 'corner-cat';

  // image
  const catImg = document.createElement('img');
  catImg.alt = 'Sleeping Cat';

  const images = ['cat_sleep.gif', 'cat_sleep2.gif'];
  let current = 0;
  let intervalId = null;
  let isAwake = false;
  let actionMenuShown = false;
  let hasSeenMenuOnce = false;
  let eatTimeout = null; 


  function updateImage() {
    if (isAwake) return; 

    catImg.style.opacity = '0';
    setTimeout(() => {
      current = (current + 1) % images.length;
      catImg.src = chrome.runtime.getURL(`assets/${images[current]}`);
      catImg.style.opacity = '1';
    }, 200);
  }

  function startSleepLoop() {
    if (!intervalId) {
      intervalId = setInterval(updateImage, 15000);
    }
  }

  function stopSleepLoop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function showAwakeCat() {
      if (isAwake || actionMenuShown) return;
      isAwake = true;
    
      stopSleepLoop();
    
      catImg.style.transition = 'none';
      catImg.src = chrome.runtime.getURL('assets/cat_awake.gif');
      catImg.style.opacity = '1';

      showMainPrompt();
    }
    

  // 點擊事件：讓貓醒來
  catImg.addEventListener('click', showAwakeCat);

  // 初始設定
  catImg.src = chrome.runtime.getURL(`assets/${images[current]}`);
  catContainer.appendChild(catImg);
  document.body.appendChild(catContainer);
  startSleepLoop();

  function resetCat() {
      isAwake = false;
      actionMenuShown = false;
      catImg.style.transition = 'opacity 0.2s ease';
      catImg.style.transform = 'scale(1)'; 
      catContainer.style.right = '10px'; 
      catImg.src = chrome.runtime.getURL(`assets/${images[current]}`);
      startSleepLoop();
  }

  function showMainPrompt() {
      actionMenuShown = true;
    
      const menu = document.createElement('div');
      menu.id = 'cat-main-menu';
      
      const text = document.createElement('div');
      text.textContent = '累了嗎？要不要一起做點別的事放鬆一下？';
      menu.appendChild(text);
    
      const yesBtn = document.createElement('button');
      yesBtn.textContent = '好呀';
      yesBtn.onclick = () => {
        document.body.removeChild(menu);
        showActionMenu();
      };
    
      const noBtn = document.createElement('button');
      noBtn.textContent = '我沒事';
      noBtn.onclick = () => {
        document.body.removeChild(menu);
        resetCat();
      };
    
      menu.appendChild(yesBtn);
      menu.appendChild(noBtn);
      document.body.appendChild(menu);
    }
    
    function showActionMenu() {
      const menu = document.createElement('div');
      menu.id = 'cat-action-menu';
    
      isAwake = true;
      actionMenuShown = true;
      catImg.src = chrome.runtime.getURL('assets/cat_awake.gif');
    
      const message = document.createElement('div');
      message.textContent = '想做什麼呢？我都可以陪你唷～';
      menu.appendChild(message);
    
      const actions = [
        { label: '和我一起吃點東西', handler: handleEat },
        { label: '來聊聊天', handler: handleTalk },
        { label: '跳舞給你看！', handler: handleDance },
        { label: '玩個遊戲吧', handler: handlePlay }
      ];
    
      actions.forEach(({ label, handler }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.onclick = () => {
          document.body.removeChild(menu);
          handler();
        };
        menu.appendChild(btn);
      });
    
      // 加入「✕ 結束」按鈕（第二次以後才顯示）
      if (hasSeenMenuOnce) {
        const endBtn = document.createElement('button');
        endBtn.textContent = '✕ 結束';
        endBtn.style.color = '#888';
        
        endBtn.onmouseenter = () => {
          endBtn.style.background = '#4ECDC4';
          endBtn.style.borderColor = '#4ECDC4';
          endBtn.style.color = 'white';
        };
        
        endBtn.onmouseleave = () => {
          endBtn.style.background = 'white';
          endBtn.style.borderColor = '#e1e5e9';
          endBtn.style.color = '#888';
        };
        
        endBtn.onclick = () => {
          menu.remove();
          removeBackButton();
          resetCat();
        };
        menu.appendChild(endBtn);
      }
    
      hasSeenMenuOnce = true;
      document.body.appendChild(menu);
    }
    

    function createBackButton() {
      const existingBtn = document.getElementById('cat-back-button');
      if (existingBtn) {
        existingBtn.remove();
      }

      const backBtn = document.createElement('button');
      backBtn.id = 'cat-back-button';
      backBtn.textContent = '←';
      backBtn.title = '回選單';
    
      backBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 30px;
        height: 30px;
        font-size: 14px;
        background: white;
        border: 1px solid #f0f0f0;
        border-radius: 50%;
        cursor: pointer;
        z-index: 1000001;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.2s;
      `;
    
      backBtn.onmouseenter = () => {
        backBtn.style.background = '#f0f0f0';
      };
      backBtn.onmouseleave = () => {
        backBtn.style.background = 'white';
      };
    
      backBtn.onclick = () => {
        if (eatTimeout) {
          clearTimeout(eatTimeout);
          eatTimeout = null;
        }
        
        const menus = ['cat-eat-menu', 'cat-eat-message', 'cat-talk', 'cat-dance', 'cat-play'];
        menus.forEach(id => {
          const menu = document.getElementById(id);
          if (menu) menu.remove();
        });
        
        const sparkleContainer = document.getElementById('sparkle-container');
        if (sparkleContainer) sparkleContainer.remove();
        
        const danceAudio = document.getElementById('dance-audio');
        if (danceAudio) {
          danceAudio.pause();
          danceAudio.currentTime = 0;
          danceAudio.remove();
        }
        
        removeBackButton();
        catContainer.style.right = '10px'; 
        catImg.style.transform = 'scale(1)'; 
        showActionMenu();
      };
    
      document.body.appendChild(backBtn);
    }

    function removeBackButton() {
      const backBtn = document.getElementById('cat-back-button');
      if (backBtn) {
        backBtn.remove();
      }
    }
    
  function contentStyle() {
    return `
      position: fixed;
      bottom: 160px;
      left: 20px;
      background: white;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(0,0,0,0.05);
      animation: slideIn 0.3s ease-out;
      max-width: 200px;
    `;
  }
  
  // -------------------------------------- EAT -------------------------------------------------------
  // --------------------------------------------------------------------------------------------------

  function handleEat() {
    // 1. 讓貓咪變成準備吃飯的樣子
    catImg.src = chrome.runtime.getURL('assets/cat_eating_prepare.gif');
    catContainer.style.right = '25px';
    
    // 2. 顯示選擇菜單和回上頁按鈕
    showEatMenu();
    createBackButton();
  }
  
  function showEatMenu() {
    const foodOptions = [
      {
        label: '🍜',
        gif: 'cat_noodles.gif',
        message: '有熱呼呼的東西陪著，就不會那麼煩啦～'
      },
      {
        label: '🍕',
        gif: 'cat_pizza.gif',
        message: '吃飽飽，才能有力氣面對每一天～你今天也要好好吃飯喔！'
      },
      {
        label: '🍦',
        gif: 'cat_icecream.gif',
        message: '偶爾吃點甜的，心情也會被治癒喔！'
      },
      {
        label: '☕',
        gif: 'cat_coffee.gif',
        message: '慢慢喝，休息一下～你值得放鬆'
      }
    ];
  
    const menu = document.createElement('div');
    menu.id = 'cat-eat-menu';
  
    const prompt = document.createElement('div');
    prompt.textContent = '選一樣想吃的吧～我陪你吃！';
    prompt.style.cssText = 'text-align: center; margin-bottom: 12px; font-size: 13px; color: #333;';
    menu.appendChild(prompt);
  
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;';
  
    foodOptions.forEach(({ label, gif, message }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        width: 35px;
        height: 35px;
        background: white;
        border: 1px solid #f0f0f0;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        transition: background 0.2s, transform 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      `;
      
      btn.onmouseenter = () => {
        btn.style.background = '#f0f0f0';
        btn.style.transform = 'translateY(-1px)';
      };
      
      btn.onmouseleave = () => {
        btn.style.background = 'white';
        btn.style.transform = 'translateY(0)';
      };
  
      btn.onclick = () => {
        menu.remove();
        eatFood(gif, message);
      };
  
      btnGroup.appendChild(btn);
    });
  
    menu.appendChild(btnGroup);
    document.body.appendChild(menu);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        menu.remove();
        catContainer.style.right = '10px';
        removeBackButton();
        showActionMenu();
      };
    }
  }
  
  function eatFood(foodGif, message) {
    // 1. 顯示吃該食物的 gif
    catImg.src = chrome.runtime.getURL(`assets/${foodGif}`);
    
    // 2. 三秒後顯示吃飽的 gif 和 message
    eatTimeout = setTimeout(() => {
      catImg.src = chrome.runtime.getURL('assets/cat_eat_full.gif');
      catImg.style.transform = 'scale(1.2)';
      showEatMessage(message);
      eatTimeout = null;
    }, 3000);

    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        if (eatTimeout) {
          clearTimeout(eatTimeout);
          eatTimeout = null;
        }
        catImg.style.transform = 'scale(1)';
        catImg.src = chrome.runtime.getURL('assets/cat_eating_prepare.gif');
        showEatMenu();
      };
    }
  }
  
  function showEatMessage(message) {
    const msgMenu = document.createElement('div');
    msgMenu.id = 'cat-eat-message';
  
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.cssText = 'text-align: center; margin-bottom: 12px; font-size: 13px; color: #333;';
    msgMenu.appendChild(messageDiv);
  
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
  
    const continueBtn = document.createElement('button');
    continueBtn.textContent = '還想再吃';
    continueBtn.style.cssText = `
      background: white;
      border: 2px solid #e1e5e9;
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
      color: #555;
    `;
    
    continueBtn.onmouseenter = () => {
      continueBtn.style.background = '#4ECDC4';
      continueBtn.style.borderColor = '#4ECDC4';
      continueBtn.style.color = 'white';
    };
    
    continueBtn.onmouseleave = () => {
      continueBtn.style.background = 'white';
      continueBtn.style.borderColor = '#e1e5e9';
      continueBtn.style.color = '#555';
    };
  
    continueBtn.onclick = () => {
      msgMenu.remove();
      catImg.style.transform = 'scale(1)';
      catImg.src = chrome.runtime.getURL('assets/cat_eating_prepare.gif');
      showEatMenu();
    };
  
    const doneBtn = document.createElement('button');
    doneBtn.textContent = '吃飽了～';
    doneBtn.style.cssText = `
      background: white;
      border: 2px solid #e1e5e9;
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
      color: #888;
    `;
    
    doneBtn.onmouseenter = () => {
      doneBtn.style.background = '#4ECDC4';
      doneBtn.style.borderColor = '#4ECDC4';
      doneBtn.style.color = 'white';
    };
    
    doneBtn.onmouseleave = () => {
      doneBtn.style.background = 'white';
      doneBtn.style.borderColor = '#e1e5e9';
      doneBtn.style.color = '#888';
    };
  
    doneBtn.onclick = () => {
      msgMenu.remove();
      removeBackButton();
      catImg.style.transform = 'scale(1)';
      catContainer.style.right = '10px';
      showActionMenu();
    };
  
    btnGroup.appendChild(continueBtn);
    btnGroup.appendChild(doneBtn);
    msgMenu.appendChild(btnGroup);
    
    document.body.appendChild(msgMenu);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        msgMenu.remove();
        catImg.style.transform = 'scale(1)';
        catImg.src = chrome.runtime.getURL('assets/cat_eating_prepare.gif');
        showEatMenu();
      };
    }
  }
  
  // -------------------------------------- TALK -------------------------------------------------------
  // --------------------------------------------------------------------------------------------------

  function handleTalk() {
    // 1. 讓貓咪變成對話狀態
    catImg.src = chrome.runtime.getURL('assets/cat_talk.gif');
    catContainer.style.right = '25px'; 
    
    // 2. 顯示對話選項
    showTalkMenu();
    createBackButton();
  }
  

  function showTalkMenu() {
    const content = document.createElement('div');
    content.id = 'cat-talk';
    content.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 35px;
      background: white;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(0,0,0,0.05);
      animation: slideIn 0.3s ease-out;
      max-width: 250px;
    `;
  
    const message = document.createElement('div');
    message.textContent = '想聊點什麼呢？';
    message.style.cssText = 'text-align: center; margin-bottom: 12px; font-size: 13px; color: #333;';
    content.appendChild(message);
  
    const topics = [
      {
        label: '最近有點焦慮… 🌧️',
        messages: [
          '有時候感覺卡卡的也沒關係，我們一起慢慢來～',
          '不一定要馬上振作，先讓自己喘口氣吧。',
          '我會在這裡陪你，就算什麼都不說也沒關係。'
        ]
      },
      {
        label: '想放空一下 ☁️',
        messages: [
          '閉上眼睛，吸一口氣～呼～有慢慢平靜下來嗎？',
          '現在的你，不需要做任何事，就只是好好存在就夠了。',
          '來～放空10秒鐘，我陪你安靜一下🌿'
        ]
      },
      {
        label: '給我一點鼓勵 ☀️',
        messages: [
          '你真的已經很棒了，我為你感到驕傲！',
          '不管現在走得多慢，都是在往前～',
          '你值得被好好對待，也包括你對自己的溫柔喔。'
        ]
      },
      {
        label: '想轉換一下心情 🌼',
        messages: [
          '試著想一件最近微小但可愛的事情～是不是感覺有點不一樣了？',
          '就算今天不完美，也還有好多可能在明天等著你。',
          '我們可以一起放空五秒，然後笑一下，好不好？'
        ]
      }
    ];
  
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
  
    topics.forEach(({ label, messages }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        background: white;
        border: 2px solid #e1e5e9;
        padding: 8px 12px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
        color: #555;
        text-align: left;
      `;
      
      btn.onmouseenter = () => {
        btn.style.background = '#4ECDC4';
        btn.style.borderColor = '#4ECDC4';
        btn.style.color = 'white';
        btn.style.transform = 'translateY(-1px)';
      };
      
      btn.onmouseleave = () => {
        btn.style.background = 'white';
        btn.style.borderColor = '#e1e5e9';
        btn.style.color = '#555';
        btn.style.transform = 'translateY(0)';
      };
  
      btn.onclick = () => {
        content.remove();
        showTalkResponse(label, messages);
      };
  
      btnGroup.appendChild(btn);
    });
  
    content.appendChild(btnGroup);
    document.body.appendChild(content);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      const originalOnclick = backBtn.onclick;
      backBtn.onclick = () => {
        content.remove();
        catContainer.style.right = '10px';
        removeBackButton();
        showActionMenu();
      };
    }
  }
  
  function showTalkResponse(topicLabel, messages) {
    const imageOptions = [
      'cat_unicorn.gif',
      'cat_mermaid.gif', 
      'cat_squirrel.gif',
      'cat_butterfly.gif',
      'cat_heart.gif'
    ];
  
    // 隨機選擇一個回應和圖片
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const randomImage = imageOptions[Math.floor(Math.random() * imageOptions.length)];
    
    // 更換貓咪圖片
    catImg.src = chrome.runtime.getURL(`assets/${randomImage}`);
  
    const content = document.createElement('div');
    content.id = 'cat-talk';
    content.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 35px;
      background: white;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(0,0,0,0.05);
      animation: slideIn 0.3s ease-out;
      max-width: 280px;
    `;
  
    const text = document.createElement('div');
    text.textContent = randomMessage;
    text.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 12px;
      text-align: center;
      color: #333;
    `;
    content.appendChild(text);
  
    const againBtn = document.createElement('button');
    againBtn.textContent = '再說一句';
    againBtn.style.cssText = `
      background: white;
      border: 2px solid #e1e5e9;
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
      color: #555;
      width: 100%;
    `;
    
    againBtn.onmouseenter = () => {
      againBtn.style.background = '#4ECDC4';
      againBtn.style.borderColor = '#4ECDC4';
      againBtn.style.color = 'white';
    };
    
    againBtn.onmouseleave = () => {
      againBtn.style.background = 'white';
      againBtn.style.borderColor = '#e1e5e9';
      againBtn.style.color = '#555';
    };
  
    againBtn.onclick = () => {
      content.remove();
      showTalkResponse(topicLabel, messages);
    };
  
    content.appendChild(againBtn);
    document.body.appendChild(content);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        content.remove();
        catImg.src = chrome.runtime.getURL('assets/cat_talk.gif');
        showTalkMenu();
      };
    }
  }
  
  // -------------------------------------- DANCE -------------------------------------------------------
  // --------------------------------------------------------------------------------------------------

  function handleDance() {
    // 1. 讓貓咪開始跳舞
    const danceGifs = ['cat_dancing_1.gif', 'cat_dancing_2.gif', 'cat_dancing_3.gif', 'cat_dancing_4.gif'];
    let currentIndex = 0;
    catImg.src = chrome.runtime.getURL(`assets/${danceGifs[0]}`);
    catContainer.style.right = '160px'; 
    
    // 2. 播放背景音樂
    const audio = new Audio(chrome.runtime.getURL('assets/dance_music.mp3'));
    audio.id = 'dance-audio';
    audio.loop = true; 
    audio.volume = 0.5; 
    audio.play().catch(e => console.log('Audio play failed:', e));
    document.body.appendChild(audio);
    
    // 3. 創建 sparkle 動物
    const sparkleContainer = document.createElement('div');
    sparkleContainer.id = 'sparkle-container';
    sparkleContainer.style.cssText = `
      position: fixed;
      bottom: 5px;
      right: 10px;
      z-index: 999999;
      pointer-events: none;
    `;
    
    const sparkle = document.createElement('img');
    sparkle.src = chrome.runtime.getURL('assets/sparkle_rotate.gif');
    sparkle.style.cssText = `
      width: 200px;
      height: 140px;
      object-fit: contain;
      opacity: 1;
      display: block;
      border-radius: 8px;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.1));
    `;
    
    sparkleContainer.appendChild(sparkle);
    document.body.appendChild(sparkleContainer);
    
    // 4. 顯示對話框
    const container = document.createElement('div');
    container.id = 'cat-dance';
    container.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 180px;
      background: white;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(0,0,0,0.05);
      animation: slideIn 0.3s ease-out;
      max-width: 200px;
    `;

    const tail = document.createElement('div');
    tail.style.cssText = `
      position: absolute;
      bottom: -8px;
      right: 30px;
      width: 0;
      height: 0;
      border-left: 10px solid transparent;
      border-right: 10px solid transparent;
      border-top: 10px solid white;
    `;
    container.appendChild(tail);

    // 鼓勵訊息
    const msg = document.createElement('div');
    const messages = ['你也可以一起來跳哦～', '唷呼！', '好耶！', '跟我一起扭扭～'];
    msg.textContent = messages[0];
    msg.style.cssText = `
      font-size: 13px;
      color: #333;
      text-align: center;
      line-height: 1.4;
    `;
    container.appendChild(msg);
    
    document.body.appendChild(container);
    createBackButton();

    // 貓咪跳舞 gif 輪播
    const frameInterval = setInterval(() => {
      currentIndex = (currentIndex + 1) % danceGifs.length;
      catImg.src = chrome.runtime.getURL(`assets/${danceGifs[currentIndex]}`);
    }, 3000);

    // 訊息輪播
    const msgInterval = setInterval(() => {
      msg.textContent = messages[Math.floor(Math.random() * messages.length)];
    }, 3000);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      const originalOnclick = backBtn.onclick;
      backBtn.onclick = () => {
        clearInterval(frameInterval);
        clearInterval(msgInterval);
        sparkleContainer.remove();
        audio.pause();
        audio.currentTime = 0; 
        audio.remove(); 
        catContainer.style.right = '10px'; 
        originalOnclick();
      };
    }
  }
  
  // -------------------------------------- PLAY -------------------------------------------------------
  // --------------------------------------------------------------------------------------------------

  function handlePlay() {
    // 1. 讓貓咪變成遊戲狀態
    catImg.src = chrome.runtime.getURL('assets/cat_gaming.gif');
    catContainer.style.right = '55px'; 
    
    // 2. 顯示遊戲說明
    showGameIntro();
    createBackButton();
  }
  
  function showGameIntro() {
    const content = document.createElement('div');
    content.id = 'cat-play';
    content.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 45px;
      background: white;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(0,0,0,0.05);
      animation: slideIn 0.3s ease-out;
      max-width: 250px;
    `;
  
    const message = document.createElement('div');
    message.textContent = '一起來玩戳泡泡遊戲吧！';
    message.style.cssText = 'text-align: center; margin-bottom: 12px; font-size: 13px; color: #333;';
    content.appendChild(message);
  
    const description = document.createElement('div');
    description.textContent = '30秒遊戲時間，點擊泡泡就能戳破它們～看你能戳多少個！';
    description.style.cssText = 'text-align: center; margin-bottom: 16px; font-size: 12px; color: #666; line-height: 1.4;';
    content.appendChild(description);
  
    const startBtn = document.createElement('button');
    startBtn.textContent = '開始遊戲！';
    startBtn.style.cssText = `
      background: white;
      border: 2px solid #e1e5e9;
      padding: 10px 20px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
      color: #555;
      width: 100%;
    `;
    
    startBtn.onmouseenter = () => {
      startBtn.style.background = '#4ECDC4';
      startBtn.style.borderColor = '#4ECDC4';
      startBtn.style.color = 'white';
      startBtn.style.transform = 'translateY(-1px)';
    };
    
    startBtn.onmouseleave = () => {
      startBtn.style.background = 'white';
      startBtn.style.borderColor = '#e1e5e9';
      startBtn.style.color = '#555';
      startBtn.style.transform = 'translateY(0)';
    };
  
    startBtn.onclick = () => {
      content.remove();
      startBubbleGame();
    };
  
    content.appendChild(startBtn);
    document.body.appendChild(content);
  
    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        content.remove();
        catContainer.style.right = '10px';
        removeBackButton();
        showActionMenu();
      };
    }
  }
  
  function startBubbleGame() {
    let score = 0;
    let gameActive = true;
    let bubbles = [];
    let gameContainer;
    let timeLeft = 30;
  
    catContainer.style.display = 'none';
  
    // 隨機選擇背景貓咪
    const backgroundCats = [
      { normal: 'cat_magic.gif', rotate: 'cat_magic_rotate.gif' },
      { normal: 'cat_mermaid_swim.gif', rotate: 'cat_mermaid_swim_rotate.gif' }
    ];
    const selectedCat = backgroundCats[Math.floor(Math.random() * backgroundCats.length)];
  
    gameContainer = document.createElement('div');
    gameContainer.id = 'bubble-game';
    gameContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1000000;
      background: linear-gradient(135deg, rgba(135, 206, 250, 0.4), rgba(173, 216, 230, 0.4));
      overflow: hidden;
    `;
  
    // 創建背景貓咪 (從螢幕左邊開始)
    const bgCat = document.createElement('img');
    bgCat.src = chrome.runtime.getURL(`assets/${selectedCat.normal}`);
    bgCat.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: -300px;
      width: 300px;
      height: 210px;
      object-fit: contain;
      z-index: 1000001;
      transition: left 6s ease-in-out;
    `;
    gameContainer.appendChild(bgCat);
  
    // 分數顯示框
    const scoreDisplay = document.createElement('div');
    scoreDisplay.textContent = `泡泡: ${score}`;
    scoreDisplay.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      font-size: 16px;
      font-weight: bold;
      color: #333;
      background: rgba(255, 255, 255, 0.9);
      padding: 6px 12px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 1000002;
    `;
    gameContainer.appendChild(scoreDisplay);
  
    // 倒計時顯示框 
    const timerDisplay = document.createElement('div');
    timerDisplay.textContent = `時間: ${timeLeft}`;
    timerDisplay.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 16px;
      font-weight: bold;
      color: #333;
      background: rgba(255, 255, 255, 0.9);
      padding: 6px 12px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 1000002;
    `;
    gameContainer.appendChild(timerDisplay);
  
    document.body.appendChild(gameContainer);
  
    // 倒計時
    const timer = setInterval(() => {
      timeLeft--;
      timerDisplay.textContent = `時間: ${timeLeft}`;
      
      if (timeLeft <= 10) {
        timerDisplay.style.background = 'rgba(255, 100, 100, 0.9)';
        timerDisplay.style.color = 'white';
      }
      
      if (timeLeft <= 0) {
        clearInterval(timer);
        endGame();
      }
    }, 1000);
  
    // 背景貓咪移動動畫
    function animateBackgroundCat() {
      if (!gameActive) return;
      
      setTimeout(() => {
        if (!gameActive) return;
        bgCat.style.left = '50px';
      }, 100);
      
      setTimeout(() => {
        if (!gameActive) return;
        bgCat.style.left = 'calc(100vw - 330px)';
      }, 3000);
      
      setTimeout(() => {
        if (!gameActive) return;
        // 切換到旋轉動畫
        bgCat.src = chrome.runtime.getURL(`assets/${selectedCat.rotate}`);
        
        setTimeout(() => {
          if (!gameActive) return;
          bgCat.style.left = '50px';
          
          setTimeout(() => {
            if (!gameActive) return;
            bgCat.src = chrome.runtime.getURL(`assets/${selectedCat.normal}`);
            
            // 4秒後重複
            setTimeout(() => {
              if (gameActive) animateBackgroundCat();
            }, 2000);
          }, 6000);
        }, 1000);
      }, 9000);
    }
  
    // 泡泡顏色組合
    const bubbleColors = [
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(135,206,250,0.6), rgba(70,130,180,0.8))',
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,182,193,0.6), rgba(255,105,180,0.8))',
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(152,251,152,0.6), rgba(0,255,127,0.8))',
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,218,185,0.6), rgba(255,165,0,0.8))',
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(221,160,221,0.6), rgba(186,85,211,0.8))',
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,255,224,0.6), rgba(255,215,0,0.8))'
    ];
  
    // 創建泡泡
    function createBubble() {
      if (!gameActive) return;
  
      const bubble = document.createElement('div');
      const randomColor = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];
      
      bubble.style.cssText = `
        position: absolute;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${randomColor};
        border: 2px solid rgba(255,255,255,0.6);
        cursor: pointer;
        animation: float 4s ease-in-out infinite;
        box-shadow: 0 0 20px rgba(255,255,255,0.3);
        z-index: 1000001;
      `;
  
      // 隨機位置
      bubble.style.left = Math.random() * (window.innerWidth - 60) + 'px';
      bubble.style.top = Math.random() * (window.innerHeight - 200) + 100 + 'px';
  
      // 點擊事件
      bubble.onclick = () => {
        if (!gameActive) return;
        
        // 播放戳破音效
        const audio = new Audio(chrome.runtime.getURL('assets/bubble_pop.mp3'));
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
        
        // 增加分數
        score++;
        scoreDisplay.textContent = `泡泡: ${score}`;
        
        // 移除泡泡
        bubble.remove();
        bubbles = bubbles.filter(b => b !== bubble);
        
        // 泡泡破掉動畫
        const pop = document.createElement('div');
        pop.textContent = '+1';
        pop.style.cssText = `
          position: absolute;
          left: ${bubble.style.left};
          top: ${bubble.style.top};
          color: #4ECDC4;
          font-size: 20px;
          font-weight: bold;
          pointer-events: none;
          animation: popText 1s ease-out forwards;
          z-index: 1000003;
        `;
        gameContainer.appendChild(pop);
        setTimeout(() => pop.remove(), 1000);
      };
  
      gameContainer.appendChild(bubble);
      bubbles.push(bubble);
  
      // 泡泡自動消失
      setTimeout(() => {
        if (bubble.parentNode && gameActive) {
          bubble.remove();
          bubbles = bubbles.filter(b => b !== bubble);
        }
      }, 4000);
    }
  
    // 動畫樣式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float {
        0%, 100% { transform: translateY(0px) scale(1); }
        50% { transform: translateY(-15px) scale(1.1); }
      }
      @keyframes popText {
        0% { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-30px) scale(1.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  
    // 開始背景動畫
    animateBackgroundCat();
  
    // 開始生成泡泡
    const bubbleInterval = setInterval(() => {
      if (gameActive && bubbles.length < 15) {
        createBubble();
      }
    }, 500);
  
    // 結束遊戲
    function endGame() {
      gameActive = false;
      clearInterval(timer);
      clearInterval(bubbleInterval);

      bubbles.forEach(bubble => {
        if (bubble.parentNode) bubble.remove();
      });

      bgCat.style.display = 'none';

      // 顯示結果框
      const result = document.createElement('div');
      result.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 20px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 1000004;
        min-width: 300px;
      `;

      let resultText = '';
      if (score >= 25) {
        resultText = '哇！你超厲害的！🥳';
      } else if (score >= 15) {
        resultText = '很棒喔！你做得很好！✨';
      } else {
        resultText = '不錯不錯！再接再厲！🙌';
      }

      // 鼓掌貓咪
      const clapCat = document.createElement('img');
      clapCat.src = chrome.runtime.getURL('assets/cat_clap.gif');
      clapCat.style.cssText = `
        width: 180px;
        height: 126px;
        object-fit: contain;
        margin-bottom: 15px;
      `;

      result.innerHTML = `
        <div style="font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px;">遊戲結束！</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 15px;">你戳破了 ${score} 個泡泡</div>
        <div style="font-size: 15px; font-weight: semibold; color: #4ECDC4; margin-bottom: 20px;">${resultText}</div>
      `;

      result.appendChild(clapCat);

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'margin-top: 20px;';

      const playAgainBtn = document.createElement('button');
      playAgainBtn.textContent = '再玩一次';
      playAgainBtn.style.cssText = `
        background: #4ECDC4;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 14px;
        margin-right: 10px;
        transition: all 0.2s ease;
      `;
      
      playAgainBtn.onmouseenter = () => {
        playAgainBtn.style.background = '#45b8b0';
        playAgainBtn.style.transform = 'translateY(-1px)';
      };
      
      playAgainBtn.onmouseleave = () => {
        playAgainBtn.style.background = '#4ECDC4';
        playAgainBtn.style.transform = 'translateY(0)';
      };
      
      playAgainBtn.onclick = () => {
        gameContainer.remove();
        style.remove();
        startBubbleGame();
      };

      const exitBtn = document.createElement('button');
      exitBtn.textContent = '結束遊戲';
      exitBtn.style.cssText = `
        background: white;
        color: #666;
        border: 2px solid #ddd;
        padding: 10px 20px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      `;
      
      exitBtn.onmouseenter = () => {
        exitBtn.style.background = '#f5f5f5';
        exitBtn.style.borderColor = '#ccc';
        exitBtn.style.transform = 'translateY(-1px)';
      };
      
      exitBtn.onmouseleave = () => {
        exitBtn.style.background = 'white';
        exitBtn.style.borderColor = '#ddd';
        exitBtn.style.transform = 'translateY(0)';
      };
      
      exitBtn.onclick = () => {
        gameContainer.remove();
        style.remove();
        
      catContainer.style.display = 'block';
      catContainer.style.right = '10px';
      catImg.src = chrome.runtime.getURL('assets/cat_awake.gif');
      removeBackButton();
      showActionMenu();
      };

      buttonContainer.appendChild(playAgainBtn);
      buttonContainer.appendChild(exitBtn);
      result.appendChild(buttonContainer);
      gameContainer.appendChild(result);
    }

    const backBtn = document.getElementById('cat-back-button');
    if (backBtn) {
      backBtn.onclick = () => {
        gameActive = false;
        clearInterval(timer);
        clearInterval(bubbleInterval);
        gameContainer.remove();
        style.remove();
        catContainer.style.display = 'block';
        catContainer.style.right = '10px';
        removeBackButton();
        showActionMenu();
      };
    }
  }
}