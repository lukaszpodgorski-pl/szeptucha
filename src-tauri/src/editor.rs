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
