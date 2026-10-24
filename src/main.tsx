import React from "react";
import ReactDOM from "react-dom/client";

import "./App.css";
import ErrorGate from "./components/ErrorGate";
import { installDiagnostics } from "./diagnostics";
import { getWindowLabel } from "./lib/tauriWindowApi";
import ChatWindow from "./windows/ChatWindow";
import PetWindow from "./windows/PetWindow";
import SettingsWindow from "./windows/SettingsWindow";

const label = getWindowLabel();
installDiagnostics(label);
document.documentElement.dataset.windowLabel = label;

// Pet must paint fully clear before React mounts. `color-scheme: light` +
// `:root` gray background make WKWebView show a frosted gray box on macOS.
if (label === "pet") {
  const root = document.documentElement;
  root.style.background = "transparent";
  root.style.backgroundColor = "transparent";
  root.style.colorScheme = "normal";
  document.body.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
}

const root =
  label === "chat" ? (
    <ChatWindow />
  ) : label === "settings" ? (
    <SettingsWindow />
  ) : (
    <PetWindow />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorGate label={label}>{root}</ErrorGate>
  </React.StrictMode>,
);
