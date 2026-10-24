// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistantMarkdown from "./AssistantMarkdown";
import ErrorGate from "./ErrorGate";

afterEach(() => cleanup());

describe("AssistantMarkdown", () => {
  it("autolinks email addresses in plain text", () => {
    render(<AssistantMarkdown content="联系我 user@example.com 谢谢" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "mailto:user@example.com");
    expect(link).toHaveTextContent("user@example.com");
  });

  it("autolinks bare URLs in plain text", () => {
    render(<AssistantMarkdown content="see https://octop.example/docs" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://octop.example/docs");
  });
});

describe("ErrorGate", () => {
  it("renders children while they are healthy", () => {
    render(
      <ErrorGate label="chat">
        <p>loaded</p>
      </ErrorGate>,
    );
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("shows a fallback instead of unmounting on a render crash", () => {
    function Bomb(): never {
      throw new Error("boom");
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorGate label="chat">
        <Bomb />
      </ErrorGate>,
    );
    expect(screen.getByText("窗口渲染出错了")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载窗口" }),
    ).toBeInTheDocument();
  });
});
