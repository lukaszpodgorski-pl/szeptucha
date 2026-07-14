import React from "react";
import ReactDOM from "react-dom/client";
import TranscriptionEditor from "./TranscriptionEditor";
import "@/i18n";
import "./TranscriptionEditor.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TranscriptionEditor />
  </React.StrictMode>,
);
