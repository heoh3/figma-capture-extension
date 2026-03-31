# Figma Capture

A Chrome extension that captures any web page into Figma.  
Works standalone or with **Figma MCP + Claude Code** for automated capture.

## Features

- One-click capture of any `http/https` page into Figma
- Auto-capture when Claude Code opens a page with `#figmacapture=...` params
- Pre-processes DOM before capture to fix common rendering issues:
  - `<select>` elements (native OS rendering breaks capture)
  - CSS toggle/switch components using `::before` / `::after`
- Floating badge UI with a manual "Capture Now" button

## Installation

1. Clone this repo
   ```bash
   git clone https://github.com/heoh3/figma-capture-extension
   cd figma-capture-extension
   ```

2. Download the Figma capture library (not included in repo)
   ```bash
   bash download-capture.sh
   ```

3. Open `chrome://extensions`

4. Enable **Developer mode** (top right toggle)

5. Click **Load unpacked** → select the cloned folder

## Usage

### Manual capture
Click the extension icon on any page to capture it into Figma.

### Auto-capture (Claude Code + Figma MCP)
When Claude Code triggers a capture, it opens a URL with `#figmacapture=...` params.  
The extension detects this and runs automatically — no click needed.

## How it works

```
[Icon click  or  #figmacapture= URL]
              ↓
    Scroll to top + wait for fonts
              ↓
    Screenshot current viewport
              ↓
    Replace broken elements with screenshot crops
    (select, toggle, switch, checkbox...)
              ↓
    Inject capture.js  →  sends to Figma
              ↓
    Show floating badge UI
```

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker — triggers, screenshot, DOM prep, injection |
| `capture-ui.js` | Floating badge UI injected into the page |
| `capture.js` | Figma capture library — **not in repo**, run `download-capture.sh` |
| `download-capture.sh` | Downloads `capture.js` from Figma |
| `generate-icons.html` | Utility to regenerate extension icons |

## Requirements

- Chrome or any Chromium-based browser
- Figma account

**Optional** — for auto-capture workflow:
- [Figma MCP](https://help.figma.com/hc/en-us/articles/32132100433559) connected to Claude Code
