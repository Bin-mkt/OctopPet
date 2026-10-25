import { describe, expect, it } from "vitest";

import {
  attachmentKind,
  attachmentsFromInbound,
  attachmentsFromToolContent,
  bytesToBase64,
  historyMessages,
  mergeAttachments,
} from "./chatHelpers";

describe("attachmentKind", () => {
  it("classifies by mime and filename", () => {
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("video/mp4")).toBe("video");
    expect(attachmentKind("application/pdf")).toBe("file");
    expect(attachmentKind("", "photo.png")).toBe("image");
    expect(attachmentKind("", "clip.mp4")).toBe("video");
    expect(attachmentKind("", "deck.pptx")).toBe("file");
  });
});

describe("historyMessages attachments", () => {
  it("keeps user messages whose only payload is an uploaded attachment", () => {
    const rows = [
      {
        role: "user",
        content: [{ type: "text", text: "查收" }],
        inbound_attachments: [
          {
            filename: "plan.docx",
            media_type:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            path: "inbound/1/plan.docx",
            workspace_path: "inbound/1/plan.docx",
            url: "/api/agents/a1/workspace/download?path=inbound/1/plan.docx",
            access_url:
              "/api/agents/a1/workspace/download?path=inbound/1/plan.docx",
          },
        ],
      },
    ];
    const messages = historyMessages(rows);
    expect(messages).toHaveLength(1);
    expect(messages[0].attachments).toEqual([
      {
        kind: "file",
        url: "/api/agents/a1/workspace/download?path=inbound/1/plan.docx",
        filename: "plan.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
  });

  it("folds agent tool artifacts into the surrounding assistant bubble", () => {
    const rows = [
      { role: "assistant", content: "报告生成好了" },
      {
        role: "tool",
        content: [
          {
            type: "tool_result",
            id: "call_1",
            name: "send_file_to_user",
            output: "sent",
            artifact: {
              type: "file",
              path: "outbound/报告.pptx",
              source: {
                type: "url",
                url: "file:///data/outbound/报告.pptx",
                media_type:
                  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              },
              filename: "报告.pptx",
            },
          },
        ],
      },
    ];
    const messages = historyMessages(rows, "a1");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].attachments?.[0].url).toBe(
      "/api/agents/a1/workspace/download?path=outbound%2F%E6%8A%A5%E5%91%8A.pptx",
    );
    expect(messages[0].attachments?.[0].filename).toBe("报告.pptx");
  });

  it("dedupes identical attachments", () => {
    const merged = mergeAttachments(
      [{ kind: "image", url: "u1", filename: "a.png", mediaType: "image/png" }],
      [
        { kind: "image", url: "u1", filename: "a.png", mediaType: "image/png" },
        { kind: "file", url: "u2", filename: "b.pdf" },
      ],
    );
    expect(merged).toHaveLength(2);
  });
});

describe("bytesToBase64", () => {
  it("encodes beyond the spread-call limit", () => {
    const bytes = new Uint8Array(0x10000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes.buffer);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});

describe("attachmentsFromInbound / tool content", () => {
  it("returns empty for missing payloads", () => {
    expect(attachmentsFromInbound({})).toEqual([]);
    expect(attachmentsFromToolContent("nope")).toEqual([]);
    expect(attachmentsFromToolContent([{ type: "tool_result" }], "a1")).toEqual(
      [],
    );
  });
});

describe("attachmentsFromToolContent shapes", () => {
  it("accepts the media block as the tool_result output object", () => {
    const attachments = attachmentsFromToolContent(
      [
        {
          type: "tool_result",
          id: "c1",
          name: "send_file_to_user",
          output: {
            type: "file",
            path: "outbound/notes.txt",
            filename: "notes.txt",
            media_type: "text/plain",
          },
        },
      ],
      "a1",
    );
    expect(attachments).toEqual([
      {
        kind: "file",
        url: "/api/agents/a1/workspace/download?path=outbound%2Fnotes.txt",
        filename: "notes.txt",
        mediaType: "text/plain",
      },
    ]);
  });

  it("accepts output as a JSON string of content blocks with preview_url", () => {
    const attachments = attachmentsFromToolContent(
      [
        {
          type: "tool_result",
          output: JSON.stringify([
            {
              type: "image",
              preview_url:
                "/api/agents/a1/media/preview?source=outbound%2Fshot.png&mime_type=image/png",
              filename: "shot.png",
            },
          ]),
        },
      ],
      "a1",
    );
    expect(attachments[0].url).toBe(
      "/api/agents/a1/media/preview?source=outbound%2Fshot.png&mime_type=image/png",
    );
    expect(attachments[0].kind).toBe("image");
  });

  it("harvests media URLs in rewritten plain-text output", () => {
    const attachments = attachmentsFromToolContent(
      [
        {
          type: "tool_result",
          output:
            "image: /api/agents/a1/media/preview?source=outbound%2Fclip.mp4&mime_type=video/mp4",
        },
      ],
      "a1",
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("clip.mp4");
    expect(attachments[0].kind).toBe("video");
  });

  it("ignores tool_result blocks without media", () => {
    expect(
      attachmentsFromToolContent(
        [
          { type: "tool_result", output: "ok" },
          { type: "tool_result", output: {} },
          { type: "text", text: "nope" },
        ],
        "a1",
      ),
    ).toEqual([]);
  });
});
