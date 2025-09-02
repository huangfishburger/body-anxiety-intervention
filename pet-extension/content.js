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

      #cat-eat-menu::after, #cat-eat-message::after{
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
      message.textContent = '來一起吃點東西吧！'; // 修改訊息
      menu.appendChild(message);
    
      const actions = [
        { label: '陪我一起吃', handler: handleEat },
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
        
        const menus = ['cat-eat-menu', 'cat-eat-message'];
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
  
}