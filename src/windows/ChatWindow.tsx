import { useMemo, useState } from "react";

import Composer from "../components/Composer";
import ChatChrome from "../components/ChatChrome";
import ChatResizeChrome from "../components/ChatResizeChrome";
import ChatSessionList from "../components/ChatSessionList";
import MessageList from "../components/MessageList";
import QueuedMessages from "../components/QueuedMessages";
import { useChatController } from "../hooks/useChatController";
import { useEscapeHidesWindow } from "../hooks/useWindowChrome";
import { removeChatItem } from "../lib/messageQueue";
import { tauriApi } from "../lib/tauriApi";

export default function ChatWindow() {
  const chat = useChatController();
  useEscapeHidesWindow();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const sessionTitle = useMemo(() => {
    const active = (chat.sessions ?? []).find(
      (session) => session.threadId === chat.activeThreadId,
    );
    return active ? active.title.trim() || "新会话" : "";
  }, [chat.sessions, chat.activeThreadId]);

  if (chat.needsSettings) {
    return (
      <main className="chat-window chat-gate" ref={chat.rootRef}>
        <ChatChrome />
        <div className="chat-gate-body">
          <p>需要先完成登录设置</p>
          <button
            className="settings-btn"
            type="button"
            onClick={() => void tauriApi.showSettings()}
          >
            打开设置
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`chat-window${chat.layoutExpanded ? " is-expanded" : " is-compact"}`}
      ref={chat.rootRef}
    >
      <ChatChrome
        sessionTitle={sessionTitle}
        sessionsOpen={sessionsOpen}
        onToggleSessions={() => {
          if (!sessionsOpen) void chat.refreshSessions();
          setSessionsOpen((open) => !open);
        }}
        onNewSession={() => {
          setSessionsOpen(false);
          void chat.startNewSession();
        }}
        newSessionDisabled={
          chat.loadingHistory || chat.connection === "streaming"
        }
      />
      {sessionsOpen ? (
        <ChatSessionList
          sessions={chat.sessions}
          activeThreadId={chat.activeThreadId}
          onPick={(threadId) => {
            setSessionsOpen(false);
            void chat.switchThread(threadId);
          }}
          onClose={() => setSessionsOpen(false)}
        />
      ) : null}
      <div className="chat-body">
        {chat.error ? (
          <div className="chat-error" role="alert">
            <p>{chat.error}</p>
            {chat.canRetryInit ? (
              <button
                type="button"
                className="chat-error-retry"
                onClick={() => void chat.retryInitialize()}
              >
                重试
              </button>
            ) : null}
          </div>
        ) : null}
        <MessageList
          messages={chat.messages}
          loading={chat.loadingHistory}
          actionsDisabled={chat.connection === "streaming"}
          speakingId={chat.speakingId}
          statusLabel={chat.statusLabel}
          attachmentContext={chat.attachmentContext}
          onRetry={chat.retryAssistant}
          onSpeak={chat.speakMessage}
        />
      </div>
      <QueuedMessages
        items={chat.queue}
        onRemove={(id) =>
          chat.setQueue((current) => removeChatItem(current, id))
        }
      />
      <Composer
        agents={chat.agents}
        agentId={chat.agentId}
        onAgentChange={(id) => void chat.openAgent(id)}
        models={chat.models}
        connectors={chat.connectors}
        attachments={chat.attachments}
        onAttachmentsChange={chat.setAttachments}
        agentDisabled={chat.loadingHistory || chat.connection === "streaming"}
        disabled={!chat.threadReady || chat.loadingHistory}
        streaming={chat.connection === "streaming"}
        uploading={chat.uploading}
        onUploadFiles={(files) => void chat.uploadFiles(files)}
        onSend={chat.sendMessage}
        onQueue={chat.queueMessage}
        onStop={chat.stopStream}
        onLayoutChange={
          chat.expanded ? undefined : () => chat.fitCompactWindow()
        }
      />
      <p className="chat-footnote">内容由 AI 生成，仅供参考</p>
      <ChatResizeChrome />
    </main>
  );
}
