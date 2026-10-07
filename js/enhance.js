/* js/enhance.js
   动效增强：数字滚动 + 主题切换
   不修改任何业务逻辑
*/
(function () {
  'use strict';

  /* ---------------------------------------------------
     1. 数字滚动动画
     只作用于 .stat-num 元素，且每个元素仅执行一次
     --------------------------------------------------- */
  function animateNumber(el, target) {
    const duration = 1200;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      // easeOutCubic：起步快、收尾慢，数字滚动更自然
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * target);
      el.textContent = value;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = target;
      }
    }
    requestAnimationFrame(tick);
  }

  function runNumberAnimations(root) {
    const nums = root.querySelectorAll('.stat-num:not([data-animated])');
    nums.forEach((el, index) => {
      el.dataset.animated = '1';
      const target = parseInt(el.textContent.trim(), 10) || 0;
      el.textContent = '0';
      // 每张卡片之间错开 90ms
      setTimeout(() => animateNumber(el, target), index * 90);
    });
  }

  const appEl = document.getElementById('app');
  if (appEl) {
    const observer = new MutationObserver(() => runNumberAnimations(appEl));
    observer.observe(appEl, { childList: true, subtree: true });
    runNumberAnimations(appEl);
  }

  /* ---------------------------------------------------
     2. 主题切换（暗色 / 浅色）
     状态保存在 localStorage，键名独立于业务数据
     --------------------------------------------------- */
  const THEME_KEY = 'word_app_theme';
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 动态注入悬浮按钮（避免修改 index.html）
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'theme-toggle';
  toggleBtn.setAttribute('aria-label', '切换深色 / 浅色主题');
  toggleBtn.innerHTML = '<span class="theme-icon"></span>';
  document.body.appendChild(toggleBtn);

  const iconEl = toggleBtn.querySelector('.theme-icon');

  function refreshIcon() {
    const current = document.documentElement.getAttribute('data-theme');
    iconEl.innerHTML = (window.ICON && current === 'dark') ? ICON.moon : (window.ICON ? ICON.sun : '☀');
  }
  refreshIcon();

  toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    refreshIcon();
  });
})();