# Third-party software notices

Shorts Maker bundles and links to the following third-party software. Each
component remains under its own license; this notice is provided for
attribution and compliance.

## FFmpeg

The Windows installers ship with `ffmpeg.exe` and `ffprobe.exe` from the
**Gyan.dev FFmpeg "release essentials" build**.

- Project: https://ffmpeg.org/
- Build source: https://www.gyan.dev/ffmpeg/builds/
- License: **GNU General Public License v3 (GPLv3)** — the essentials build
  includes GPL-licensed components such as libx264 and libx265.
- Full license text: https://www.gnu.org/licenses/gpl-3.0.html

Because the distributed installers contain GPL-licensed binaries, the
combined work is effectively distributed under the terms of the GPL. The
complete corresponding source code is available in this repository and at
the official FFmpeg project. FFmpeg developers and Gyan.dev are not
affiliated with this project.

## Tauri

- Project: https://tauri.app/
- License: MIT OR Apache-2.0
- Copyright (c) 2017–present Tauri Programme within The Commons Conservancy

## React

- Project: https://react.dev/
- License: MIT
- Copyright (c) Meta Platforms, Inc. and affiliates

## TailwindCSS

- Project: https://tailwindcss.com/
- License: MIT
- Copyright (c) Tailwind Labs, Inc.

## Lucide

- Project: https://lucide.dev/
- License: ISC

## Other dependencies

This project also depends on Zustand (MIT), Zod (MIT), Vite (MIT), Vitest
(MIT), and TypeScript (Apache-2.0). See `package.json` and
`src-tauri/Cargo.toml` for the complete dependency lists; each package
retains its original license.
