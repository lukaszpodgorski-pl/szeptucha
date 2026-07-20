use once_cell::sync::Lazy;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const EDITOR_WIDTH: f64 = 500.0;
const EDITOR_HEIGHT: f64 = 260.0;

/// Text waiting to be shown in the editor. The webview pulls it via the
/// `get_pending_editor_text` command once mounted, so delivery does not
/// depend on the emit racing the first page load.
static PENDING_TEXT: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

pub fn take_pending_editor_text() -> Option<String> {
    PENDING_TEXT.lock().unwrap().take()
}

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
    *PENDING_TEXT.lock().unwrap() = Some(text.to_string());
    if let Some(w) = ensure_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
        // Covers the reused-window case (listener already mounted). On first
        // open the webview may still be loading; it pulls the pending text
        // via `get_pending_editor_text` once mounted.
        let _ = w.emit("editor-set-text", text.to_string());
    }
}

pub fn hide_transcription_editor(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("transcription_editor") {
        let _ = w.hide();
    }
}
