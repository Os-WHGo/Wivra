#!/usr/bin/env bash
# Wivra · local native/browser toolchain for compile-only checks. — Claude
# Installs, OUTSIDE the repository, into ${WIVRA_TOOLCHAIN:-$HOME/wivra-toolchain}:
#   - Android SDK cmdline-tools + platforms;android-36 + build-tools;35.0.0 + platform-tools
#   - OpenJDK 17 (apt, as CI pins Java 17) if missing
#   - Swift 6.2.1 for Ubuntu 24.04, PGP-verified against swift.org keys
#   - Playwright 1.56.1 Chromium (CI pin) and a media lab with Mediabunny 1.61.6 (SRI-checked)
# Idempotent: existing pieces are kept. Never builds APK/IPA or dispatches GitHub Actions.
# Needs network access to dl.google.com, download.swift.org, swift.org, registry.npmjs.org
# and the Playwright CDN. Then:  source "$WIVRA_TOOLCHAIN/env.sh"
set -euo pipefail
T="${WIVRA_TOOLCHAIN:-$HOME/wivra-toolchain}"
mkdir -p "$T"
cd "$T"

# Android SDK (compileSdk 36; CI installs the same two packages).
if [ ! -x android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  curl -sfL -o cmdline.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  mkdir -p android-sdk/cmdline-tools
  unzip -q -o cmdline.zip -d android-sdk/cmdline-tools
  mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest
  rm -f cmdline.zip
fi
if [ ! -d android-sdk/platforms/android-36 ] || [ ! -d android-sdk/build-tools/35.0.0 ]; then
  (yes | android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$T/android-sdk" --licenses >/dev/null 2>&1) || true
  android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$T/android-sdk" \
    'platforms;android-36' 'build-tools;35.0.0' 'platform-tools' >/dev/null
fi

# JDK 17: with JDK 21 alone Gradle fails on a Java 17 / Kotlin 21 target mismatch.
if [ ! -d /usr/lib/jvm/java-17-openjdk-amd64 ]; then
  apt-get install -y -qq openjdk-17-jdk-headless >/dev/null
fi

# Swift 6.2.1 (Foundation-only smokes; AVFoundation/WebKit still need macOS).
if [ ! -x swift/usr/bin/swiftc ]; then
  base=https://download.swift.org/swift-6.2.1-release/ubuntu2404/swift-6.2.1-RELEASE/swift-6.2.1-RELEASE-ubuntu24.04.tar.gz
  curl -sfL -o swift.tar.gz "$base"
  curl -sfL -o swift.tar.gz.sig "$base.sig"
  curl -sfL -o swift-keys.asc https://www.swift.org/keys/all-keys.asc
  export GNUPGHOME="$T/gnupg"; mkdir -p -m 700 "$GNUPGHOME"
  gpg -q --import swift-keys.asc
  gpg --verify swift.tar.gz.sig swift.tar.gz
  mkdir -p swift
  tar -xzf swift.tar.gz -C swift --strip-components=1
  rm -f swift.tar.gz
fi

# Playwright 1.56.1 + Chromium, and the media lab used by tools/*.cjs.
if [ ! -d pw-1.56.1/node_modules/playwright ]; then
  mkdir -p pw-1.56.1
  (cd pw-1.56.1 && npm init -y >/dev/null && npm install --no-save --ignore-scripts playwright@1.56.1 >/dev/null)
fi
if ! ls pw-1.56.1/browsers/chromium_headless_shell-* >/dev/null 2>&1; then
  PLAYWRIGHT_BROWSERS_PATH="$T/pw-1.56.1/browsers" node pw-1.56.1/node_modules/playwright/cli.js install chromium >/dev/null
fi
if [ ! -f media-lab-ci/node_modules/mediabunny/package.json ]; then
  curl -sfL -o mediabunny-1.61.6.tgz https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.6.tgz
  test "$(openssl dgst -sha512 -binary mediabunny-1.61.6.tgz | base64 -w0)" = \
    'VHEZ53/7jGl4dQ+uOdndsZufFYwEUFWv9UXgvrGun3OapyzoqI9iaPOD7z3xxY/nAttLZBNwswgJzMtGJAquOQ=='
  mkdir -p mediabunny-pkg media-lab-ci/node_modules
  tar -xzf mediabunny-1.61.6.tgz -C mediabunny-pkg
  rm -f mediabunny-1.61.6.tgz
  ln -sfn "$T/mediabunny-pkg/package" media-lab-ci/node_modules/mediabunny
fi
mkdir -p media-lab-ci/node_modules
ln -sfn "$T/pw-1.56.1/node_modules/playwright" media-lab-ci/node_modules/playwright
ln -sfn "$T/pw-1.56.1/node_modules/playwright-core" media-lab-ci/node_modules/playwright-core

cat > env.sh <<EOF
export ANDROID_HOME="$T/android-sdk"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH="$T/swift/usr/bin:\$PATH"
export WIVRA_MEDIA_LAB="$T/media-lab-ci"
export PLAYWRIGHT_BROWSERS_PATH="$T/pw-1.56.1/browsers"
EOF
echo "Wivra toolchain ready in $T. Run: source $T/env.sh"
echo "Android compile-only (as CI): gradle -p streaming/android :app:compileFullDebugKotlin :app:compileCaptureDebugKotlin :app:testFullDebugUnitTest"
