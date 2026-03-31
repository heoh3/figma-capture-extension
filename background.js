// capture.js를 서비스 워커에서 fetch해서 캐시 (CSP 우회용)
let _captureScript = null;
async function getCaptureScript() {
  if (_captureScript) return _captureScript;
  const resp = await fetch('https://mcp.figma.com/mcp/html-to-design/capture.js');
  if (!resp.ok) throw new Error(`Failed to fetch capture.js: ${resp.status}`);
  _captureScript = await resp.text();
  return _captureScript;
}

async function inject(tabId) {
  try {
    // 1. DOM 전처리: select/toggle pseudo-element 등 깨지는 요소 보완
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['precapture.js']
    });
    // 2. 서비스 워커에서 fetch한 코드를 인라인으로 주입 (페이지 CSP 우회)
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
