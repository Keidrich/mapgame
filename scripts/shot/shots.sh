#!/bin/sh
# Screenshot every HTML file the walk harness wrote. The frame inside the page is 390px; the
# window is wider only because headless Chrome here refuses to go below 500.
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
for f in /tmp/claude-0/walk/*.html; do
  out="${f%.html}.png"
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size=400,880 --screenshot="$out" "file://$f" 2>/dev/null
done
ls -1 /tmp/claude-0/walk/*.png | wc -l
