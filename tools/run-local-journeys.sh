#!/usr/bin/env bash
# Wivra · run the editor journeys locally like .github/workflows/wivra-whisper-wasm.yml. — Claude
# Requires: tools/setup-native-toolchain.sh (pinned Playwright 1.56.1 + media lab),
# ffmpeg, espeak-ng (installed with apt if missing) and network access to
# raw.githubusercontent.com (whisper.cpp jfk.wav) and huggingface.co (the editor
# downloads the pinned whisper model itself, after consent, as on a phone).
# Linux Chromium only: NOT evidence for Android/iPhone WebViews.
# Usage: tools/run-local-journeys.sh [--with-long]   (--with-long adds journey D, ~15 min)
set -euo pipefail
T="${WIVRA_TOOLCHAIN:-$HOME/wivra-toolchain}"
# shellcheck disable=SC1091
source "$T/env.sh"
root=$(cd "$(dirname "$0")/.." && pwd)
F="$T/wv-fx"; mkdir -p "$F"
command -v espeak-ng >/dev/null || apt-get install -y -qq --no-install-recommends espeak-ng >/dev/null
ES='Hola, bienvenidos a Wivra. Hoy grabamos un video corto en la montaña con mis amigos.'
[ -s "$F/en.wav" ] || curl -sfL -o "$F/en.wav" https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav
if [ ! -s "$F/flow.webm" ]; then
  espeak-ng -v es -s 135 -w "$F/es-raw.wav" "$ES"
  ffmpeg -nostdin -loglevel error -y -i "$F/es-raw.wav" -ar 16000 -ac 1 -c:a pcm_s16le "$F/es-tight.wav"
  ffmpeg -nostdin -loglevel error -y -i "$F/es-tight.wav" -af "adelay=500,apad=pad_dur=0.5" -ar 16000 -ac 1 -c:a pcm_s16le "$F/es.wav"
  ffmpeg -nostdin -loglevel error -y -f lavfi -i color=c=0x221133:size=180x320:rate=10 -i "$F/es.wav" -shortest \
    -c:v libvpx -b:v 60k -deadline realtime -c:a libopus -b:a 48k "$F/flow.webm"
fi
cd "$root"
node app/build.mjs >/dev/null
node tools/browser-whisper-subtitles.cjs "$F/flow.webm" video/webm base es "montaña"
node tools/browser-journey-a.cjs "$F/flow.webm" video/webm base es
if [ "${1:-}" = "--with-long" ]; then
  if [ ! -s "$F/long-grey.webm" ]; then
    ffmpeg -nostdin -loglevel error -y -i "$F/en.wav" -i "$F/es.wav" \
      -filter_complex "[0:a]aresample=16000,adelay=60000[a];[1:a]aresample=16000,adelay=630000[b];[a][b]amix=inputs=2:normalize=0,apad=whole_dur=660" \
      -ar 16000 -ac 1 -c:a pcm_s16le "$F/long.wav"
    ffmpeg -nostdin -loglevel error -y -f lavfi -i color=c=0x707070:size=160x284:rate=2 -i "$F/long.wav" -shortest \
      -c:v libvpx -b:v 20k -deadline realtime -c:a libopus -b:a 24k "$F/long-grey.webm"
  fi
  node tools/browser-journey-d.cjs "$F/long-grey.webm" video/webm "$F/long.wav" tiny es "montaña@631"
fi
rm -f wivra-*.json
echo "Local journeys finished (Linux Chromium; not phone evidence)."
