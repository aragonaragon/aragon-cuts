#!/usr/bin/env bash
# Vendor FFmpeg's Homebrew-linked libraries into a Tauri .app before DMG bundling.
set -euo pipefail

target="${1:?Usage: bundle-ffmpeg-macos.sh <target-triple>}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bundle_dir="$repo_root/src-tauri/target/$target/release/bundle/macos"
app="$(find "$bundle_dir" -maxdepth 1 -type d -name '*.app' -print -quit)"

if [[ -z "$app" ]]; then
  echo "Could not find the built macOS app in $bundle_dir" >&2
  exit 1
fi

brew list --versions dylibbundler >/dev/null 2>&1 || brew install dylibbundler
frameworks="$app/Contents/Frameworks"
mkdir -p "$frameworks"

find_sidecar() {
  local name="$1"
  find "$app/Contents" -type f \( -name "$name-$target" -o -name "$name" \) -print -quit
}

ffmpeg="$(find_sidecar ffmpeg)"
ffprobe="$(find_sidecar ffprobe)"
if [[ -z "$ffmpeg" || -z "$ffprobe" ]]; then
  echo "Could not locate the bundled FFmpeg sidecars in $app" >&2
  exit 1
fi

sidecar_dir="$(dirname "$ffmpeg")"
frameworks_relative="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$frameworks" "$sidecar_dir")"
runtime_prefix="@executable_path/$frameworks_relative/"

dylibbundler -cd -of -b -x "$ffmpeg" -d "$frameworks" -p "$runtime_prefix"
dylibbundler -cd -of -b -x "$ffprobe" -d "$frameworks" -p "$runtime_prefix"

for binary in "$ffmpeg" "$ffprobe" "$frameworks"/*.dylib; do
  [[ -f "$binary" ]] || continue
  dependencies="$(otool -L "$binary")"
  if grep -E '/(opt/homebrew|usr/local/(opt|Cellar))/' <<< "$dependencies"; then
    echo "Unbundled Homebrew dependency remains in $binary" >&2
    exit 1
  fi
done

# Re-sign the edited app and nested sidecars with the ad-hoc identity.
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

# Exercise the actual app-bundled tools so missing runtime libraries are caught
# before the release DMG is made.
"$ffmpeg" -hide_banner -loglevel error \
  -f lavfi -i color=c=black:s=320x240:d=1 \
  -vf "drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf':text='Aragon Cuts':fontsize=18:x=10:y=10:text_shaping=1" \
  -c:v h264_videotoolbox -allow_sw 1 -b:v 12M -pix_fmt yuv420p \
  -y "$RUNNER_TEMP/bundled-smoke.mp4"
"$ffprobe" -v error -select_streams v:0 -show_entries stream=codec_name \
  -of default=noprint_wrappers=1:nokey=1 "$RUNNER_TEMP/bundled-smoke.mp4" | grep -qx h264

echo "Bundled FFmpeg dependencies and smoke-tested $target app"
