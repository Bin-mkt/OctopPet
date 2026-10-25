// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import MessageAttachments from "./MessageAttachments";

const mocks = vi.hoisted(() => ({
  fetchAttachmentBlob: vi.fn(),
  saveAttachment: vi.fn(),
}));

vi.mock("../lib/octopHttp", () => ({
  fetchAttachmentBlob: mocks.fetchAttachmentBlob,
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: { saveAttachment: mocks.saveAttachment },
}));

const context = { baseUrl: "http://octop.local", token: "tok" };

/** jsdom lacks Blob.arrayBuffer, so the tests hand over a minimal stand-in. */
class FakeBlob {
  private text: string;
  constructor(text: string) {
    this.text = text;
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(new TextEncoder().encode(this.text).buffer);
  }
}

beforeAll(() => {
  // jsdom does not implement object URLs.
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () =>
    "blob:preview";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () =>
    undefined;
});

afterEach(() => cleanup());
beforeEach(() => {
  mocks.fetchAttachmentBlob.mockReset();
  mocks.saveAttachment.mockReset();
});

describe("MessageAttachments", () => {
  it("renders a download card for agent-pushed files", () => {
    render(
      <MessageAttachments
        context={context}
        attachments={[
          {
            kind: "file",
            url: "http://octop.local/api/agents/a1/workspace/download?path=r.pdf",
            filename: "报告.pdf",
            mediaType: "application/pdf",
          },
        ]}
      />,
    );
    expect(screen.getByText("报告.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeInTheDocument();
  });

  it("saves the file through the Rust command on click", async () => {
    mocks.fetchAttachmentBlob.mockResolvedValue(
      new FakeBlob("hello") as unknown as Blob,
    );
    mocks.saveAttachment.mockResolvedValue(undefined);
    render(
      <MessageAttachments
        context={context}
        attachments={[
          {
            kind: "file",
            url: "http://octop.local/api/agents/a1/workspace/download?path=r.pdf",
            filename: "报告.pdf",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    await waitFor(() =>
      expect(mocks.saveAttachment).toHaveBeenCalledWith(
        // base64 of "hello"
        "aGVsbG8=",
        "报告.pdf",
      ),
    );
    expect(mocks.fetchAttachmentBlob).toHaveBeenCalledWith(
      "http://octop.local",
      "tok",
      "http://octop.local/api/agents/a1/workspace/download?path=r.pdf",
    );
  });

  it("shows an inline preview for image attachments", async () => {
    mocks.fetchAttachmentBlob.mockResolvedValue(
      new FakeBlob("png-bytes") as unknown as Blob,
    );
    render(
      <MessageAttachments
        context={context}
        attachments={[
          {
            kind: "image",
            url: "http://octop.local/api/agents/a1/media/preview?source=shot.png",
            filename: "shot.png",
            mediaType: "image/png",
          },
        ]}
      />,
    );
    const image = await screen.findByAltText("shot.png");
    expect(image).toBeInTheDocument();
    expect(image.getAttribute("src")).toBe("blob:preview");
  });

  it("reports a download failure inline", async () => {
    mocks.fetchAttachmentBlob.mockRejectedValue(new Error("401 未授权"));
    render(
      <MessageAttachments
        context={context}
        attachments={[
          {
            kind: "file",
            url: "http://octop.local/api/agents/a1/workspace/download?path=x.mp4",
            filename: "clip.mp4",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    await waitFor(() =>
      expect(screen.getByText("401 未授权")).toBeInTheDocument(),
    );
  });

  it("renders nothing without attachments", () => {
    const { container } = render(
      <MessageAttachments context={context} attachments={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

afterAll(() => {
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
});
