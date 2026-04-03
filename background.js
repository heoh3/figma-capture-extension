
// 페이지에서 실행될 precapture 함수 (async, screenshot 기반)
// 주의: 이 함수는 .toString()으로 직렬화되어 페이지 컨텍스트에서 실행됨.
//       외부 변수 참조 불가. 완전히 self-contained 이어야 함.
async function precaptureInPage(screenshotDataUrl, scrollInfo) {
  // 이전 precapture가 남아있으면 먼저 복원
  if (typeof window.__figmaRestorePreCapture === 'function') {
    window.__figmaRestorePreCapture();
  }

  window.__figmaPreCaptureApplied = true;
  const restoreFns = [];
  const dpr = window.devicePixelRatio || 1;

  // ── 스크린샷 이미지를 한 번만 로드해서 캐싱 ──────────────────────
  let _ssImg = null;
  function loadScreenshot() {
    if (_ssImg) return Promise.resolve(_ssImg);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { _ssImg = img; resolve(img); };
      img.onerror = reject;
      img.src = screenshotDataUrl;
    });
  }

  // ── 사전 수집한 rect로 스크린샷 크롭 ──────────────────────────────
  // ★ rect는 DOM 수정 전에 캡처해야 정확함 (수정 후 레이아웃이 달라짐)
  async function cropFromRect(rect) {
    if (!screenshotDataUrl || rect.width < 1 || rect.height < 1) return null;
    try {
      const img = await loadScreenshot();
      const ssW = img.naturalWidth, ssH = img.naturalHeight;

      const sx = Math.max(0, Math.round(rect.left  * dpr));
      const sy = Math.max(0, Math.round(rect.top   * dpr));
      const sw = Math.min(Math.round(rect.width  * dpr), ssW - sx);
      const sh = Math.min(Math.round(rect.height * dpr), ssH - sy);
      if (sw < 1 || sh < 1) return null;

      // 물리적 픽셀 크기 캔버스 → Retina 선명도 유지
      const canvas = document.createElement('canvas');
      canvas.width  = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return { dataUrl: canvas.toDataURL(), cssW: rect.width, cssH: rect.height };
    } catch (e) {
      console.warn('[Figma PreCapture] cropFromRect failed:', e);
      return null;
    }
  }

  // ── DOM 수정: 요소를 크롭 이미지로 교체 ─────────────────────────
  async function replaceWithCrop(el, preRect, fallbackFn) {
    const crop = await cropFromRect(preRect);
    if (!crop) { fallbackFn && fallbackFn(el); return; }

    const img = document.createElement('img');
    img.src = crop.dataUrl;
    img.style.cssText = [
      `width:${crop.cssW}px`,
      `height:${crop.cssH}px`,
      `display:inline-block`,
      `vertical-align:middle`,
      `border-radius:${getComputedStyle(el).borderRadius}`,
    ].join(';');

    const origDisplay = el.style.display;
    el.parentNode.insertBefore(img, el);
    el.style.display = 'none';
    restoreFns.push(() => { img.remove(); el.style.display = origDisplay; });
  }

  // ── fallback: <select> → CSS div ──────────────────────────────────
  function replaceSelectWithDiv(select) {
    const cs = getComputedStyle(select);
    const div = document.createElement('div');
    div.textContent = select.options[select.selectedIndex]?.text ?? '';
    div.style.cssText = [
      `display:inline-flex`, `align-items:center`, `box-sizing:border-box`,
      `width:${cs.width}`, `height:${cs.height}`,
      `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      `border:${cs.border}`, `border-radius:${cs.borderRadius}`,
      `background-color:${cs.backgroundColor}`, `color:${cs.color}`,
      `font-family:${cs.fontFamily}`, `font-size:${cs.fontSize}`,
      `font-weight:${cs.fontWeight}`, `line-height:${cs.lineHeight}`,
    ].join(';');
    const origDisplay = select.style.display;
    select.parentNode.insertBefore(div, select);
    select.style.display = 'none';
    restoreFns.push(() => { div.remove(); select.style.display = origDisplay; });
  }

  // ── hidden input의 시각적 래퍼 탐색 ─────────────────────────────
  function findVisualTarget(input) {
    const rect = input.getBoundingClientRect();
    if (rect.width >= 12 && rect.height >= 12) return { el: input, rect };

    if (input.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (label) {
          const lr = label.getBoundingClientRect();
          if (lr.width >= 12 && lr.height >= 12) return { el: label, rect: lr };
        }
      } catch {}
    }

    const parentLabel = input.closest('label');
    if (parentLabel) {
      const lr = parentLabel.getBoundingClientRect();
      if (lr.width >= 12 && lr.height >= 12) return { el: parentLabel, rect: lr };
    }

    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const pr = parent.getBoundingClientRect();
      if (pr.width >= 12 && pr.height >= 12 && pr.width <= 200 && pr.height <= 100) {
        return { el: parent, rect: pr };
      }
      parent = parent.parentElement;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 1: DOM 수정 전에 모든 요소의 rect를 미리 수집
  //          (수정 후 레이아웃이 달라지면 좌표가 어긋나는 버그 방지)
  // ════════════════════════════════════════════════════════════════
  const tasks = [];   // { el, rect, fallback }
  const seen  = new WeakSet();

  // 1. <select>
  for (const el of document.querySelectorAll('select')) {
    if (el.closest('#figma-capture-ui') || seen.has(el)) continue;
    seen.add(el);
    tasks.push({ el, rect: el.getBoundingClientRect(), fallback: replaceSelectWithDiv });
  }

  // 2a. checkbox / radio
  for (const input of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    if (input.closest('#figma-capture-ui') || seen.has(input)) continue;
    const rect = input.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      seen.add(input);
      tasks.push({ el: input, rect, fallback: null });  // 뷰포트 밖이면 crop null → 교체 안 됨 (native 유지)
    } else {
      const found = findVisualTarget(input);
      if (found && !seen.has(found.el)) {
        seen.add(found.el);
        tasks.push({ el: found.el, rect: found.rect, fallback: null });
      }
    }
  }

  // 2b. role="switch", 토글/스위치 클래스
  for (const el of document.querySelectorAll(
    '[role="switch"], [class*="toggle"], [class*="Toggle"], [class*="switch"], [class*="Switch"], [data-state]'
  )) {
    if (el.closest('#figma-capture-ui') || seen.has(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 200 || rect.height > 100) continue;
    seen.add(el);
    tasks.push({ el, rect, fallback: null });
  }

  // 2c. label / slider — pseudo-element이 있는 경우만
  for (const el of document.querySelectorAll('label, [class*="slider"], [class*="Slider"]')) {
    if (el.closest('#figma-capture-ui') || seen.has(el)) continue;
    const before = getComputedStyle(el, '::before');
    const after  = getComputedStyle(el, '::after');
    const hasPseudo =
      (before.content && before.content !== 'none' && before.content !== 'normal') ||
      (after.content  && after.content  !== 'none' && after.content  !== 'normal');
    if (!hasPseudo) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 300 || rect.height > 100) continue;
    seen.add(el);
    tasks.push({ el, rect, fallback: null });
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 2: 수집한 rect를 사용해 DOM 수정 (스크린샷 좌표와 항상 일치)
  // ════════════════════════════════════════════════════════════════
  for (const { el, rect, fallback } of tasks) {
    await replaceWithCrop(el, rect, fallback ? () => fallback(el) : null);
  }

  // ── 복원 함수 등록 ───────────────────────────────────────────────
  window.__figmaRestorePreCapture = () => {
    restoreFns.forEach(fn => fn());
    restoreFns.length = 0;
    delete window.__figmaPreCaptureApplied;
    if (scrollInfo) {
      window.scrollTo({ top: scrollInfo.sy, left: scrollInfo.sx, behavior: 'instant' });
    }
  };
  setTimeout(() => {
    if (window.__figmaPreCaptureApplied) window.__figmaRestorePreCapture();
  }, 60000);

  console.log(`[Figma PreCapture] ${tasks.length}개 요소 처리 완료`);
}

// ── 헬퍼: 페이지 준비 (폰트 로드 + 스크롤 최상단) ───────────────
async function preparePage(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      await document.fonts.ready;
      const sx = window.scrollX, sy = window.scrollY;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 120));
      return { sx, sy };
    }
  }).then(r => r[0]?.result ?? { sx: 0, sy: 0 });
}

// ── 헬퍼: 스크린샷 촬영 ─────────────────────────────────────────
async function takeScreenshot() {
  try {
    return await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  } catch (e) {
    console.warn('[Figma Capture] Screenshot failed (will use CSS fallback):', e);
    return null;
  }
}

// ── 수동 캡처 플로우 (precapture → capture → restore) ────────────
async function performCapture(tabId) {
  // 1. 페이지 준비 + 스크린샷
  const scrollInfo = await preparePage(tabId);
  const screenshot = await takeScreenshot();

  // 2. DOM 전처리
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: precaptureInPage,
    args: [screenshot, scrollInfo]
  });

  // 3. captureForDesign 실행 후 DOM 복원
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      try {
        if (typeof window.figma?.captureForDesign === 'function') {
          await window.figma.captureForDesign({ selector: 'body' });
        }
      } finally {
        if (typeof window.__figmaRestorePreCapture === 'function') {
          window.__figmaRestorePreCapture();
        }
      }
    }
  });
}

// ── 초기 주입 ────────────────────────────────────────────────────
async function inject(tabId, autoTrigger = false) {
  try {
    // 1. 페이지 준비 + 스크린샷 + DOM 전처리 (capture.js 주입 전에 완료해야 함)
    const scrollInfo = await preparePage(tabId);
    const screenshot = await takeScreenshot();

    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: precaptureInPage,
      args: [screenshot, scrollInfo]
    });

    // 2. Figma 캡처 라이브러리 주입 (CSP 우회를 위해 files 사용)
    //    autoTrigger: capture.js가 #figmacapture= 감지하여 자동 실행
    //    manual: 아래에서 직접 captureForDesign 호출
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['capture.js']
    });

    // 3. 수동 트리거 (아이콘 클릭)인 경우 즉시 캡처 실행 후 복원
    if (!autoTrigger) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async () => {
          try {
            if (typeof window.figma?.captureForDesign === 'function') {
              await window.figma.captureForDesign({ selector: 'body' });
            }
          } finally {
            if (typeof window.__figmaRestorePreCapture === 'function') {
              window.__figmaRestorePreCapture();
            }
          }
        }
      });
    }

    // 4. 상태 배지 UI (ISOLATED world — chrome.runtime 접근 가능)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['capture-ui.js']
    });

    console.log('[Figma Capture] Injected successfully');
  } catch (e) {
    console.error('[Figma Capture] Injection failed:', e);
  }
}

// ── UI 버튼에서 수동 재캡처 요청 수신 ───────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'capture' && sender.tab) {
    performCapture(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        console.error('[Figma Capture] Manual capture failed:', e);
        sendResponse({ ok: false });
      });
    return true; // async response
  }
});

// Manual: click extension icon (모든 http/https 페이지에서 동작)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.url.startsWith('http')) return;
  await inject(tab.id, false);
});

// Auto: when Claude Code opens a page with capture params
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!details.url || !details.url.includes('figmacapture=')) return;

  await new Promise(r => setTimeout(r, 1000));
  await inject(details.tabId, true);
}, {
  url: [
    { hostEquals: 'localhost' },
    { hostEquals: '127.0.0.1' },
    { hostEquals: '0.0.0.0' }
  ]
});
