#!/usr/bin/env bash
# Run the Android-independent LIVE policies with the real Kotlin compiler and JUnit. — Codex
# No Android stubs, downloads, Gradle, emulator, network or GitHub Actions.
set -euo pipefail
: "${KOTLINC:?Set KOTLINC to the Kotlin 2.2.20 compiler executable}"
: "${JUNIT_JAR:?Set JUNIT_JAR to junit-4.13.2.jar}"
: "${HAMCREST_JAR:?Set HAMCREST_JAR to hamcrest-core-1.3.jar}"
: "${JSON_JAR:?Set JSON_JAR to json-20240303.jar}"
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
task_tmp=$(mktemp -d)
trap 'rm -rf "$task_tmp"' EXIT
base=streaming/android/app/src
sources=()
classes=()
for name in WivraLiveEndpoint WivraLiveReconnect WivraLiveScenes WivraLiveSourceActions WivraScreenScene WivraPcmMix; do
  if [[ "$name" != WivraLiveSourceActions ]]; then
    sources+=("$base/full/java/com/oswhgo/wivra/$name.kt")
  fi
  sources+=("$base/testFull/java/com/oswhgo/wivra/${name}Test.kt")
  classes+=("com.oswhgo.wivra.${name}Test")
done
for name in WivraMulticamPolicy WivraLiveNetwork WivraRayBanSync WivraScreenRecordPlan WivraVerifiedCopy WivraVideoPtsNormalizer WivraWebmSeekable WivraProgressiveExportSession; do
  sources+=("$base/main/java/com/oswhgo/wivra/$name.kt" "$base/test/java/com/oswhgo/wivra/${name}Test.kt")
  classes+=("com.oswhgo.wivra.${name}Test")
done
"$KOTLINC" "${sources[@]}" -jvm-target 17 -cp "$JUNIT_JAR:$HAMCREST_JAR:$JSON_JAR" -include-runtime -d "$task_tmp/tests.jar"
java -cp "$task_tmp/tests.jar:$JUNIT_JAR:$HAMCREST_JAR:$JSON_JAR" org.junit.runner.JUnitCore "${classes[@]}"
