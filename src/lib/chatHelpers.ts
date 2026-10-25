import {
  OctopHttpError,
  extractTextContent,
  workspaceDownloadPath,
} from "./octopHttp";
import type { ChatMessage, ChatMessageAttachment } from "./types";

export const CHAT_WIDTH = 400;
export const CHAT_INITIAL_HEIGHT = 400;
export const CHAT_EXPANDED_HEIGHT = 560;
export const CHAT_COMPACT_MIN_HEIGHT = 120;
export const CHAT_MIN_WIDTH = 280;

export function chatWindowWidth(): number {
  const inner = Math.ceil(window.innerWidth);
  return Number.isFinite(inner) && inner >= CHAT_MIN_WIDTH ? inner : CHAT_WIDTH;
}
export const CHAT_MIN_HEIGHT = 200;
/** Keep in sync with `RESIZE_ANIMATION_DURATION` in window_cmd.rs. */
export const CHAT_RESIZE_DURATION_MS = 360;
export const POPOVER_GAP_PX = 6;
export const POPOVER_VIEWPORT_PAD_PX = 8;

export type PopoverPlacement = {
  maxHeight: number;
  placeAbove: boolean;
  alignRight: boolean;
};

export function popoverPlacement(args: {
  anchor: { top: number; bottom: number; left: number };
  viewport: { width: number; height: number };
  popoverWidth: number;
}): PopoverPlacement {
  const spaceAbove = args.anchor.top - POPOVER_VIEWPORT_PAD_PX - POPOVER_GAP_PX;
  const spaceBelow =
    args.viewport.height -
    args.anchor.bottom -
    POPOVER_VIEWPORT_PAD_PX -
    POPOVER_GAP_PX;
  const placeAbove = spaceAbove >= spaceBelow;
  const available = placeAbove ? spaceAbove : spaceBelow;
  return {
    maxHeight: Math.max(0, Math.floor(available)),
    placeAbove,
    alignRight:
      args.anchor.left + args.popoverWidth + POPOVER_VIEWPORT_PAD_PX >
      args.viewport.width,
  };
}

export function applyPopoverPlacement(
  popover: HTMLElement,
  placement: PopoverPlacement,
): void {
  popover.style.maxHeight = `${placement.maxHeight}px`;
  if (placement.placeAbove) {
    popover.style.bottom = `calc(100% + ${POPOVER_GAP_PX}px)`;
    popover.style.top = "auto";
  } else {
    popover.style.top = `calc(100% + ${POPOVER_GAP_PX}px)`;
    popover.style.bottom = "auto";
  }
  if (placement.alignRight) {
    popover.style.left = "auto";
    popover.style.right = "0";
  } else {
    popover.style.left = "0";
    popover.style.right = "auto";
  }
}

export function compactWindowHeight(
  root: HTMLElement,
  minHeight = CHAT_COMPACT_MIN_HEIGHT,
): number {
  const rootRect = root.getBoundingClientRect();
  const top = rootRect.top;
  let bottom = rootRect.bottom;
  const body = root.querySelector(".chat-body");
  if (body && !root.classList.contains("is-compact")) {
    bottom -= body.getBoundingClientRect().height;
  }
  return Math.max(minHeight, Math.ceil(bottom - top));
}

let nextMessageId = 0;

export function nextChatMessageId(prefix: string): string {
  nextMessageId += 1;
  return `${prefix}-${nextMessageId}`;
}

export function historyMessages(
  rows: Array<{ role: string; content: unknown }>,
  agentId?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const row of rows) {
    if (
      row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system"
    ) {
      // Tool rows carry the artifacts agent-produced files live in; fold
      // their attachments into the surrounding assistant bubble.
      if (row.role === "tool") {
        const attachments = attachmentsFromToolContent(row.content, agentId);
        if (attachments.length === 0) continue;
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") {
          last.attachments = mergeAttachments(last.attachments, attachments);
          continue;
        }
        messages.push({
          id: nextChatMessageId("history"),
          role: "assistant",
          content: "",
          attachments,
        });
      }
      continue;
    }
    const content = extractTextContent(row.content);
    const attachments = attachmentsFromInbound(row);
    if (!content && attachments.length === 0) continue;
    messages.push({
      id: nextChatMessageId("history"),
      role: row.role,
      content,
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  }
  return messages;
}

export function chatErrorText(error: unknown): string {
  if (error instanceof OctopHttpError) {
    if (error.status === 401) return "登录已失效，请重新设置账号";
    if (!error.message.startsWith("HTTP ")) {
      return `服务请求失败：${error.message}`;
    }
    return `服务请求失败（${error.status}）`;
  }
  return error instanceof Error ? error.message : "连接服务失败";
}

/** Classify an attachment for rendering: inline preview vs. download card. */
export function attachmentKind(
  mediaType?: string,
  filename?: string,
): ChatMessageAttachment["kind"] {
  const mime = (mediaType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (!mime && filename) {
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename)) return "image";
    if (/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(filename)) return "video";
  }
  return "file";
}

function basename(path: string): string {
  const posix = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return posix[posix.length - 1] || path;
}

function urlFor(row: Record<string, unknown>): string {
  return String(
    row.access_url || row.url || row.workspace_path || row.path || "",
  );
}

/** Attachments the user uploaded, echoed back in persisted history. */
export function attachmentsFromInbound(
  row: Record<string, unknown>,
): ChatMessageAttachment[] {
  if (!Array.isArray(row.inbound_attachments)) return [];
  const attachments: ChatMessageAttachment[] = [];
  for (const raw of row.inbound_attachments) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = urlFor(item);
    const filename = String(item.filename || basename(url) || "附件");
    const mediaType = String(item.media_type || "");
    if (!url) continue;
    attachments.push({
      kind: attachmentKind(mediaType, filename),
      url,
      filename,
      ...(mediaType ? { mediaType } : {}),
    });
  }
  return attachments;
}

/** Media blocks produced by agent tools (send_file / screenshot / …). */
export function attachmentsFromToolContent(
  content: unknown,
  agentId?: string,
): ChatMessageAttachment[] {
  if (!Array.isArray(content)) return [];
  const attachments: ChatMessageAttachment[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const result = block as Record<string, unknown>;
    if (result.type !== "tool_result") continue;
    const artifact = result.artifact;
    if (!artifact || typeof artifact !== "object") continue;
    const media = artifact as Record<string, unknown>;
    const path = String(media.path || "");
    const mediaType = String(
      (media.source as Record<string, unknown> | undefined)?.media_type ||
        media.media_type ||
        "",
    );
    const filename = String(media.filename || basename(path) || "附件");
    let url = String(media.url || "");
    if (!url && path && agentId) {
      url = workspaceDownloadPath(agentId, path);
    }
    if (!url) continue;
    attachments.push({
      kind: attachmentKind(mediaType, filename),
      url,
      filename,
      ...(mediaType ? { mediaType } : {}),
    });
  }
  return attachments;
}

/** Append attachments without duplicating ones already on the message. */
export function mergeAttachments(
  existing: ChatMessageAttachment[] | undefined,
  additions: ChatMessageAttachment[],
): ChatMessageAttachment[] {
  const seen = new Set((existing ?? []).map((a) => `${a.kind}:${a.url}`));
  const merged = [...(existing ?? [])];
  for (const attachment of additions) {
    const key = `${attachment.kind}:${attachment.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

/** Chunked base64 for IPC — `btoa(...spread)` overflows on big buffers. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
