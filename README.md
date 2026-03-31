# Figma Capture

어떤 웹 페이지든 Figma로 캡처하는 Chrome 확장 프로그램입니다.  
단독으로 사용하거나 **Figma MCP + Claude Code** 와 연동해 자동 캡처도 가능합니다.

## 사전 준비

시작하기 전에 아래 항목을 확인하세요.

### 필수

| 항목 | 설명 |
|------|------|
| **Chrome** (또는 Chromium 기반 브라우저) | 확장 프로그램 실행 환경 |
| **Figma 계정** | 브라우저에서 [figma.com](https://figma.com)에 로그인된 상태여야 합니다 |
| **Git** | 레포 클론용 (`git clone`) |
| **curl** | `capture.js` 다운로드용 (macOS/Linux 기본 설치, Windows는 Git Bash 사용) |

### 선택 (자동 캡처 워크플로)

자동 캡처는 Claude Code가 로컬 개발 서버 URL을 열고 자동으로 Figma 캡처를 트리거하는 기능입니다.

| 항목 | 설명 |
|------|------|
| **Claude Code** | [claude.ai/download](https://claude.ai/download) 에서 설치 |
| **Figma MCP** | Claude Code에 Figma MCP 서버 연결 필요 — [Figma MCP 설정 가이드](https://help.figma.com/hc/en-us/articles/32132100433559) |

## 설치

### 1. 레포 클론

```bash
git clone https://github.com/heoh3/figma-capture-extension
cd figma-capture-extension
```

### 2. Figma 캡처 라이브러리 다운로드

`capture.js`는 Figma의 HTML-to-Design 라이브러리로, 저작권 문제로 레포에 포함되어 있지 않습니다.  
아래 스크립트를 실행하면 Figma 서버에서 자동으로 다운로드됩니다.

```bash
bash download-capture.sh
```

> **확인**: 실행 후 폴더에 `capture.js` 파일이 생성되었는지 확인하세요.

### 3. Chrome에 확장 프로그램 로드

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 클론한 `figma-capture-extension` 폴더 선택
5. 확장 프로그램 목록에 **Figma Capture for Localhost** 가 나타나면 완료

> **팁**: 확장 아이콘을 고정하면 편리합니다 — 확장 프로그램 퍼즐 아이콘(🧩) 클릭 → 핀 고정

## 사용법

### 수동 캡처

1. 캡처할 웹 페이지로 이동 (모든 `http/https` 페이지 지원)
2. 브라우저에서 **Figma에 로그인**되어 있는지 확인
3. 확장 아이콘 클릭
4. Figma로 자동 전송됩니다

### 재캡처 (플로팅 배지)

첫 캡처 후 페이지 우하단에 보라색 **Figma Capture** 배지가 나타납니다.  
배지를 클릭하면 패널이 열리고, **지금 캡처하기** 버튼으로 다시 캡처할 수 있습니다.

### 자동 캡처 (Claude Code + Figma MCP)

> 사전 준비의 **선택** 항목이 설정되어 있어야 합니다.

Claude Code에서 캡처를 트리거하면 `#figmacapture=...` 파라미터가 포함된 URL이 자동으로 열립니다.  
확장 프로그램이 이를 감지해 자동으로 캡처합니다 — 클릭 불필요.

## 기능

- 모든 `http/https` 페이지를 원클릭으로 Figma에 캡처
- Claude Code가 로컬 서버 페이지를 열면 자동 캡처
- 캡처 전 DOM 전처리로 깨지는 요소를 스크린샷 이미지로 교체:
  - `<select>` (OS 네이티브 렌더링이 캡처 시 깨짐)
  - `input[type="checkbox"]`, `input[type="radio"]` (숨겨진 input + 시각적 래퍼 자동 탐색)
  - `role="switch"`, 토글/스위치 클래스 기반 컴포넌트
  - `::before` / `::after` 기반 슬라이더/스위치
- 페이지 우하단 플로팅 배지로 재캡처 가능

## 동작 방식

```
[아이콘 클릭  또는  #figmacapture= URL 감지]
                    ↓
        최상단 스크롤 + 폰트 로드 대기
                    ↓
          현재 뷰포트 스크린샷 촬영
                    ↓
      깨지는 요소를 스크린샷 크롭 이미지로 교체
      (select, toggle, switch, checkbox, radio 등)
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

## 문제 해결

### capture.js 다운로드 실패

```bash
# 직접 다운로드 시도
curl -o capture.js https://mcp.figma.com/mcp/html-to-design/capture.js
```

네트워크 문제인 경우 브라우저에서 위 URL을 직접 열어 파일을 저장할 수도 있습니다.

### 확장 아이콘 클릭해도 반응 없음

- `chrome://extensions`에서 확장 프로그램이 활성화되어 있는지 확인
- 캡처 대상 페이지가 `http://` 또는 `https://`로 시작하는지 확인 (`chrome://`, `file://` 등은 지원 불가)
- `capture.js` 파일이 폴더에 존재하는지 확인

### Figma로 전송되지 않음

- 브라우저에서 [figma.com](https://figma.com)에 로그인되어 있는지 확인
- Figma 파일이 하나 이상 열려 있어야 전송 대상이 됩니다
