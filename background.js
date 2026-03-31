// capture.js를 서비스 워커에서 fetch해서 캐시 (페이지 CSP 우회)
let _captureScript = null;
async function getCaptureScript() {
  if (_captureScript) return _captureScript;
  const resp = await fetch('https://mcp.figma.com/mcp/html-to-design/capture.js');
  if (!resp.ok) throw new Error(`Failed to fetch capture.js: ${resp.status}`);
  _captureScript = await resp.text();
  return _captureScript;
}

// 페이지에서 실행될 precapture 함수 (async, screenshot 기반)
// 주의: 이 함수는 .toString()으로 직렬화되어 페이지 컨텍스트에서 실행됨.
//       외부 변수 참조 불가. 완전히 self-contained 이어야 함.
async function precaptureInPage(screenshotDataUrl) {
  if (window.__figmaPreCaptureApplied) return;
  window.__figmaPreCaptureApplied = true;

  const restoreFns = [];
  const dpr = window.devicePixelRatio || 1;

  // 스크린샷에서 요소 영역을 잘라내서 data URL 반환
  async function cropToDataUrl(el) {
    if (!screenshotDataUrl) return null;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;

      const blob = await fetch(screenshotDataUrl).then(r => r.blob());
      const bitmap = await createImageBitmap(
        blob,
        Math.round(rect.left * dpr),
        Math.round(rect.top * dpr),
        Math.round(rect.width * dpr),
        Math.round(rect.height * dpr)
      );

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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

  // ── 2. CSS pseudo-element 기반 토글/스위치 교체 ──────────────────
  // ::before 또는 ::after 에 content가 있는 요소만 대상
  const candidates = document.querySelectorAll([
    'input[type="checkbox"]',
    'input[type="radio"]',
    'label',
    '[role="switch"]',
    '[class*="toggle"]',
    '[class*="switch"]',
    '[class*="slider"]',
    '[class*="check"]',
  ].join(','));

  for (const el of candidates) {
    if (el.closest('#figma-capture-ui')) continue;

    const before = getComputedStyle(el, '::before');
    const after  = getComputedStyle(el, '::after');
    const hasMeaningfulPseudo =
      (before.content && before.content !== 'none' && before.content !== 'normal') ||
      (after.content  && after.content  !== 'none' && after.content  !== 'normal');

    if (!hasMeaningfulPseudo) continue;
    await replaceWithImg(el, null);
  }

  // ── 복원 ────────────────────────────────────────────────────────
  window.__figmaRestorePreCapture = () => {
    restoreFns.forEach(fn => fn());
    restoreFns.length = 0;
    delete window.__figmaPreCaptureApplied;
  };
  setTimeout(window.__figmaRestorePreCapture, 15000);
  console.log('[Figma PreCapture] DOM prepared for capture');
}

async function inject(tabId) {
  try {
    // 1. DOM 수정 전에 스크린샷 찍기
    let screenshot = null;
    try {
      screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    } catch (e) {
      console.warn('[Figma Capture] Screenshot failed (will use CSS fallback):', e);
    }

    // 2. 스크린샷 기반 DOM 전처리 (select/toggle 교체)
    //    async func → Chrome이 Promise 완료까지 대기
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: precaptureInPage,
      args: [screenshot]
    });

    // 3. Figma 캡처 라이브러리 주입 (서비스 워커에서 fetch → 인라인 주입)
    const captureCode = await getCaptureScript();
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (code) => {
        if (window.__figmaCaptureScriptLoaded) return;
        window.__figmaCaptureScriptLoaded = true;
        const s = document.createElement('script');
        s.textContent = code;
        document.head.appendChild(s);
      },
      args: [captureCode]
    });

    // 4. 상태 배지 UI
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['capture-ui.js']
    });

    console.log('[Figma Capture] Injected successfully');
  } catch (e) {
    console.error('[Figma Capture] Injection failed:', e);
  }
}

// Manual: click extension icon
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return;
  try {
    const u = new URL(tab.url);
    if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)) return;
  } catch { return; }
  await inject(tab.id);
});

// Auto: when Claude Code opens a page with capture params
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!details.url || !details.url.includes('figmacapture=')) return;

  await new Promise(r => setTimeout(r, 1000));
  await inject(details.tabId);
}, {
  url: [
    { hostEquals: 'localhost' },
    { hostEquals: '127.0.0.1' },
    { hostEquals: '0.0.0.0' }
  ]
});
