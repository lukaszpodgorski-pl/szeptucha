# Szeptucha

**A local-first, privacy-focused speech-to-text app. Press a shortcut, speak, and your words appear in any text field — entirely on your own device.**

The name comes from the Polish *szeptucha* — a folk wise-woman who heals by whispering. Fitting for a tool that turns your whisper into text without it ever leaving your machine.

## How it works

1. **Press** a configurable keyboard shortcut to start/stop recording (or use push-to-talk).
2. **Speak** while the shortcut is active.
3. **Release** — Szeptucha transcribes locally and pastes the text into whatever app you're using.

The whole pipeline runs on-device:

- Silence is filtered with Silero VAD (Voice Activity Detection).
- Transcription uses your choice of local models:
  - **Parakeet V3** — fast, with automatic language detection.
  - **Whisper Large** — highest quality, GPU-accelerated when available.
- Works on Windows, macOS, and Linux.

## Privacy

- **Transcription is 100% local.** Your audio and transcripts never leave the device.
- **No telemetry, no auto-update, no phone-home.**
- **Optional text post-processing is local-only.** It speaks to an OpenAI-compatible
  endpoint you control (Ollama, LM Studio, vLLM, llama.cpp). There are no cloud
  providers configured — set the base URL in Settings → Post-processing.

## Models

Models are fetched once, on first run, from a self-hosted endpoint. The source is the
single constant `MODEL_BASE_URL` in
[`src-tauri/src/managers/model.rs`](src-tauri/src/managers/model.rs) (default
`https://www.aitomate.pl/models`). Host the curated files there under the same
filenames:

| Model | File |
| --- | --- |
| Parakeet V3 | `parakeet-v3-int8.tar.bin` |
| Whisper Large | `ggml-large-v3-q5_0.bin` |

The Silero VAD model ships with the repo (`src-tauri/resources/models/`), so no
download is required for it.

## Quick start

**Prerequisites:** [Rust](https://rustup.rs/) (stable), [Bun](https://bun.sh/). On
Windows you also need **MSVC C++ Build Tools**, **LLVM/libclang** (for `whisper-rs`),
and the **Vulkan SDK** (GPU acceleration). Full platform setup is in [BUILD.md](BUILD.md).

```bash
bun install
bun run tauri dev      # run in development
bun run tauri build    # production build
```

## CLI parameters

Szeptucha accepts command-line flags on all platforms (handy for scripts, window
managers, and autostart):

```bash
szeptucha --toggle-transcription   # toggle recording on a running instance
szeptucha --toggle-post-process    # toggle recording with post-processing
szeptucha --cancel                 # cancel the current operation
szeptucha --start-hidden           # launch without the main window
szeptucha --no-tray                # launch without the tray icon
szeptucha --debug                  # verbose (trace) logging
szeptucha --help                   # list all flags
```

## Architecture

A [Tauri 2](https://tauri.app) app:

- **Frontend:** React + TypeScript + Tailwind CSS (settings & onboarding UI).
- **Backend:** Rust for system integration, audio, and ML inference.
- **Core libraries:** `whisper-rs` (Whisper), `transcribe-rs` (Parakeet), `cpal`
  (audio I/O), `vad-rs` (VAD), `rdev` (global shortcuts), `rubato` (resampling).

## Credits

Szeptucha is built on a fork of [**Handy**](https://handy.computer)
([github.com/cjpais/Handy](https://github.com/cjpais/Handy)) by CJ Pais, released
under the MIT License. Huge thanks to the Handy project and to the upstream
libraries it builds on (whisper.cpp, Silero, Parakeet/transcribe-rs).

Maintained by **Łukasz Podgórski**.

## License

MIT — see [LICENSE](LICENSE). The original Handy copyright is retained as required.
