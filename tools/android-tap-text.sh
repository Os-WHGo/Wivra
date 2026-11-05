#!/usr/bin/env bash
# W81 (Claude): CI emulator helper. Taps the first on-screen element whose
# text or content-description equals $1 (like a person would). No app data
# is read or written. Usage: tools/android-tap-text.sh "Español"
set -u
label="$1"
adb shell uiautomator dump /sdcard/wivra-ui.xml >/dev/null 2>&1 || true
xml=$(adb exec-out cat /sdcard/wivra-ui.xml 2>/dev/null || true)
point=$(printf '%s' "$xml" | python3 -c '
import re, sys
label = sys.argv[1]
xml = sys.stdin.read()
for node in re.findall(r"<node [^>]*>", xml):
    t = re.search(r"\btext=\"([^\"]*)\"", node); d = re.search(r"content-desc=\"([^\"]*)\"", node)
    if (t and t.group(1).strip() == label) or (d and d.group(1).strip() == label):
        b = re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", node)
        if b:
            x1, y1, x2, y2 = map(int, b.groups()); print((x1 + x2) // 2, (y1 + y2) // 2); break
' "$label")
if [ -n "$point" ]; then adb shell input tap $point; echo "tapped $label at $point"; else echo "not found: $label"; fi
