import { buildUserMessageContent, type ChatAttachment } from "./octopHttp";
import { normalizeBaseUrl } from "./configLogic";

export function buildChatWsUrl(
  baseUrl: string,
  agentId: string,
  token: string,
): string {
  const root = normalizeBaseUrl(baseUrl);
  const u = new URL(root);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  const prefix = u.pathname.replace(/\/+$/, "");
  u.pathname = `${prefix}/api/agents/${encodeURIComponent(agentId)}/chat/ws`;
  u.search = "";
  u.hash = "";
  u.searchParams.set("token", token);
  return u.toString();
}

export function buildUserTurnPayload(args: {
  text: string;
  threadId: string;
  sessionKey?: string;
  attachments?: ChatAttachment[];
  model?: string | null;
  mcpServers?: string[];
}): Record<string, unknown> {
  const messageContent = buildUserMessageContent(args.text, args.attachments);
  const payload: Record<string, unknown> = {
    type: "user_turn",
    text: typeof messageContent === "string" ? messageContent : args.text,
    thread_id: args.threadId,
    messages: [{ role: "user", content: messageContent }],
  };
  if (args.sessionKey) payload.session_key = args.sessionKey;
  if (args.model) payload.model = args.model;
  if (args.mcpServers && args.mcpServers.length > 0) {
    payload.mcp_servers = args.mcpServers;
  }
  return payload;
}

export function buildCancelPayload(threadId: string): Record<string, unknown> {
  return { type: "cancel", thread_id: threadId };
}

/** Attachment pushed by the agent mid-stream (send_file / screenshots / …). */
export type StreamAttachment = {
  kind: "image" | "file";
  /** Always non-empty: frames without any URL are not surfaced. */
  url: string;
  filename: string;
  mediaType?: string;
};

export function applyStreamChunk(
  prevAssistantText: string,
  chunk: unknown,
): {
  text: string;
  done: boolean;
  error?: string;
  attachments?: StreamAttachment[];
} {
  if (!chunk || typeof chunk !== "object") {
    return { text: prevAssistantText, done: false };
  }
  const c = chunk as {
    type?: string;
    content?: string;
    message?: string;
    kind?: string;
    url?: string;
    preview_url?: string;
    filename?: string;
    mime_type?: string;
    data?: string;
  };
  if (c.type === "token" && typeof c.content === "string") {
    return { text: prevAssistantText + c.content, done: false };
  }
  if (c.type === "attachment") {
    const url = c.preview_url || c.url || "";
    const mime = c.mime_type || "application/octet-stream";
    const displayUrl = url || (c.data ? `data:${mime};base64,${c.data}` : "");
    if (!displayUrl) return { text: prevAssistantText, done: false };
    return {
      text: prevAssistantText,
      done: false,
      attachments: [
        {
          kind:
            c.kind === "image" || mime.startsWith("image/") ? "image" : "file",
          url: displayUrl,
          filename: c.filename || "attachment",
          mediaType: mime,
        },
      ],
    };
  }
  if (c.type === "done") return { text: prevAssistantText, done: true };
  if (c.type === "error") {
    return {
      text: prevAssistantText,
      done: true,
      error: c.message || "流式错误",
    };
  }
  return { text: prevAssistantText, done: false };
}
