import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  LogicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

import {
  clearPetWebviewChrome,
  petSupportsManualMotion,
  petUsesManualDrag,
} from "./tauriWebviewApi";

describe("petUsesManualDrag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true on Windows user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    });
    expect(petUsesManualDrag()).toBe(true);
  });

  it("is false on macOS user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    expect(petUsesManualDrag()).toBe(false);
    // Manual motion is a Windows-only workaround; macOS uses start_dragging.
    expect(petSupportsManualMotion()).toBe(false);
  });
});

describe("clearPetWebviewChrome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not rewrite HWND chrome from the webview on Windows", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    });
    const win = {
      setShadow: vi.fn().mockResolvedValue(undefined),
      setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    };

    await clearPetWebviewChrome(win as never);

    expect(win.setShadow).not.toHaveBeenCalled();
    expect(win.setBackgroundColor).not.toHaveBeenCalled();
  });

  it("clears window background on macOS", async () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    const win = {
      setShadow: vi.fn().mockResolvedValue(undefined),
      setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    };

    await clearPetWebviewChrome(win as never);

    expect(win.setBackgroundColor).toHaveBeenCalledWith([0, 0, 0, 0]);
    expect(win.setShadow).toHaveBeenCalledWith(false);
  });
});
