# Releases

Ready-to-distribute Szeptucha installers.

## Version 1.1.1

| System        | File                                    | Notes           |
| ------------- | --------------------------------------- | --------------- |
| Windows (x64) | `windows/szeptucha_1.1.1_x64-setup.exe` | NSIS installer. |

### What changed in this build

- **Dependency refresh.** All known JavaScript vulnerabilities cleared (25 → 0) and Rust crates updated; the frontend toolchain moved to Vite 8, ESLint 10 and typescript-eslint 8.64.
- **Internationalisation fix.** Two hardcoded strings in the download progress bar now go through i18next in every supported language.

No user-facing feature changes since 1.1.0.

> macOS 1.1.1 build still to be produced on a macOS machine.

## Version 1.1.0

| System        | File                                    | Notes           |
| ------------- | --------------------------------------- | --------------- |
| Windows (x64) | `windows/szeptucha_1.1.0_x64-setup.exe` | NSIS installer. |

### What changed in this build

- **Live preview** — shows the transcription while you are still speaking (optional, off by default; Settings → Advanced → "Live preview").
- **Edit before paste** — a window to review and correct the text before it is inserted (optional, off by default).

> macOS 1.1.0 build still to be produced on a macOS machine.

## Version 1.0.0

| System                | File                                    | Notes                                       |
| --------------------- | --------------------------------------- | ------------------------------------------- |
| macOS (Apple Silicon) | `macos/Szeptucha_1.0.0_aarch64.dmg`     | aarch64 only. Ad-hoc signed, not notarised. |
| Windows (x64)         | `windows/szeptucha_1.0.0_x64-setup.exe` | NSIS installer.                             |

### What changed in this build (macOS)

- **Live preview** — shows the transcription while you are still speaking (optional, off by default; Settings → Advanced → "Live preview").
- **Edit before paste** — a window to review and correct the text before it is inserted (optional, off by default).

> The Windows installer (`windows/…`) comes from an earlier build and does **not** include these features.

### macOS notes

- The build targets **Apple Silicon** (aarch64) only. A universal (Intel) build is blocked because ONNX Runtime (`ort-sys`, required for VAD and the Parakeet models) ships no prebuilt binaries for `x86_64-apple-darwin`.
- Apple Intelligence (native post-processing) is only available on Apple Silicon running macOS 26 or later.
- The installer is ad-hoc signed (`signingIdentity: "-"`) and **not notarised** — on first launch Gatekeeper may require manual approval (right-click → Open, or Settings → Privacy & Security).

### Reproducing the builds

```bash
# macOS (Apple Silicon)
bun run tauri build

# Windows (x64) — on a Windows machine
bun run tauri build
```
