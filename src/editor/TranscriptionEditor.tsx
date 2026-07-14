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
