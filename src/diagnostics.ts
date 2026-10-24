import { invoke } from "@tauri-apps/api/core";

const MAX_LINE_LENGTH = 4000;

function send(kind: string, detail: string): void {
  const stamp = new Date().toISOString();
  const line = `${stamp} ${kind} ${detail}`.slice(0, MAX_LINE_LENGTH);
  // Best effort: the app keeps working even if logging is unavailable.
  void invoke<boolean>("append_diagnostic_line", { line }).catch(
    () => undefined,
  );
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
  }
  return String(reason);
}

/**
 * Record uncaught errors, promise rejections, and page visibility changes so
 * a bug session can be reconstructed from the diagnostics log after the fact.
 * Safe to install in every window; failures are silent by design.
 */
export function installDiagnostics(label: string): void {
  window.addEventListener("error", (event) => {
    const where = `${event.filename}:${event.lineno}:${event.colno}`;
    const detail =
      event.error instanceof Error
        ? describeReason(event.error)
        : `${String(event.message)} @ ${where}`;
    send(`[error] [${label}]`, detail);
  });

  window.addEventListener("unhandledrejection", (event) => {
    send(`[rejection] [${label}]`, describeReason(event.reason));
  });

  document.addEventListener("visibilitychange", () => {
    send(`[visibility] [${label}]`, document.visibilityState);
  });

  send(`[lifecycle] [${label}]`, "diagnostics installed");
}

/** Append a probe line for a single window's state. */
export function logWindowProbe(
  label: string,
  kind: string,
  detail: string,
): void {
  send(`[probe] [${label}]`, `${kind} ${detail}`);
}
