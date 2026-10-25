// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import ChatSessionList, { formatSessionTime } from "./ChatSessionList";

afterEach(() => cleanup());

describe("formatSessionTime", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T14:30:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("formats today as HH:mm", () => {
    expect(
      formatSessionTime(new Date("2026-10-25T09:05:00").getTime() / 1000),
    ).toBe("09:05");
  });

  it("formats this week as a weekday", () => {
    expect(
      formatSessionTime(new Date("2026-10-24T18:00:00").getTime() / 1000),
    ).toBe("周六");
    expect(
      formatSessionTime(new Date("2026-10-20T08:00:00").getTime() / 1000),
    ).toBe("周二");
  });

  it("formats older sessions as M月D日", () => {
    expect(
      formatSessionTime(new Date("2026-10-01T08:00:00").getTime() / 1000),
    ).toBe("10月1日");
  });

  it("returns empty for missing timestamps", () => {
    expect(formatSessionTime(0)).toBe("");
    expect(formatSessionTime(-1)).toBe("");
  });
});

describe("ChatSessionList", () => {
  const sessions = [
    {
      threadId: "t1",
      title: "报告整理",
      lastActive: new Date("2026-10-25T10:00:00").getTime() / 1000,
      isActive: true,
      hasMessages: true,
      pinned: true,
    },
    {
      threadId: "t2",
      title: "",
      lastActive: new Date("2026-10-24T16:00:00").getTime() / 1000,
      isActive: false,
      hasMessages: true,
    },
  ];

  it("renders sessions with fallback titles and active highlight", () => {
    const onPick = vi.fn();
    render(
      <ChatSessionList
        sessions={sessions}
        activeThreadId="t1"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("📌 报告整理")).toBeInTheDocument();
    // Empty server titles fall back to 新会话 (dashboard behaviour).
    expect(screen.getByText("新会话")).toBeInTheDocument();
    const active = screen.getByText("📌 报告整理").closest("button");
    expect(active).toHaveClass("is-active");
    fireEvent.click(active as HTMLElement);
    expect(onPick).toHaveBeenCalledWith("t1");
  });

  it("renders empty and loading states", () => {
    const { rerender } = render(
      <ChatSessionList sessions={[]} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText("还没有会话记录")).toBeInTheDocument();
    rerender(
      <ChatSessionList
        sessions={[]}
        loading
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("正在加载会话…")).toBeInTheDocument();
  });

  it("closes from the overlay backdrop or the header button", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ChatSessionList
        sessions={sessions}
        onPick={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(
      container.querySelector(".chat-session-overlay") as HTMLElement,
    );
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "关闭会话列表" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
