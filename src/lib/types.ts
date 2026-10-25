export type MascotId = "peek" | "type";

export interface AppConfig {
  baseUrl: string;
  username: string;
  mascotId: MascotId;
  lastAgentId: string | null;
  threadIdByAgent: Record<string, string>;
  petX: number | null;
  petY: number | null;
  petSize: number;
  /** Tauri accelerator, e.g. CmdOrCtrl+Shift+O */
  shortcutOpenPet: string;
  /** Tauri accelerator, e.g. CmdOrCtrl+Shift+H */
  shortcutOpenHome: string;
  /** When true, chat/settings stay visible after clicking another app. */
  keepWindowsVisible: boolean;
}

export interface AgentSummary {
  id: string;
  name: string;
  state?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
  error?: string;
  attachments?: ChatMessageAttachment[];
}

/** A file pushed by the agent (or attached by the user) in a conversation. */
export interface ChatMessageAttachment {
  /** Image/video attachments render inline, everything else becomes a card. */
  kind: "image" | "video" | "file";
  /** Absolute URL — workspace download endpoints use the Bearer token. */
  url: string;
  filename: string;
  mediaType?: string;
}
