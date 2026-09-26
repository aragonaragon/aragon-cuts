#!/usr/bin/env bash
# Build self-contained FFmpeg sidecars for the active macOS architecture.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="$repo_root/src-tauri/binaries"
mkdir -p "$bin_dir"

case "$(uname -m)" in
  arm64) target="aarch64-apple-darwin" ;;
  x86_64) target="x86_64-apple-darwin" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ -x "$bin_dir/ffmpeg-$target" && -x "$bin_dir/ffprobe-$target" ]]; then
  echo "FFmpeg sidecars already exist for $target"
  exit 0
fi

for package in freetype harfbuzz fribidi nasm pkg-config; do
  brew list --versions "$package" >/dev/null 2>&1 || brew install "$package"
done

export PKG_CONFIG_PATH="$(brew --prefix x264)/lib/pkgconfig:$(brew --prefix freetype)/lib/pkgconfig:$(brew --prefix harfbuzz)/lib/pkgconfig:$(brew --prefix fribidi)/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
build_root="$(mktemp -d)"
trap 'rm -rf "$build_root"' EXIT

# Pin the FFmpeg source to a tagged upstream release. Its Homebrew libraries
# are bundled into the app separately before the DMG is created.
git clone --depth 1 --branch n8.1.2 https://git.ffmpeg.org/ffmpeg.git "$build_root/ffmpeg"
cd "$build_root/ffmpeg"
./configure \
  --prefix="$build_root/install" \
  --arch="$(uname -m)" \
  --cc=clang \
  --disable-debug \
  --disable-doc \
  --disable-shared \
  --enable-static \
  --enable-libfreetype \
  --enable-libharfbuzz \
  --enable-libfribidi \
  --enable-videotoolbox \
  --pkg-config-flags=--static

make -j"$(sysctl -n hw.ncpu)"
make install

install -m 755 "$build_root/install/bin/ffmpeg" "$bin_dir/ffmpeg-$target"
install -m 755 "$build_root/install/bin/ffprobe" "$bin_dir/ffprobe-$target"

filters="$("$bin_dir/ffmpeg-$target" -hide_banner -filters 2>&1)"
encoders="$("$bin_dir/ffmpeg-$target" -hide_banner -encoders 2>&1)"
grep -Fq drawtext <<< "$filters"
grep -Fq h264_videotoolbox <<< "$encoders"

echo "FFmpeg and ffprobe sidecars ready for $target"
