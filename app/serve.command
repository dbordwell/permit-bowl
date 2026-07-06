#!/bin/bash
# Permit Bowl — local dev server. Double-click this file to run it (macOS).
# Leave the Terminal window open while playing; close it (or Ctrl-C) to stop.
cd "/Users/db/Code Projects/project-driving-learn" || exit 1

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "============================================"
echo "  PERMIT BOWL is serving."
echo ""
echo "  On this Mac:    http://localhost:8137/app/"
if [ -n "$IP" ]; then
  echo "  On your phone:  http://$IP:8137/app/"
  echo "  (phone must be on the same Wi-Fi as this Mac)"
fi
echo ""
echo "  Keep this window OPEN while playing."
echo "  Close it or press Ctrl-C to stop the server."
echo "============================================"
python3 -m http.server 8137 --bind 0.0.0.0
