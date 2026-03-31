async function inject(tabId) {
  try {
    // 1. DOM 전처리: select/toggle pseudo-element 등 깨지는 요소 보완
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['precapture.js']
    });
    // 2. Figma 캡처 라이브러리 동적 로드 (Figma 서버에서 최신 버전 fetch)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (window.__figmaCaptureScriptLoaded) return;
        window.__figmaCaptureScriptLoaded = true;
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load Figma capture script'));
          document.head.appendChild(s);
        });
      }
    });
    // 3. 상태 배지 UI 표시
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
