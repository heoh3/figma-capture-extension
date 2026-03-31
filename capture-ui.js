(() => {
  if (document.getElementById('figma-capture-ui')) return;

  const container = document.createElement('div');
  container.id = 'figma-capture-ui';
  container.innerHTML = `
    <style>
      #figma-capture-ui {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #figma-capture-ui .fc-badge {
        background: #A259FF;
        color: white;
        padding: 10px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 16px rgba(162, 89, 255, 0.3);
        transition: all 0.2s;
        user-select: none;
      }
      #figma-capture-ui .fc-badge:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(162, 89, 255, 0.4);
      }
      #figma-capture-ui .fc-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #1BC47D;
        animation: fc-pulse 2s infinite;
        flex-shrink: 0;
      }
      @keyframes fc-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      #figma-capture-ui .fc-panel {
        display: none;
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        width: 240px;
        font-size: 13px;
        color: #333;
      }
      #figma-capture-ui .fc-panel.open { display: block; }
      #figma-capture-ui .fc-panel h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 700;
        color: #A259FF;
      }
      #figma-capture-ui .fc-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        font-size: 12px;
        color: #555;
      }
      #figma-capture-ui .fc-row .fc-check {
        color: #1BC47D;
        font-size: 14px;
      }
      #figma-capture-ui .fc-btn {
        width: 100%;
        margin-top: 4px;
        padding: 9px 0;
        background: #A259FF;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      #figma-capture-ui .fc-btn:hover { background: #8f45e8; }
      #figma-capture-ui .fc-btn:disabled {
        background: #ccc;
        cursor: default;
      }
    </style>
    <div class="fc-panel" id="fc-panel">
      <h3>Figma Capture</h3>
      <div class="fc-row">
        <span class="fc-check">✓</span>
        <span>Select/toggle 보정 적용됨</span>
      </div>
      <div class="fc-row">
        <span class="fc-check">✓</span>
        <span>Claude Code 자동 캡처 대기 중</span>
      </div>
      <button class="fc-btn" id="fc-capture-btn">지금 캡처하기</button>
    </div>
    <div class="fc-badge" id="fc-badge">
      <div class="fc-dot"></div>
      Figma Capture
    </div>
  `;

  document.body.appendChild(container);

  const badge   = document.getElementById('fc-badge');
  const panel   = document.getElementById('fc-panel');
  const captureBtn = document.getElementById('fc-capture-btn');

  // 패널 토글
  badge.addEventListener('click', () => panel.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!container.contains(e.target)) panel.classList.remove('open');
  });

  // 직접 캡처 버튼 — window.figma.captureForDesign 는 capture.js가 노출
  captureBtn.addEventListener('click', () => {
    if (typeof window.figma?.captureForDesign === 'function') {
      captureBtn.disabled = true;
      captureBtn.textContent = '캡처 중...';
      window.figma.captureForDesign({ selector: 'body' })
        .finally(() => {
          captureBtn.disabled = false;
          captureBtn.textContent = '지금 캡처하기';
        });
    } else {
      captureBtn.textContent = 'Capture API 없음';
      setTimeout(() => { captureBtn.textContent = '지금 캡처하기'; }, 2000);
    }
  });
})();
