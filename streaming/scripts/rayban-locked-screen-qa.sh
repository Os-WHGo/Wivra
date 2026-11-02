#!/usr/bin/env bash
# Wivra Ray-Ban locked-screen QA. Counts only; never copies private media.
set -euo pipefail
ADB="${ADB:-adb}"
PACKAGE="com.oswhgo.wivra"
DURATION="${1:-180}"
case "$DURATION" in *[!0-9]*|"") echo "Usage: $0 [seconds 60..1800]" >&2; exit 2 ;; esac
if (( DURATION < 60 || DURATION > 1800 )); then echo "Duration out of range" >&2; exit 2; fi
command -v "$ADB" >/dev/null || { echo "adb missing" >&2; exit 1; }
count=$("$ADB" devices | awk 'NR>1 && $2=="device"{n++} END{print n+0}')
if [[ "$count" != "1" ]]; then echo "Connect exactly one authorized Android phone" >&2; exit 1; fi
"$ADB" shell pm path "$PACKAGE" >/dev/null 2>&1 || { echo "Wivra not installed" >&2; exit 1; }
"$ADB" shell run-as "$PACKAGE" pwd >/dev/null 2>&1 || { echo "Debug build required" >&2; exit 1; }
parts() {
  "$ADB" shell run-as "$PACKAGE" ls files/wivra_pending_videos 2>/dev/null |
    tr -d "\r" | grep -Ec "^wivra_rayban_.*\.mp4$" || true
}
before="$(parts)"
echo "Record in Wivra while visible, then lock phone manually. Test ${DURATION}s."
echo "Only aggregate finalized MP4 counts and foreground-service presence are shown."
elapsed=0
while (( elapsed < DURATION )); do
  sleep 15
  elapsed=$((elapsed+15))
  current="$(parts)"
  if "$ADB" shell dumpsys activity services "$PACKAGE" 2>/dev/null | grep -q WivraCaptureForegroundService; then
    state=present
  else
    state=not-observed
  fi
  echo "elapsed=${elapsed}s count=${current} service=${state}"
done
after="$(parts)"
echo "baseline=${before} final=${after}"
if (( after <= before )); then echo "No new completed MP4 checkpoint verified" >&2; exit 1; fi
echo "Checkpoint creation observed. This does NOT verify HEVC playback or audio."
echo "Stop and save in Wivra; review all parts and the Director import separately."
