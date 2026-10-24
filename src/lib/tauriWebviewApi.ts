import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

export type PetWebviewWindow = ReturnType<typeof getCurrentWebviewWindow>;

export function getPetWebviewWindow(): PetWebviewWindow {
  return getCurrentWebviewWindow();
}

// Windows `startDragging` enters the OS move loop (`WM_NCLBUTTONDOWN` /
// `HTCAPTION`). DWM then snapshots the 160×160 HWND with an opaque white
// client brush — WebView2 alpha is not in that preview. Move the window
// ourselves with `setPosition` instead.
export function petUsesManualDrag(): boolean {
  return /Windows/i.test(navigator.userAgent);
}

// Manual motion is a Windows-only workaround. On macOS the JS drag loop fights
// the async `onMoved` reports (flicker) and pointer capture can swallow input,
// so macOS uses the native drag loop instead.
export function petSupportsManualMotion(): boolean {
  return petUsesManualDrag();
}

export async function clearPetWebviewChrome(
  win: PetWebviewWindow = getPetWebviewWindow(),
): Promise<void> {
  // Windows: setShadow/setBackgroundColor rewrite HWND styles and bring back
  // the title bar. Chrome is owned by the native DWM path.
  if (petUsesManualDrag()) {
    return;
  }
  await Promise.all([
    win.setShadow(false).catch(() => undefined),
    win.setBackgroundColor([0, 0, 0, 0]).catch(() => undefined),
  ]);
}

export async function setPetWebviewPosition(
  x: number,
  y: number,
): Promise<void> {
  await getPetWebviewWindow()
    .setPosition(new PhysicalPosition(x, y))
    .catch((error) => console.error("恢复宠物位置失败", error));
}

export async function setPetWebviewLogicalPosition(
  x: number,
  y: number,
): Promise<void> {
  await getPetWebviewWindow()
    .setPosition(new LogicalPosition(x, y))
    .catch((error) => console.error("移动宠物位置失败", error));
}

export async function setPetWebviewLogicalSize(size: number): Promise<void> {
  // A non-resizable window rejects content-size changes on some platforms
  // (the pet renders with resizable: false), so flip the flag for the resize
  // command itself.
  const win = getPetWebviewWindow();
  await win.setResizable(true).catch(() => undefined);
  await win
    .setSize(new LogicalSize(size, size))
    .catch((error) => console.error("调整宠物大小失败", error));
  await win.setResizable(false).catch(() => undefined);
}

export async function startPetWebviewDrag(): Promise<void> {
  await getPetWebviewWindow()
    .startDragging()
    .catch((error) => console.error("开始拖动失败", error));
}

export async function onPetWebviewMoved(
  handler: (position: { x: number; y: number }) => void,
): Promise<() => void> {
  return getPetWebviewWindow().onMoved(({ payload }) => handler(payload));
}

export async function onPetWebviewFocusChanged(
  handler: () => void,
): Promise<() => void> {
  return getPetWebviewWindow().onFocusChanged(handler);
}
