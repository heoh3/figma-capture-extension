# Figma Capture

어떤 웹 페이지든 Figma로 캡처하는 Chrome 확장 프로그램입니다.  
단독으로 사용하거나 **Figma MCP + Claude Code** 와 연동해 자동 캡처도 가능합니다.

## 기능

- 모든 `http/https` 페이지를 원클릭으로 Figma에 캡처
- Claude Code가 `#figmacapture=...` 파라미터로 페이지를 열면 자동 캡처
- 캡처 전 DOM 전처리로 깨지는 요소 보완:
  - `<select>` (OS 네이티브 렌더링이 캡처 시 깨짐)
  - `::before` / `::after` 기반 토글/스위치 컴포넌트
- 페이지 우하단에 "지금 캡처하기" 버튼이 있는 플로팅 배지 UI

## 설치

1. 레포 클론
   ```bash
   git clone https://github.com/heoh3/figma-capture-extension
   cd figma-capture-extension
   ```

2. Figma 캡처 라이브러리 다운로드 (레포에 미포함)
   ```bash
   bash download-capture.sh
   ```

3. `chrome://extensions` 열기

4. 우측 상단 **개발자 모드** 활성화

5. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 클론한 폴더 선택

## 사용법

### 수동 캡처
페이지에서 확장 아이콘을 클릭하면 Figma로 캡처됩니다.

### 자동 캡처 (Claude Code + Figma MCP 연동)
Claude Code가 캡처를 트리거하면 `#figmacapture=...` 파라미터가 포함된 URL을 자동으로 엽니다.  
확장 프로그램이 이를 감지해 자동으로 실행됩니다 — 클릭 불필요.

## 동작 방식

```
[아이콘 클릭  또는  #figmacapture= URL 감지]
                    ↓
        최상단 스크롤 + 폰트 로드 대기
                    ↓
          현재 뷰포트 스크린샷 촬영
                    ↓
      깨지는 요소를 스크린샷 크롭 이미지로 교체
      (select, toggle, switch, checkbox 등)
                    ↓
       capture.js 주입  →  Figma로 전송
                    ↓
          플로팅 배지 UI 표시
```

## 파일 구조

| 파일 | 설명 |
|------|------|
| `manifest.json` | 확장 프로그램 매니페스트 (MV3) |
| `background.js` | 서비스 워커 — 트리거 감지, 스크린샷, DOM 전처리, 주입 |
| `capture-ui.js` | 페이지에 주입되는 플로팅 배지 UI |
| `capture.js` | Figma 캡처 라이브러리 — **레포 미포함**, `download-capture.sh` 실행 필요 |
| `download-capture.sh` | `capture.js` 다운로드 스크립트 |
| `generate-icons.html` | 확장 아이콘 재생성 유틸리티 |

## 요구 사항

- Chrome 또는 Chromium 기반 브라우저
- Figma 계정

**선택 사항** — 자동 캡처 워크플로 사용 시:
- Claude Code에 연결된 [Figma MCP](https://help.figma.com/hc/en-us/articles/32132100433559)
