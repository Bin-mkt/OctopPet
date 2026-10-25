import { useEffect, useRef } from "react";

import type { ChatSessionSummary } from "../lib/octopHttp";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Today → HH:mm, this week → weekday, otherwise → M月D日. */
export function formatSessionTime(ts: number): string {
  if (!ts || ts < 0) return "";
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) {
    return `周${"日一二三四五六"[date.getDay()]}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function displayTitle(session: ChatSessionSummary): string {
  return session.title.trim() || "新会话";
}

/**
 * Overlay panel that lists the agent's conversation threads and switches the
 * chat to one of them. Sits on top of the message area so it does not need
 * a second column inside the narrow pet window.
 */
export default function ChatSessionList({
  sessions,
  activeThreadId,
  loading = false,
  errorText = "",
  onPick,
  onClose,
}: {
  sessions: ChatSessionSummary[];
  activeThreadId?: string | null;
  loading?: boolean;
  errorText?: string;
  onPick: (threadId: string) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active session visible when the panel opens.
  useEffect(() => {
    if (!activeThreadId) return;
    const item = listRef.current?.querySelector(
      `[data-thread-id="${CSS.escape(activeThreadId)}"]`,
    );
    item?.scrollIntoView?.({ block: "nearest" });
  }, [activeThreadId]);

  return (
    <div
      className="chat-session-overlay"
      onClick={onClose}
      role="dialog"
      aria-label="会话列表"
    >
      <div
        ref={listRef}
        className="chat-session-list"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-session-header">
          <span>会话</span>
          <button
            type="button"
            className="chat-session-close"
            aria-label="关闭会话列表"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {loading ? (
          <p className="chat-session-empty">正在加载会话…</p>
        ) : errorText ? (
          <p className="chat-session-error">{errorText}</p>
        ) : sessions.length === 0 ? (
          <p className="chat-session-empty">还没有会话记录</p>
        ) : (
          sessions.map((session) => {
            const isActive = session.threadId === activeThreadId;
            return (
              <button
                key={session.threadId}
                type="button"
                data-thread-id={session.threadId}
                className={`chat-session-item${isActive ? " is-active" : ""}${
                  session.pinned ? " is-pinned" : ""
                }`}
                onClick={() => onPick(session.threadId)}
              >
                <span
                  className="chat-session-title"
                  title={displayTitle(session)}
                >
                  {session.pinned ? "📌 " : ""}
                  {displayTitle(session)}
                </span>
                <span className="chat-session-time">
                  {formatSessionTime(session.lastActive)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
