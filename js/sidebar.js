/* =====================================================
   js/sidebar.js
   侧边导航鼠标倾斜跟随效果
   - 每个导航项独立监听，互不干扰
   - requestAnimationFrame 节流，避免高频重排
   - 触屏设备 / 减少动画偏好自动跳过
   - 不改动导航跳转逻辑
   ===================================================== */
(function () {
  'use strict';

  const MAX_TILT = 6;         // 最大倾斜角度（度），柔和
  const TILT_AXIS_X = 0.7;    // X 轴倾斜系数（Y 方向），略小于 Y 轴

  function isTouchDevice() {
    return window.matchMedia('(hover: none)').matches ||
           'ontouchstart' in window;
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function initSidebarTilt() {
    // 触屏 / 减少动画：不做倾斜
    if (isTouchDevice() || prefersReducedMotion()) return;

    const nav = document.getElementById('mainNav');
    if (!nav) return;

    const items = nav.querySelectorAll('a');

    items.forEach(item => {
      let rafId = null;

      function applyTilt(clientX, clientY) {
        const rect = item.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;

        // 归一化到 [-1, 1]
        const nx = (x - cx) / cx;
        const ny = (y - cy) / cy;

        // 鼠标靠右 → 右倾；鼠标靠上 → 上仰
        const rotateY = nx * MAX_TILT;
        const rotateX = -ny * MAX_TILT * TILT_AXIS_X;

        item.style.transform =
          `perspective(620px) ` +
          `rotateX(${rotateX.toFixed(2)}deg) ` +
          `rotateY(${rotateY.toFixed(2)}deg) ` +
          `translateY(-2px) scale(1.02)`;
      }

      function onMouseMove(e) {
        if (rafId) return;
        const x = e.clientX;
        const y = e.clientY;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          applyTilt(x, y);
        });
      }

      function onMouseLeave() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        // 清空内联 transform，让 CSS 的过渡平滑复位
        item.style.transform = '';
      }

      item.addEventListener('mousemove', onMouseMove, { passive: true });
      item.addEventListener('mouseleave', onMouseLeave, { passive: true });
    });
  }

  // 等 app.js 渲染完导航高亮后再初始化（因为高亮会影响布局宽度）
  function bootstrap() {
    initSidebarTilt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // hash 变化后不影响导航本身，无需重绑
  console.log('[Sidebar] loaded');
})();