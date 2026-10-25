import { windowCloseSide } from "../lib/platform";

import WindowCloseButton from "./WindowCloseButton";

export default function ChatChrome({
  sessionTitle = "",
  onToggleSessions,
  sessionsOpen = false,
  onNewSession,
  newSessionDisabled,
}: {
  sessionTitle?: string;
  onToggleSessions?: () => void;
  sessionsOpen?: boolean;
  onNewSession?: () => void;
  newSessionDisabled?: boolean;
}) {
  const closeSide = windowCloseSide();
  const close = <WindowCloseButton />;
  const toggle = onToggleSessions ? (
    <button
      type="button"
      className={`chat-sessions-toggle${sessionsOpen ? " is-active" : ""}`}
      aria-label="会话列表"
      title="会话列表"
      aria-expanded={sessionsOpen}
      onClick={() => onToggleSessions()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  ) : null;
  const newSession = onNewSession ? (
    <button
      type="button"
      className="chat-new-session"
      aria-label="新建会话"
      title="新建会话"
      disabled={newSessionDisabled}
      onClick={() => onNewSession()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 7v6M9 10h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  ) : (
    <span className="chat-chrome-spacer" />
  );

  const title = sessionTitle ? (
    <span className="chat-chrome-title" title={sessionTitle}>
      {sessionTitle}
    </span>
  ) : null;

  return (
    <header
      className="chat-chrome"
      data-close-side={closeSide}
      data-tauri-drag-region
    >
      {closeSide === "start" ? close : newSession}
      {toggle}
      <div className="chat-chrome-drag" data-tauri-drag-region />
      {title}
      {closeSide === "start" ? newSession : close}
    </header>
  );
}
