
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

  // 스크린샷에서 요소 영역을 잘라내서 data URL 반환
  // 캔버스를 물리적 픽셀 크기로 만들어 Retina에서 선명하게 유지
  let _screenshotSize = null;
  async function getScreenshotSize(blob) {
    if (_screenshotSize) return _screenshotSize;
    const bmp = await createImageBitmap(blob);
    _screenshotSize = { w: bmp.width, h: bmp.height };
    bmp.close();
    return _screenshotSize;
  }

  async function cropToDataUrl(el) {
    if (!screenshotDataUrl) return null;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;

      const blob = await fetch(screenshotDataUrl).then(r => r.blob());
      const { w: ssW, h: ssH } = await getScreenshotSize(blob);

      // 물리적 픽셀 좌표 계산 + viewport 경계 초과 방지
      const sx = Math.max(0, Math.round(rect.left * dpr));
      const sy = Math.max(0, Math.round(rect.top * dpr));
      const sw = Math.min(Math.round(rect.width * dpr), ssW - sx);
      const sh = Math.min(Math.round(rect.height * dpr), ssH - sy);
      if (sw < 1 || sh < 1) return null;

      const bitmap = await createImageBitmap(blob, sx, sy, sw, sh);

      // 캔버스를 물리적 픽셀 크기로 → Retina에서 선명하게 렌더링
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, sw, sh);
      bitmap.close();
      return canvas.toDataURL();
    } catch {
      return null;
    }
  }

  // 요소를 스크린샷 crop img로 교체 (실패하면 fallback)
  async function replaceWithImg(el, fallbackFn) {
    const imgSrc = await cropToDataUrl(el);
    if (!imgSrc) { fallbackFn && fallbackFn(el); return; }

    const rect = el.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = [
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `display:inline-block`,
      `vertical-align:middle`,
      `border-radius:${getComputedStyle(el).borderRadius}`,
    ].join(';');

    const origDisplay = el.style.display;
    el.parentNode.insertBefore(img, el);
    el.style.display = 'none';
    restoreFns.push(() => { img.remove(); el.style.display = origDisplay; });
  }

  // fallback: <select> → 스타일 복사한 <div>
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

  // ── 1. <select> 교체 ─────────────────────────────────────────────
  for (const el of document.querySelectorAll('select')) {
    if (el.closest('#figma-capture-ui')) continue;
    await replaceWithImg(el, replaceSelectWithDiv);
  }

  // ── 2. 토글/스위치/체크박스/라디오 교체 ──────────────────────────
  const processed = new WeakSet();

  // input[type="checkbox/radio"]의 시각적 래퍼를 찾는 헬퍼
  // (실제 input은 보통 숨겨져 있고, 시각적 토글은 label이나 부모 요소에 있음)
  function findVisualTarget(input) {
    const rect = input.getBoundingClientRect();
    // input 자체가 충분히 크면 그대로 사용
    if (rect.width >= 12 && rect.height >= 12) return input;

    // for 속성으로 연결된 label
    if (input.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (label) {
          const lr = label.getBoundingClientRect();
          if (lr.width >= 12 && lr.height >= 12) return label;
        }
      } catch {}
    }

    // 부모 label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      const lr = parentLabel.getBoundingClientRect();
      if (lr.width >= 12 && lr.height >= 12) return parentLabel;
    }

    // 부모 3단계까지 탐색 (토글 래퍼 찾기)
    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const pr = parent.getBoundingClientRect();
      if (pr.width >= 12 && pr.height >= 12 && pr.width <= 200 && pr.height <= 100) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  // 2a. checkbox/radio — CSS 기반 교체 (스크린샷 방식보다 안정적)
  function replaceNativeInput(input) {
    const rect = input.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;

    const size = Math.round(Math.max(rect.width, rect.height, 14));
    const isRadio    = input.type === 'radio';
    const isChecked  = input.checked;
    const isIndet    = !isRadio && input.indeterminate;
    const active     = isChecked || isIndet;

    const box = document.createElement('div');

    if (isRadio) {
      box.style.cssText = [
        `display:inline-flex`, `align-items:center`, `justify-content:center`,
        `width:${size}px`, `height:${size}px`, `border-radius:50%`,
        `border:2px solid ${isChecked ? '#3b82f6' : '#9ca3af'}`,
        `background:white`, `box-sizing:border-box`, `flex-shrink:0`,
      ].join(';');
      if (isChecked) {
        const dot = document.createElement('div');
        const ds = Math.round(size * 0.42);
        dot.style.cssText = `width:${ds}px;height:${ds}px;border-radius:50%;background:#3b82f6;`;
        box.appendChild(dot);
      }
    } else {
      box.style.cssText = [
        `display:inline-flex`, `align-items:center`, `justify-content:center`,
        `width:${size}px`, `height:${size}px`, `border-radius:4px`,
        `border:2px solid ${active ? '#3b82f6' : '#9ca3af'}`,
        `background:${active ? '#3b82f6' : 'white'}`,
        `box-sizing:border-box`, `flex-shrink:0`,
      ].join(';');
      if (isChecked) {
        const s = Math.round(size * 0.62);
        box.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      } else if (isIndet) {
        box.innerHTML = `<svg width="${Math.round(size*0.55)}" height="2" viewBox="0 0 9 2" fill="none"><line x1="0.5" y1="1" x2="8.5" y2="1" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
      }
    }

    const origDisplay = input.style.display;
    input.parentNode.insertBefore(box, input);
    input.style.display = 'none';
    restoreFns.push(() => { box.remove(); input.style.display = origDisplay; });
    return true;
  }

  for (const input of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    if (input.closest('#figma-capture-ui')) continue;
    if (processed.has(input)) continue;

    // 직접 교체 성공하면 processed에 추가
    // 실패(hidden input)하면 시각적 래퍼 탐색
    if (replaceNativeInput(input)) {
      processed.add(input);
    } else {
      const target = findVisualTarget(input);
      if (target && !processed.has(target)) {
        processed.add(target);
        await replaceWithImg(target, null);
      }
    }
  }

  // 2b. role="switch", 토글/스위치 클래스 — 크기 필터 후 항상 교체
  //     (큰 컨테이너가 아닌 작은 UI 컴포넌트만 대상)
  for (const el of document.querySelectorAll(
    '[role="switch"], [class*="toggle"], [class*="Toggle"], [class*="switch"], [class*="Switch"], [data-state]'
  )) {
    if (el.closest('#figma-capture-ui')) continue;
    if (processed.has(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 200 || rect.height > 100) continue;
    processed.add(el);
    await replaceWithImg(el, null);
  }

  // 2c. label, slider, check — pseudo-element이 있는 경우만 교체
  for (const el of document.querySelectorAll('label, [class*="slider"], [class*="Slider"]')) {
    if (el.closest('#figma-capture-ui')) continue;
    if (processed.has(el)) continue;

    const before = getComputedStyle(el, '::before');
    const after  = getComputedStyle(el, '::after');
    const hasMeaningfulPseudo =
      (before.content && before.content !== 'none' && before.content !== 'normal') ||
      (after.content  && after.content  !== 'none' && after.content  !== 'normal');
    if (!hasMeaningfulPseudo) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 300 || rect.height > 100) continue;
    processed.add(el);
    await replaceWithImg(el, null);
  }

  // ── 복원 함수 등록 ─────────────────────────────────────────────
  window.__figmaRestorePreCapture = () => {
    restoreFns.forEach(fn => fn());
    restoreFns.length = 0;
    delete window.__figmaPreCaptureApplied;
    if (scrollInfo) {
      window.scrollTo({ top: scrollInfo.sy, left: scrollInfo.sx, behavior: 'instant' });
    }
  };
  // 안전장치: 60초 후 자동 복원 (수동 복원이 안 된 경우 대비)
  setTimeout(() => {
    if (window.__figmaPreCaptureApplied) {
      window.__figmaRestorePreCapture();
    }
  }, 60000);
  console.log('[Figma PreCapture] DOM prepared for capture');
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
