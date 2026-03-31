# Figma Capture for Localhost

A Chrome extension that captures localhost web pages into Figma. Works with **Figma MCP + Claude Code**.

## Features

- One-click capture of localhost pages into Figma
- Auto-capture when Claude Code opens a page with capture params
- Pre-processes DOM before capture to fix common rendering issues:
  - `<select>` elements → replaced with styled divs (native OS rendering breaks capture)
  - CSS `::before` / `::after` pseudo-elements → materialized as real DOM nodes (toggles, switches, checkboxes)
- Floating badge UI with a manual "Capture Now" button

## Installation

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder

## Usage

### Manual capture
Click the extension icon on any `localhost` page.

### Auto-capture (Claude Code + Figma MCP)
When Claude Code triggers a capture, it opens a URL with `#figmacapture=...` params.
The extension detects this and runs automatically — no click needed.

## How it works

```
[Icon click or #figmacapture URL]
        ↓
  precapture.js     ← fixes select/toggle rendering
        ↓
  capture.js        ← Figma's capture library (loaded from mcp.figma.com)
        ↓
  capture-ui.js     ← floating badge UI
```

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker — detects triggers, orchestrates injection |
| `precapture.js` | DOM pre-processor — fixes elements that break during capture |
| `capture-ui.js` | Floating badge UI injected into the page |
| `generate-icons.html` | Utility to regenerate extension icons |

## Requirements

- Chrome (or Chromium-based browser)
- [Figma MCP](https://help.figma.com/hc/en-us/articles/32132100433559) connected to Claude Code
