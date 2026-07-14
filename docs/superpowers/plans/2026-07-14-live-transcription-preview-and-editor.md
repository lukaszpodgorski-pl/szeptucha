# Live Transcription Preview + Pre-Paste Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional live "progressive" transcription preview shown in the recording overlay while the user is still speaking, plus an optional editable review window that lets the user fix obvious mistakes before the text is pasted.

**Architecture:** The audio pipeline stays batch (no `transcribe-rs` fork). We expose a non-destructive **snapshot** of the growing audio buffer from the recorder, and a background loop re-transcribes the snapshot every ~1.5s while recording, emitting a `transcription-partial` event that the overlay renders. Independently, when "edit before paste" is on, `stop()` opens a focusable editor window pre-filled with the final text instead of pasting directly; on confirm, a `paste_text` command restores focus to the previous app and pastes.

**Tech Stack:** Rust (Tauri 2.x, cpal, transcribe-rs 0.3.8), React/TypeScript, tauri-specta bindings, Zustand settings store, i18next.

## Global Constraints

- All user-facing strings MUST use i18next (`t('key')`); ESLint forbids hardcoded JSX strings. Add keys to `src/i18n/locales/en/translation.json`.
- New Tauri commands MUST have `#[tauri::command]` + `#[specta::specta]` and be registered in `collect_commands![...]` in `src-tauri/src/lib.rs`.
- New settings fields MUST use `#[serde(default = "default_fn")]` and be added to the `Default` impl / defaults in `src-tauri/src/settings.rs`. The settings type is `AppSettings`; helpers are `settings::get_settings(&app) -> AppSettings` and `settings::write_settings(&app, settings)`.
- Both features default **OFF** so existing UX is unchanged.
- `TranscriptionManager::transcribe()` holds an exclusive engine mutex — transcriptions are serialized. The preview loop MUST be single-flight and MUST stop before/at `stop()`.
- Run `bun run lint` and `cargo fmt` / `cargo clippy` before each commit. Build with `CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri build` on macOS if cmake errors.
- Regenerate specta bindings by running the app once (`bun run tauri dev`) after adding commands; `src/bindings.ts` is auto-generated — do not hand-edit.

---

## File Structure

**Feature A — Live preview**
- `src-tauri/src/audio_toolkit/audio/recorder.rs` (modify) — add `Cmd::Snapshot` + `AudioRecorder::snapshot()`.
- `src-tauri/src/managers/audio.rs` (modify) — add `AudioRecordingManager::snapshot_recording()`.
- `src-tauri/src/settings.rs` (modify) — add `live_preview: bool` + `edit_before_paste: bool`.
- `src-tauri/src/shortcut/mod.rs` (modify) — add `change_live_preview_setting`, `change_edit_before_paste_setting`.
- `src-tauri/src/overlay.rs` (modify) — add `emit_partial_transcription()` + `set_overlay_size()` + expanded-size constants.
- `src-tauri/src/actions.rs` (modify) — spawn preview loop in `start()`, stop it in `stop()`; branch to editor in `stop()`.
- `src/overlay/RecordingOverlay.tsx` (modify) — listen for `transcription-partial`, render text.
- `src/overlay/RecordingOverlay.css` (modify) — styles for preview text + expanded layout.

**Feature B — Editor window**
- `src/editor/index.html`, `src/editor/main.tsx`, `src/editor/TranscriptionEditor.tsx`, `src/editor/TranscriptionEditor.css` (create) — editor UI.
- `vite.config.ts` (modify) — add `editor` rollup input.
- `src-tauri/src/overlay.rs` OR new `src-tauri/src/editor.rs` (create) — editor window lifecycle.
- `src-tauri/src/commands/mod.rs` (modify) — `paste_text`, `cancel_transcription_editor` commands.
- `src-tauri/src/lib.rs` (modify) — register editor window creation + new commands.
- `src/i18n/locales/en/translation.json` (modify) — new keys.
- Settings UI component under `src/components/settings/` (modify) — two toggles.

---

## Task 1: Recorder snapshot command

**Files:**
- Modify: `src-tauri/src/audio_toolkit/audio/recorder.rs` (enum `Cmd` ~line 22, `run_consumer` command match ~line 468, `impl AudioRecorder` ~line 205)

**Interfaces:**
- Produces: `AudioRecorder::snapshot(&self) -> Result<Vec<f32>, Box<dyn std::error::Error>>` — returns a clone of the currently accumulated (VAD-filtered, 16kHz mono) samples without stopping recording. Returns an empty vec if not recording.

- [ ] **Step 1: Add the `Snapshot` variant to `Cmd`**

In `recorder.rs`, change the `Cmd` enum (currently lines 22-26):

```rust
enum Cmd {
    Start,
    Stop(mpsc::Sender<Vec<f32>>),
    Snapshot(mpsc::Sender<Vec<f32>>),
    Shutdown,
}
```

- [ ] **Step 2: Handle `Snapshot` in `run_consumer`**

In the `while let Ok(cmd) = cmd_rx.try_recv()` match inside `run_consumer` (after the `Cmd::Stop` arm, before `Cmd::Shutdown`), add:

```rust
Cmd::Snapshot(reply_tx) => {
    // Non-destructive: clone the buffer so recording continues uninterrupted.
    let _ = reply_tx.send(processed_samples.clone());
}
```

- [ ] **Step 3: Add the `snapshot()` method on `AudioRecorder`**

After the `stop()` method (ends ~line 211), add:

```rust
pub fn snapshot(&self) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    let (resp_tx, resp_rx) = mpsc::channel();
    if let Some(tx) = &self.cmd_tx {
        tx.send(Cmd::Snapshot(resp_tx))?;
        // The consumer only services commands after receiving an audio chunk;
        // during recording chunks arrive every few ms, so this returns promptly.
        // Bound the wait so a stalled stream can't hang the preview loop.
        return Ok(resp_rx.recv_timeout(std::time::Duration::from_millis(500))?);
    }
    Ok(Vec::new())
}
```

Add `use std::sync::mpsc::RecvTimeoutError;` is NOT needed — `recv_timeout` error boxes via `?` into `Box<dyn Error>` because `RecvTimeoutError: Error`.

- [ ] **Step 4: Build to verify it compiles**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles (warnings about unused `snapshot` are acceptable until Task 2 wires it).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio_toolkit/audio/recorder.rs
git commit -m "feat(audio): non-destructive snapshot of recording buffer"
```

---

## Task 2: Manager snapshot wrapper

**Files:**
- Modify: `src-tauri/src/managers/audio.rs` (after `stop_recording`, ~line 484)

**Interfaces:**
- Consumes: `AudioRecorder::snapshot()` (Task 1).
- Produces: `AudioRecordingManager::snapshot_recording(&self) -> Option<Vec<f32>>` — `Some(samples)` while recording, `None` otherwise.

- [ ] **Step 1: Add `snapshot_recording()`**

After `stop_recording` (ends ~line 484) and before `is_recording`, add:

```rust
/// Returns a clone of the current recording buffer without stopping.
/// Used by the live-preview loop. `None` if not recording.
pub fn snapshot_recording(&self) -> Option<Vec<f32>> {
    if !matches!(
        *self.state.lock().unwrap(),
        RecordingState::Recording { .. }
    ) {
        return None;
    }
    match self.recorder.lock().unwrap().as_ref() {
        Some(rec) => rec.snapshot().ok(),
        None => None,
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/managers/audio.rs
git commit -m "feat(audio): expose snapshot_recording on manager"
```

---

## Task 3: Settings fields + toggle commands

**Files:**
- Modify: `src-tauri/src/settings.rs` (struct `AppSettings` fields ~line 339+, defaults section, `Default` impl)
- Modify: `src-tauri/src/shortcut/mod.rs` (near `change_show_tray_icon_setting` ~line 1057)
- Modify: `src-tauri/src/lib.rs` (`collect_commands!` ~line 307)

**Interfaces:**
- Produces: `AppSettings.live_preview: bool`, `AppSettings.edit_before_paste: bool`; commands `change_live_preview_setting(app, enabled)`, `change_edit_before_paste_setting(app, enabled)`.

- [ ] **Step 1: Add default fns + struct fields**

In `settings.rs`, add near the other `default_*` fns:

```rust
fn default_live_preview() -> bool {
    false
}
fn default_edit_before_paste() -> bool {
    false
}
```

Add to the `AppSettings` struct (alongside other `#[serde(default = ...)]` fields):

```rust
    #[serde(default = "default_live_preview")]
    pub live_preview: bool,
    #[serde(default = "default_edit_before_paste")]
    pub edit_before_paste: bool,
```

- [ ] **Step 2: Add to the `Default` impl**

In the `impl Default for AppSettings` block, add:

```rust
            live_preview: default_live_preview(),
            edit_before_paste: default_edit_before_paste(),
```

- [ ] **Step 3: Add the toggle commands**

In `src-tauri/src/shortcut/mod.rs`, following the `change_show_tray_icon_setting` pattern:

```rust
#[tauri::command]
#[specta::specta]
pub fn change_live_preview_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.live_preview = enabled;
    settings::write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_edit_before_paste_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.edit_before_paste = enabled;
    settings::write_settings(&app, settings);
    Ok(())
}
```

- [ ] **Step 4: Register commands**

In `src-tauri/src/lib.rs`, add inside `collect_commands![...]` (near the other `shortcut::change_*` entries):

```rust
            shortcut::change_live_preview_setting,
            shortcut::change_edit_before_paste_setting,
```

- [ ] **Step 5: Write a settings-default test**

Add to the `#[cfg(test)]` module in `settings.rs` (or create one) — verify defaults are OFF and deserialization tolerates missing keys:

```rust
#[test]
fn new_toggles_default_off() {
    let s: AppSettings = serde_json::from_str("{}").unwrap();
    assert!(!s.live_preview);
    assert!(!s.edit_before_paste);
}
```

- [ ] **Step 6: Run the test**

Run: `cd src-tauri && cargo test new_toggles_default_off 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/shortcut/mod.rs src-tauri/src/lib.rs
git commit -m "feat(settings): add live_preview and edit_before_paste toggles"
```

---

## Task 4: Overlay partial-text event + expanded size

**Files:**
- Modify: `src-tauri/src/overlay.rs` (constants ~line 34, add helpers near `emit_levels` ~line 388)

**Interfaces:**
- Produces:
  - `emit_partial_transcription(app: &AppHandle, text: &str)` — emits `transcription-partial` (String payload) to the overlay window.
  - `set_overlay_size(app: &AppHandle, expanded: bool)` — resizes the overlay window to expanded or default size and repositions it.
  - constants `OVERLAY_EXPANDED_WIDTH: f64 = 460.0`, `OVERLAY_EXPANDED_HEIGHT: f64 = 96.0`.

- [ ] **Step 1: Add expanded-size constants**

After `const OVERLAY_HEIGHT: f64 = 36.0;` (line 35) add:

```rust
const OVERLAY_EXPANDED_WIDTH: f64 = 460.0;
const OVERLAY_EXPANDED_HEIGHT: f64 = 96.0;
```

- [ ] **Step 2: Make `calculate_overlay_position` size-aware**

Change `calculate_overlay_position` (line 203) signature to take the current size, so the expanded overlay still centers/anchors correctly:

```rust
fn calculate_overlay_position(app_handle: &AppHandle, width: f64, height: f64) -> Option<(f64, f64)> {
    let monitor = get_monitor_with_cursor(app_handle)?;
    let scale = monitor.scale_factor();
    let monitor_x = monitor.position().x as f64 / scale;
    let monitor_y = monitor.position().y as f64 / scale;
    let monitor_width = monitor.size().width as f64 / scale;
    let monitor_height = monitor.size().height as f64 / scale;

    let settings = settings::get_settings(app_handle);

    let x = monitor_x + (monitor_width - width) / 2.0;
    let y = match settings.overlay_position {
        OverlayPosition::Top => monitor_y + OVERLAY_TOP_OFFSET,
        OverlayPosition::Bottom | OverlayPosition::None => {
            monitor_y + monitor_height - height - OVERLAY_BOTTOM_OFFSET
        }
    };

    Some((x, y))
}
```

Update the three existing callers to pass the default size:
- In `create_recording_overlay` (both cfg variants, lines ~231 and ~288): `calculate_overlay_position(app_handle, OVERLAY_WIDTH, OVERLAY_HEIGHT)`.
- In `update_overlay_position` (line ~365): first read the overlay's current logical size and pass it; simplest is to add a helper (next step) and have `update_overlay_position` call `calculate_overlay_position(app_handle, OVERLAY_WIDTH, OVERLAY_HEIGHT)` — the resize path uses `set_overlay_size` which repositions explicitly.

- [ ] **Step 3: Add `set_overlay_size` and `emit_partial_transcription`**

Add near `emit_levels` (line 388):

```rust
/// Resizes the overlay to expanded (live-preview) or default size and repositions it.
pub fn set_overlay_size(app_handle: &AppHandle, expanded: bool) {
    let (w, h) = if expanded {
        (OVERLAY_EXPANDED_WIDTH, OVERLAY_EXPANDED_HEIGHT)
    } else {
        (OVERLAY_WIDTH, OVERLAY_HEIGHT)
    };
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: w,
            height: h,
        }));
        if let Some((x, y)) = calculate_overlay_position(app_handle, w, h) {
            let _ = overlay_window
                .set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        }
    }
}

/// Emits the current partial transcription text to the overlay window.
pub fn emit_partial_transcription(app_handle: &AppHandle, text: &str) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("transcription-partial", text);
    }
}
```

- [ ] **Step 4: Reset overlay size on hide**

In `hide_recording_overlay` (line 373), before hiding, reset to default size so the next non-preview recording starts small. Add at the top of the function body:

```rust
    set_overlay_size(app_handle, false);
```

- [ ] **Step 5: Build to verify**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles (unused `set_overlay_size`/`emit_partial_transcription` warnings OK until Task 5).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/overlay.rs
git commit -m "feat(overlay): partial-transcription event + resizable overlay"
```

---

## Task 5: Live-preview background loop

**Files:**
- Modify: `src-tauri/src/actions.rs` (`start()` after successful recording start ~line 460; `stop()` ~line 492)

**Interfaces:**
- Consumes: `AudioRecordingManager::snapshot_recording()` (Task 2), `TranscriptionManager::transcribe()`, `overlay::emit_partial_transcription`, `overlay::set_overlay_size` (Task 4).
- Produces: a preview thread controlled by an `Arc<AtomicBool>` stored so `stop()`/`cancel` can signal it. Use a field on `TranscribeAction` OR a module-level `once_cell`/`Mutex<Option<Arc<AtomicBool>>>`. This plan uses a dedicated struct field passed via the action; if `TranscribeAction` is constructed per-invocation, store the flag in a `static` guarded map keyed by `binding_id`.

**Design note:** The preview loop is single-flight by construction — each iteration calls `transcribe()` synchronously (blocking on the engine mutex), then sleeps `PREVIEW_INTERVAL`. It checks the stop flag before every snapshot and before every emit. Re-transcribing the growing buffer is O(n²) over a dictation; acceptable for typical short dictations. Loop exits when `snapshot_recording()` returns `None` (recording ended) or the flag is cleared.

- [ ] **Step 1: Add a preview-control static**

Near the top of `actions.rs`, add:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

const PREVIEW_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1500);

/// Active live-preview stop flag (set to false to stop the loop). One at a time.
static PREVIEW_FLAG: Lazy<Mutex<Option<Arc<AtomicBool>>>> = Lazy::new(|| Mutex::new(None));

fn stop_preview_loop() {
    if let Some(flag) = PREVIEW_FLAG.lock().unwrap().take() {
        flag.store(false, Ordering::SeqCst);
    }
}
```

(If `once_cell` is not already a dependency, use `std::sync::OnceLock<Mutex<...>>` instead; check `Cargo.toml` — `once_cell` is commonly transitively present but add it explicitly if needed: `once_cell = "1"`.)

- [ ] **Step 2: Spawn the loop in `start()`**

In `TranscribeAction::start`, inside the `if recording_error.is_none()` block (line 460), after `shortcut::register_cancel_shortcut(app);`, add:

```rust
            let settings = get_settings(app);
            if settings.live_preview {
                overlay::set_overlay_size(app, true);
                let flag = Arc::new(AtomicBool::new(true));
                *PREVIEW_FLAG.lock().unwrap() = Some(flag.clone());

                let app_preview = app.clone();
                let rm_preview = Arc::clone(&rm);
                let tm_preview = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
                std::thread::spawn(move || {
                    while flag.load(Ordering::SeqCst) {
                        std::thread::sleep(PREVIEW_INTERVAL);
                        if !flag.load(Ordering::SeqCst) {
                            break;
                        }
                        let samples = match rm_preview.snapshot_recording() {
                            Some(s) if !s.is_empty() => s,
                            _ => continue, // not recording yet or silence
                        };
                        // Blocks on the engine mutex; final transcribe waits behind us,
                        // which is why stop() clears the flag first.
                        if let Ok(text) = tm_preview.transcribe(samples) {
                            if flag.load(Ordering::SeqCst) && !text.trim().is_empty() {
                                overlay::emit_partial_transcription(&app_preview, &text);
                            }
                        }
                    }
                });
            }
```

Confirm `overlay` and `TranscriptionManager` are imported in `actions.rs` (they are used elsewhere in the file — `show_recording_overlay` etc. come from `utils`/`overlay`; check existing `use` lines and add `use crate::overlay;` if the helpers were referenced through `utils`). The existing code calls `show_recording_overlay(app)` — trace that import and use the same path for `set_overlay_size`/`emit_partial_transcription`.

- [ ] **Step 3: Stop the loop at the top of `stop()` and on cancel**

At the very start of `TranscribeAction::stop` (line 492, before anything else) add:

```rust
        stop_preview_loop();
```

Also find `cancel_recording`/the cancel path (search `cancel` in `actions.rs`) and add `stop_preview_loop();` there too, so cancelling recording also kills the preview.

- [ ] **Step 4: Build**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/actions.rs src-tauri/Cargo.toml
git commit -m "feat(transcription): live-preview re-transcription loop"
```

---

## Task 6: Overlay renders live text (frontend)

**Files:**
- Modify: `src/overlay/RecordingOverlay.tsx`
- Modify: `src/overlay/RecordingOverlay.css`
- Modify: `src/i18n/locales/en/translation.json` (add `overlay.listening` if needed)

**Interfaces:**
- Consumes: `transcription-partial` event (String payload), `show-overlay`, `hide-overlay`.

- [ ] **Step 1: Add state + listener**

In `RecordingOverlay.tsx`, add state near the others (line 20):

```tsx
  const [partial, setPartial] = useState<string>("");
```

Inside `setupEventListeners` (after the `mic-level` listener, ~line 52), add:

```tsx
      const unlistenPartial = await listen<string>(
        "transcription-partial",
        (event) => {
          setPartial(event.payload as string);
        },
      );
```

Add `unlistenPartial();` to the cleanup return, and clear partial when hidden — in the `hide-overlay` handler set `setPartial("")`, and in `show-overlay` when state is `recording` reset `setPartial("")`.

- [ ] **Step 2: Render the partial text**

In the `recording` branch of `overlay-middle` (line 81), render the preview when present. Replace the bars-only block with bars + optional text:

```tsx
        {state === "recording" && (
          <div className="recording-inner">
            <div className="bars-container">
              {levels.map((v, i) => (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${Math.min(20, 4 + Math.pow(v, 0.7) * 16)}px`,
                    transition: "height 60ms ease-out, opacity 120ms ease-out",
                    opacity: Math.max(0.2, v * 1.7),
                  }}
                />
              ))}
            </div>
            {partial && <div className="live-preview-text">{partial}</div>}
          </div>
        )}
```

- [ ] **Step 3: Add CSS**

In `RecordingOverlay.css` add:

```css
.recording-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.live-preview-text {
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.92);
  max-height: 54px;
  overflow-y: auto;
  text-align: left;
  word-break: break-word;
  white-space: pre-wrap;
}
```

- [ ] **Step 4: Lint + typecheck**

Run: `bun run lint && bun run build 2>&1 | tail -20`
Expected: no lint errors, build succeeds.

- [ ] **Step 5: Manual end-to-end verification (Feature A)**

Run: `CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev`
1. Settings → enable "Live preview" (Task 11 adds the toggle; until then flip `live_preview` to `true` in the stored settings JSON to test).
2. Start recording, speak a sentence for >3s.
3. Expected: overlay expands and shows text that grows/updates roughly every 1.5s.
4. Stop → final text pastes as before; overlay shrinks back to default next time.
5. Disable live preview → overlay behaves exactly as today (small, bars only).

- [ ] **Step 6: Commit**

```bash
git add src/overlay/RecordingOverlay.tsx src/overlay/RecordingOverlay.css src/i18n/locales/en/translation.json
git commit -m "feat(overlay): render live transcription preview"
```

---

## Task 7: Editor window entry point (frontend shell)

**Files:**
- Create: `src/editor/index.html`, `src/editor/main.tsx`, `src/editor/TranscriptionEditor.tsx`, `src/editor/TranscriptionEditor.css`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: a webview page at `src/editor/index.html` rendering `TranscriptionEditor`, which listens for `editor-set-text` (String payload) and calls `commands.pasteText(text)` / `commands.cancelTranscriptionEditor()`.

- [ ] **Step 1: Add the Vite input**

In `vite.config.ts`, add to `rollupOptions.input`:

```ts
        editor: resolve(__dirname, "src/editor/index.html"),
```

- [ ] **Step 2: Create `src/editor/index.html`**

Mirror `src/overlay/index.html` (read it for the exact head/meta), pointing its script at `./main.tsx`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit transcription</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/editor/main.tsx`**

Mirror `src/overlay/main.tsx` (read it) — mount React + i18n:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "../i18n";
import TranscriptionEditor from "./TranscriptionEditor";
import "./TranscriptionEditor.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TranscriptionEditor />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Create `TranscriptionEditor.tsx`**

```tsx
import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import "./TranscriptionEditor.css";

const TranscriptionEditor: React.FC = () => {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const setup = listen<string>("editor-set-text", (e) => {
      setText(e.payload as string);
      requestAnimationFrame(() => ref.current?.focus());
    });
    return () => {
      setup.then((un) => un());
    };
  }, []);

  const insert = () => commands.pasteText(text);
  const cancel = () => commands.cancelTranscriptionEditor();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) insert();
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="editor-root">
      <textarea
        ref={ref}
        className="editor-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="editor-actions">
        <button className="editor-btn secondary" onClick={cancel}>
          {t("editor.cancel")}
        </button>
        <button className="editor-btn primary" onClick={insert}>
          {t("editor.insert")}
        </button>
      </div>
    </div>
  );
};

export default TranscriptionEditor;
```

- [ ] **Step 5: Create `TranscriptionEditor.css`**

```css
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  gap: 8px;
  font-family: system-ui, sans-serif;
}
.editor-textarea {
  flex: 1;
  resize: none;
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  line-height: 1.4;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.editor-btn {
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
}
.editor-btn.primary {
  background: #4f46e5;
  color: white;
}
```

- [ ] **Step 6: Add i18n keys**

In `src/i18n/locales/en/translation.json` add under a new `editor` object:

```json
  "editor": {
    "insert": "Insert",
    "cancel": "Cancel"
  }
```

- [ ] **Step 7: Build (bindings not yet generated — `commands.pasteText` will error; that is expected until Task 8/9). Typecheck the shell only.**

Run: `bun run lint 2>&1 | tail -20`
Expected: lint passes. (Skip `bun run build` until Task 9 regenerates bindings.)

- [ ] **Step 8: Commit**

```bash
git add src/editor vite.config.ts src/i18n/locales/en/translation.json
git commit -m "feat(editor): pre-paste editor window shell"
```

---

## Task 8: Editor window lifecycle (backend)

**Files:**
- Create: `src-tauri/src/editor.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod editor;` and, if overlay is created at startup, create the editor window hidden too — otherwise create lazily on first use)

**Interfaces:**
- Produces:
  - `editor::open_transcription_editor(app: &AppHandle, text: &str)` — creates (if missing) and shows a focusable editor window (500×260 logical, centered), then emits `editor-set-text` with `text`.
  - `editor::hide_transcription_editor(app: &AppHandle)` — hides the window.

- [ ] **Step 1: Create `editor.rs`**

```rust
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const EDITOR_WIDTH: f64 = 500.0;
const EDITOR_HEIGHT: f64 = 260.0;

fn ensure_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(w) = app.get_webview_window("transcription_editor") {
        return Some(w);
    }
    let mut builder = WebviewWindowBuilder::new(
        app,
        "transcription_editor",
        WebviewUrl::App("src/editor/index.html".into()),
    )
    .title("Edit transcription")
    .inner_size(EDITOR_WIDTH, EDITOR_HEIGHT)
    .resizable(true)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .visible(false);

    if let Some(data_dir) = crate::portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }
    builder.build().ok()
}

pub fn open_transcription_editor(app: &AppHandle, text: &str) {
    if let Some(w) = ensure_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
        // Give the webview a moment to mount its listener on first open.
        let w2 = w.clone();
        let text = text.to_string();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(120));
            let _ = w2.emit("editor-set-text", text);
        });
    }
}

pub fn hide_transcription_editor(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("transcription_editor") {
        let _ = w.hide();
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/lib.rs`, add `mod editor;` with the other `mod` declarations.

- [ ] **Step 3: Build**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles (unused fns until Task 9/10).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/editor.rs src-tauri/src/lib.rs
git commit -m "feat(editor): backend editor window lifecycle"
```

---

## Task 9: `paste_text` + `cancel_transcription_editor` commands

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (`collect_commands!`)

**Interfaces:**
- Consumes: `editor::hide_transcription_editor`, `utils::paste` (the same paste path used in `actions.rs:610`).
- Produces: `paste_text(app, text: String)`, `cancel_transcription_editor(app)`.

**Design note — focus restoration:** The editor window is focusable, so it holds keyboard focus. Before pasting we MUST hide the editor and yield briefly so the OS returns focus to the previously-active app; otherwise the paste lands nowhere (or into the editor). Hide → sleep ~120ms → paste on the main thread.

- [ ] **Step 1: Add the commands**

In `commands/mod.rs` (near `cancel_operation`, line 13):

```rust
#[tauri::command]
#[specta::specta]
pub fn paste_text(app: AppHandle, text: String) {
    crate::editor::hide_transcription_editor(&app);
    let ah = app.clone();
    std::thread::spawn(move || {
        // Let focus return to the previously-active application.
        std::thread::sleep(std::time::Duration::from_millis(120));
        let ah2 = ah.clone();
        let _ = ah.run_on_main_thread(move || {
            if let Err(e) = crate::utils::paste(text, ah2.clone()) {
                log::error!("paste_text failed: {e}");
                let _ = ah2.emit("paste-error", ());
            }
            crate::utils::hide_recording_overlay(&ah2);
            crate::change_tray_icon(&ah2, crate::TrayIconState::Idle);
        });
    });
}

#[tauri::command]
#[specta::specta]
pub fn cancel_transcription_editor(app: AppHandle) {
    crate::editor::hide_transcription_editor(&app);
    crate::utils::hide_recording_overlay(&app);
    crate::change_tray_icon(&app, crate::TrayIconState::Idle);
}
```

Adjust the paths (`crate::change_tray_icon`, `crate::TrayIconState`, `crate::utils::paste`, `crate::utils::hide_recording_overlay`) to match how `actions.rs` refers to them — copy the exact import paths used at `actions.rs:610-621`. Add `use tauri::Emitter;` if not present in `commands/mod.rs`.

- [ ] **Step 2: Register the commands**

In `lib.rs` `collect_commands!`, after `commands::cancel_operation,`:

```rust
            commands::paste_text,
            commands::cancel_transcription_editor,
```

- [ ] **Step 3: Build + regenerate bindings**

Run: `cd src-tauri && cargo build 2>&1 | tail -20` then `CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev` briefly to regenerate `src/bindings.ts` (specta writes it on startup). Confirm `pasteText` and `cancelTranscriptionEditor` now appear in `src/bindings.ts`.

Run: `grep -E "pasteText|cancelTranscriptionEditor" src/bindings.ts`
Expected: both present.

- [ ] **Step 4: Frontend build now passes**

Run: `bun run build 2>&1 | tail -20`
Expected: succeeds (editor referenced `commands.pasteText` now resolves).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/bindings.ts
git commit -m "feat(editor): paste_text and cancel commands"
```

---

## Task 10: Branch stop() to the editor

**Files:**
- Modify: `src-tauri/src/actions.rs` (the paste branch, lines 602-628)

**Interfaces:**
- Consumes: `editor::open_transcription_editor` (Task 8), `settings.edit_before_paste`.

- [ ] **Step 1: Replace the direct-paste branch**

In `stop()`, the `else` branch where `processed.final_text` is non-empty (currently lines 605-628 doing `run_on_main_thread(paste...)`), gate on the setting:

```rust
                            } else {
                                let final_text = processed.final_text;
                                let settings = get_settings(&ah);
                                if settings.edit_before_paste {
                                    // Hand off to the editor; it will paste via paste_text.
                                    crate::editor::open_transcription_editor(&ah, &final_text);
                                    // Keep tray as-is; editor commands reset it on insert/cancel.
                                } else {
                                    let ah_clone = ah.clone();
                                    let paste_time = Instant::now();
                                    ah.run_on_main_thread(move || {
                                        match utils::paste(final_text, ah_clone.clone()) {
                                            Ok(()) => debug!(
                                                "Text pasted successfully in {:?}",
                                                paste_time.elapsed()
                                            ),
                                            Err(e) => {
                                                error!("Failed to paste transcription: {}", e);
                                                let _ = ah_clone.emit("paste-error", ());
                                            }
                                        }
                                        utils::hide_recording_overlay(&ah_clone);
                                        change_tray_icon(&ah_clone, TrayIconState::Idle);
                                    })
                                    .unwrap_or_else(|e| {
                                        error!("Failed to run paste on main thread: {:?}", e);
                                        utils::hide_recording_overlay(&ah);
                                        change_tray_icon(&ah, TrayIconState::Idle);
                                    });
                                }
                            }
```

Note: when `edit_before_paste` is on, do NOT hide the overlay here — the editor flow owns teardown (the `paste_text`/`cancel` commands call `hide_recording_overlay`). But the `FinishGuard` (`_guard` at line 517) may hide/reset on drop — check `FinishGuard`'s Drop impl (search `struct FinishGuard`). If it force-hides the overlay or resets the tray, that's fine (editor is a separate window) but ensure it does not cancel the editor. If `FinishGuard` interferes, capture the needed teardown before the guard drops.

- [ ] **Step 2: Build**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles.

- [ ] **Step 3: Manual end-to-end verification (Feature B)**

Run: `CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev`
1. Enable "Edit before paste" (Task 11 toggle, or set `edit_before_paste: true` in settings JSON).
2. Focus a text field in another app (e.g. TextEdit / browser).
3. Record a sentence, stop.
4. Expected: editor window appears, focused, pre-filled with the transcription. Fix a word.
5. Click "Insert" (or Cmd+Enter). Expected: editor closes, focus returns to the other app, edited text is pasted there.
6. Repeat, press "Cancel"/Esc. Expected: editor closes, nothing pasted, app returns to idle.
7. Disable the setting → text pastes directly as today (no editor).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/actions.rs
git commit -m "feat(transcription): route final text through editor when enabled"
```

---

## Task 11: Settings UI toggles

**Files:**
- Modify: a settings component under `src/components/settings/` (find the one rendering existing toggles like "overlay position" or "show tray icon"; grep for `changeShowTrayIconSetting` in `src/` to locate the pattern)
- Modify: `src/i18n/locales/en/translation.json`
- Possibly modify: `src/stores/settingsStore.ts` / `src/hooks/useSettings.ts` if toggles read from a typed settings object

**Interfaces:**
- Consumes: `commands.changeLivePreviewSetting(bool)`, `commands.changeEditBeforePasteSetting(bool)` (from Task 3, now in `bindings.ts`).

- [ ] **Step 1: Locate the toggle pattern**

Run: `grep -rn "changeShowTrayIconSetting\|change_show_tray_icon" src/ | head`
Read that component to copy its toggle markup + store wiring.

- [ ] **Step 2: Add two toggles**

Following that exact pattern, add "Live preview" (bound to `settings.live_preview` / `commands.changeLivePreviewSetting`) and "Edit before pasting" (bound to `settings.edit_before_paste` / `commands.changeEditBeforePasteSetting`). Use `t('settings.livePreview.label')` etc.

- [ ] **Step 3: Add i18n keys**

```json
  "settings": {
    "livePreview": {
      "label": "Live preview",
      "description": "Show transcription as you speak (uses more CPU; ~1.5s delay)."
    },
    "editBeforePaste": {
      "label": "Edit before pasting",
      "description": "Review and fix the transcription in a window before it is inserted."
    }
  }
```

(Merge into the existing `settings` object — do not duplicate the key.)

- [ ] **Step 4: Lint + build**

Run: `bun run lint && bun run build 2>&1 | tail -20`
Expected: passes.

- [ ] **Step 5: Manual verification**

Run the app, toggle both settings, confirm they persist across restart (stored via `write_settings`) and drive the behavior from Tasks 6 and 10.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings src/i18n/locales/en/translation.json src/stores src/hooks
git commit -m "feat(settings): UI toggles for live preview and pre-paste editor"
```

---

## Task 12: Documentation + translation stubs

**Files:**
- Modify: `AGENTS.md` (Settings System section — mention the two new toggles and the live-preview limitation)
- Modify: other locale files under `src/i18n/locales/*/translation.json` — add the new keys (copy English values; real translations follow `CONTRIBUTING_TRANSLATIONS.md`)

- [ ] **Step 1: Run the translation checker**

Run: `bun run check:translations 2>&1 | tail -30`
Expected: lists missing keys in non-English locales.

- [ ] **Step 2: Add stubs**

Add the `editor.*` and `settings.livePreview/editBeforePaste` keys to every locale file (English text as placeholder), until the checker passes.

- [ ] **Step 3: Note the limitation in AGENTS.md**

Add a sentence under "Settings System": live preview re-transcribes the growing buffer on an interval (not true streaming — `transcribe-rs` exposes no partial API); English-only streaming models aren't used.

- [ ] **Step 4: Verify + commit**

Run: `bun run check:translations 2>&1 | tail -5`
Expected: passes.

```bash
git add src/i18n AGENTS.md
git commit -m "docs: document live preview + editor, add translation stubs"
```

---

## Self-Review Notes

- **Spec coverage:** Live preview = Tasks 1–6, 11; editor = Tasks 7–11; docs = 12. Both gated by defaults-off settings (Task 3).
- **Serialization risk:** preview loop and final transcribe share the engine mutex — Task 5 stops the loop at the top of `stop()` (before the final `transcribe`) so the final call isn't queued behind a stale preview.
- **Focus restoration (editor):** handled in Task 9 (`paste_text` hides editor → delay → paste). This is the highest-risk area; verify on macOS first, then Windows/Linux where focus semantics differ.
- **Performance:** re-transcription is O(n²) over a dictation; `PREVIEW_INTERVAL` (1.5s) bounds frequency. If long dictations lag, consider raising the interval or previewing only the last N seconds (future work, not in scope).
- **Cross-platform overlay resize:** Task 4 uses `set_size`/`set_position`; verify the NSPanel (macOS) and GTK layer-shell (Linux) actually resize — if layer-shell ignores `set_size`, the Linux preview may need a fixed exclusive zone (call out as follow-up if observed).
