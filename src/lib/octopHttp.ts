import type {
  ChatAttachment,
  ConnectorOption,
  ResolvedModel,
} from "./octopTypes";
import { normalizeBaseUrl } from "./configLogic";

export type {
  ChatAttachment,
  ConnectorOption,
  ResolvedModel,
} from "./octopTypes";
export {
  buildUserMessageContent,
  isImageAttachment,
  modelOptionLabel,
  modelOptionValue,
  modelRef,
} from "./octopTypes";
export function parseApiErrorMessage(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as {
      detail?: unknown;
      message?: unknown;
      error?: { message?: unknown } | string;
    };
    if (data && typeof data === "object") {
      if (
        data.error &&
        typeof data.error === "object" &&
        typeof data.error.message === "string" &&
        data.error.message.trim()
      ) {
        return data.error.message.trim();
      }
      if (typeof data.detail === "string" && data.detail.trim()) {
        return data.detail.trim();
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error.trim();
      }
    }
  } catch {
    if (trimmed.length < 160 && !trimmed.startsWith("{")) return trimmed;
  }
  return null;
}

export class OctopHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(parseApiErrorMessage(body) || `HTTP ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

function networkError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /load failed|failed to fetch|networkerror|network request failed|error sending request|url not allowed/i.test(
      message,
    )
  ) {
    return new Error(
      message.includes("url not allowed")
        ? message
        : "无法连接服务，请检查地址是否可访问",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function clientFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return await tauriFetch(input, init);
    }
    return await globalThis.fetch(input, init);
  } catch (error) {
    throw networkError(error);
  }
}

async function api<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const root = normalizeBaseUrl(baseUrl);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const { token: _t, ...rest } = init;
  const res = await clientFetch(`${root}/api${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new OctopHttpError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ access_token: string; expires_in: number }> {
  return api(baseUrl, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function listAgents(
  baseUrl: string,
  token: string,
): Promise<Array<{ id: string; name: string; state?: string }>> {
  const rows = await api<Array<Record<string, unknown>>>(baseUrl, "/agents", {
    token,
  });
  return rows.map((r) => ({
    id: String(r.agent_id ?? r.id),
    name: String(r.name ?? r.agent_id ?? r.id),
    state: r.state != null ? String(r.state) : undefined,
  }));
}

export async function createThread(
  baseUrl: string,
  token: string,
  agentId: string,
): Promise<{ thread_id: string; session_key: string }> {
  return api(baseUrl, `/agents/${encodeURIComponent(agentId)}/threads`, {
    method: "POST",
    token,
  });
}

export async function getHistory(
  baseUrl: string,
  token: string,
  agentId: string,
  threadId: string,
): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
  return api(
    baseUrl,
    `/agents/${encodeURIComponent(agentId)}/threads/${encodeURIComponent(threadId)}/history?limit=50&offset=0`,
    { token },
  );
}

export async function listResolvedModels(
  baseUrl: string,
  token: string,
): Promise<ResolvedModel[]> {
  const rows = await api<Array<Record<string, unknown>>>(
    baseUrl,
    "/providers/resolved",
    { token },
  );
  return (rows ?? []).map((r) => ({
    provider_name: String(r.provider_name ?? ""),
    model: String(r.model ?? ""),
    name: String(r.name ?? r.model ?? ""),
  }));
}

export async function listConnectors(
  baseUrl: string,
  token: string,
): Promise<ConnectorOption[]> {
  const rows = await api<Array<Record<string, unknown>>>(
    baseUrl,
    "/connector-instances",
    { token },
  );
  return (rows ?? [])
    .filter((r) => r.status === "active" && r.has_credentials)
    .map((r) => ({
      mcp_server_name: String(r.mcp_server_name ?? ""),
      label: String(r.display_name ?? r.mcp_server_name ?? ""),
      kind: String(r.kind ?? ""),
    }))
    .filter((r) => r.mcp_server_name);
}

export async function uploadAttachment(
  baseUrl: string,
  token: string,
  agentId: string,
  file: File,
): Promise<ChatAttachment> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{
    path?: string;
    workspace_path?: string;
    filename?: string;
    media_type?: string;
    url?: string;
    access_url?: string;
  }>(baseUrl, `/agents/${encodeURIComponent(agentId)}/upload`, {
    method: "POST",
    token,
    body: form,
  });
  const workspacePath = String(res.path || res.workspace_path || "");
  return {
    filename: String(res.filename || file.name),
    mediaType: String(
      res.media_type || file.type || "application/octet-stream",
    ),
    workspacePath,
    url: String(res.access_url || res.url || workspacePath),
  };
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "");
  }
  return "";
}

/**
 * Fetch an attachment (workspace download / media preview) with the Bearer
 * token the API endpoints require. Runs through the Tauri HTTP plugin on the
 * desktop build, so the cross-origin restriction never applies.
 */
export async function fetchAttachmentBlob(
  baseUrl: string,
  token: string,
  url: string,
): Promise<Blob> {
  const root = normalizeBaseUrl(baseUrl);
  const absolute =
    /^https?:\/\//i.test(url) || url.startsWith("data:")
      ? url
      : `${root}${url.startsWith("/") ? "" : "/"}${url}`;
  const res = await clientFetch(absolute, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new OctopHttpError(res.status, body);
  }
  return res.blob();
}

/** Workspace download endpoint path for an agent file. */
export function workspaceDownloadPath(agentId: string, path: string): string {
  return `/api/agents/${encodeURIComponent(agentId)}/workspace/download?path=${encodeURIComponent(path)}`;
}

export interface ChatSessionSummary {
  threadId: string;
  title: string;
  /** Unix seconds — the server reports seconds, the UI multiplies by 1000. */
  lastActive: number;
  isActive?: boolean;
  hasMessages?: boolean;
  pinned?: boolean;
}

/** Conversation threads of an agent that the current user can reopen. */
export async function listThreads(
  baseUrl: string,
  token: string,
  agentId: string,
): Promise<ChatSessionSummary[]> {
  const rows = await api<Array<Record<string, unknown>>>(
    baseUrl,
    `/agents/${encodeURIComponent(agentId)}/threads?limit=50`,
    { token },
  );
  return (rows ?? []).map((row) => ({
    threadId: String(row.thread_id ?? ""),
    title: String(row.title ?? ""),
    lastActive: Number(row.last_active ?? 0),
    isActive: Boolean(row.is_active),
    hasMessages: Boolean(row.has_messages),
    pinned: Boolean(row.pinned),
  }));
}

/** Point this user's session at an existing thread (the switch call). */
export async function rebindSession(
  baseUrl: string,
  token: string,
  agentId: string,
  threadId: string,
): Promise<void> {
  await api(baseUrl, `/agents/${encodeURIComponent(agentId)}/session`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ thread_id: threadId }),
  });
}
