/**
 * precapture.js
 * capture.js (Figma) 실행 전에 주입되어 캡처가 깨지는 요소를 보완합니다.
 *
 * 처리 항목:
 *   1. <select> → 선택된 값을 보여주는 <div>로 교체
 *   2. ::before / ::after pseudo-element → 실제 <span> DOM으로 물질화
 *
 * 캡처 완료 후 자동으로 원본 DOM을 복원합니다 (15초 타임아웃).
 */
(() => {
  if (window.__figmaPreCaptureApplied) return;
  window.__figmaPreCaptureApplied = true;

  const restoreFns = [];

  // ── 1. <select> 교체 ──────────────────────────────────────────────
  document.querySelectorAll('select').forEach(select => {
    if (select.closest('#figma-capture-ui')) return;

    const cs = getComputedStyle(select);
    const selectedText = select.options[select.selectedIndex]?.text ?? '';

    const proxy = document.createElement('div');
    proxy.textContent = selectedText;
    proxy.style.cssText = `
      display: inline-flex;
      align-items: center;
      box-sizing: border-box;
      width: ${cs.width};
      height: ${cs.height};
      padding: ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft};
      border: ${cs.border};
      border-radius: ${cs.borderRadius};
      background-color: ${cs.backgroundColor};
      color: ${cs.color};
      font-family: ${cs.fontFamily};
      font-size: ${cs.fontSize};
      font-weight: ${cs.fontWeight};
      line-height: ${cs.lineHeight};
    `.trim();

    const origDisplay = select.style.display;
    select.parentNode.insertBefore(proxy, select);
    select.style.display = 'none';

    restoreFns.push(() => {
      proxy.remove();
      select.style.display = origDisplay;
    });
  });

  // ── 2. Pseudo-element 물질화 ──────────────────────────────────────
  // ::before / ::after 를 숨길 스타일 태그 (data 속성으로 대상 한정)
  const hideStyle = document.createElement('style');
  hideStyle.textContent = `
    [data-fc-pseudo-host]::before,
    [data-fc-pseudo-host]::after { display: none !important; }
  `;
  document.head.appendChild(hideStyle);
  restoreFns.push(() => hideStyle.remove());

  const VISUAL_PROPS = [
    'display', 'position', 'content',
    'top', 'left', 'right', 'bottom',
    'width', 'height', 'minWidth', 'minHeight',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'background', 'backgroundColor', 'backgroundImage',
    'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderRadius',
    'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'boxShadow', 'opacity', 'zIndex',
    'transform', 'transformOrigin',
    'color', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
    'flex', 'flexShrink', 'flexGrow', 'alignSelf',
    'cursor', 'pointerEvents', 'overflow',
    'verticalAlign',
  ];

  function buildPseudoSpan(el, pseudoName) {
    const ps = getComputedStyle(el, pseudoName);
    const content = ps.content;

    // content 없으면 시각적으로 의미 없음
    if (!content || content === 'none' || content === 'normal') return null;

    const span = document.createElement('span');
    span.setAttribute('data-fc-pseudo', pseudoName === '::before' ? 'before' : 'after');

    for (const prop of VISUAL_PROPS) {
      try {
        const val = ps[prop];
        if (val && val !== '' && val !== 'auto' && val !== 'normal') {
          span.style[prop] = val;
        }
      } catch (_) {}
    }

    // CSS content 텍스트 추출 ("text" → text)
    const text = content.replace(/^["']|["']$/g, '');
    if (text && text !== 'none' && text !== 'normal') {
      span.textContent = text;
    }

    return span;
  }

  // toggle, switch, checkbox, radio, label 등 pseudo-element 사용이 흔한 요소 대상
  const SELECTOR = [
    'label',
    'input[type="checkbox"]',
    'input[type="radio"]',
    '[class*="toggle"]',
    '[class*="switch"]',
    '[class*="check"]',
    '[class*="radio"]',
    '[class*="slider"]',
    '[class*="thumb"]',
  ].join(', ');

  document.querySelectorAll(SELECTOR).forEach(el => {
    if (el.closest('#figma-capture-ui')) return;

    const beforeSpan = buildPseudoSpan(el, '::before');
    const afterSpan  = buildPseudoSpan(el, '::after');

    if (!beforeSpan && !afterSpan) return;

    // pseudo-element를 CSS로 숨기고 실제 span으로 대체
    el.setAttribute('data-fc-pseudo-host', '');

    if (beforeSpan) el.insertBefore(beforeSpan, el.firstChild);
    if (afterSpan)  el.appendChild(afterSpan);

    // input 요소는 자식을 가질 수 없으므로 부모에 삽입
    if (el.tagName === 'INPUT') {
      if (beforeSpan) el.parentNode.insertBefore(beforeSpan, el);
      if (afterSpan)  el.parentNode.insertBefore(afterSpan, el.nextSibling);
    }

    restoreFns.push(() => {
      el.removeAttribute('data-fc-pseudo-host');
      beforeSpan?.remove();
      afterSpan?.remove();
    });
  });

  // ── 복원 ────────────────────────────────────────────────────────────
  window.__figmaRestorePreCapture = () => {
    restoreFns.forEach(fn => fn());
    restoreFns.length = 0;
    delete window.__figmaPreCaptureApplied;
  };

  // 캡처 완료를 감지할 수 없으므로 15초 후 자동 복원
  setTimeout(window.__figmaRestorePreCapture, 15000);

  console.log('[Figma PreCapture] DOM prepared for capture');
})();
