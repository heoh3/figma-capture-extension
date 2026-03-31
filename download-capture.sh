#!/bin/bash
# Downloads the Figma capture library (not included in repo)
curl -s -o capture.js https://mcp.figma.com/mcp/html-to-design/capture.js \
  && echo "✓ capture.js downloaded" \
  || echo "✗ Download failed"
