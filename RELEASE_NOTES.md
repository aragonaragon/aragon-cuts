## Aragon Cuts 0.3.0

### macOS support

- Native DMG installers for Apple Silicon and Intel Macs.
- Bundled FFmpeg is built for the matching Mac architecture, its dependent libraries are included in the app, and a real video encode is smoke-tested before packaging.
- Mac uses Apple's VideoToolbox for hardware H.264 encoding. NVIDIA NVENC remains available on supported Windows PCs, with software fallback on other Windows systems.
- macOS 11 or newer is required.

### First launch

These direct-download builds are ad-hoc signed and are not notarized by Apple. On first launch, macOS may ask you to confirm the app in Privacy & Security. If macOS blocks it, Control-click Aragon Cuts in Applications, choose Open, then confirm Open.

### Downloads

- Aragon.Cuts_0.3.0_aarch64.dmg — Apple Silicon (M1 and newer)
- Aragon.Cuts_0.3.0_x64.dmg — Intel Macs
- Aragon.Cuts_0.3.0_x64-setup.exe and Aragon.Cuts_0.3.0_x64_en-US.msi — Windows
