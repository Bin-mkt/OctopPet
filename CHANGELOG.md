# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.6] - 2026-10-26

### Fixed

- 附件下载卡在"保存中"：桌宠是无主窗口的 Accessory 应用，系统保存对话框
  （rfd sheet modal）可能根本不弹出，回调永不返回。现在附件直接存入
  `~/Downloads`（自动避免重名），按钮下方显示已保存路径
- 重新打开/退出重进后文件消息消失：历史里的工具结果有多 种服务器形态
  （artifact 对象、output 为媒体块对象、output 为带 preview_url 的 JSON
  字符串或改写后的纯文本 URL），现在全部识别并还原成卡片

### Added

- 会话列表：顶栏新增「会话」按钮，打开后覆盖式列出该 agent 的历史会话
  （标题、时间、当前会话高亮、空标题兜底为"新会话"），点击即切换并加载
  该会话的历史消息；流式输出中切换会先停止当前回合

## [0.2.5] - 2026-10-24

### Added

- Chat conversations now receive files from the agent. `attachment` frames
  (`send_file` / screenshots / generated media) are no longer dropped: images
  preview inline, videos play inline, and every file gets a download card
  that saves through the system save dialog with the token intact
- History reloads keep both sides' attachments: the user's uploaded files
  (`inbound_attachments`) and the agent's produced files (tool artifacts)
  render as cards again instead of vanishing
- Files the user attaches to a message show as cards in their own bubble

## [0.2.4] - 2026-10-24

### Fixed

- macOS 12 chat crash: `remark-gfm` compiles an email autolink regex with a lookbehind assertion, which WebKit rejects (`SyntaxError: invalid group specifier name`) on the first markdown render — the whole chat window unmounted into an empty transparent frame. The dependency is now patched (via `patch-package`, applied on `postinstall`) to drop the lookbehind the same way the URL autolink already worked; the boundary is still enforced by the library's own character check
- Any window that hits a render error now shows an inline error card instead of unmounting into a blank transparent frame that swallows clicks

## [0.2.3] - 2026-10-24

### Fixed

- Pet resize handle works on macOS: the pet window renders with `resizable: false`, which on macOS ignores content-size changes — the handle now lifts the flag for the resize command itself
- macOS chat window: re-asserts the window shadow right after the compact↔expanded resize, which can otherwise stop the transparent webview from compositing (the "empty frame with shadow" state)

### Added

- Diagnostic logging: uncaught JS errors, promise rejections, and window lifecycle probes are recorded to `diagnostics.log` in the app config directory so bug sessions can be reconstructed (capped at 2 MiB, rotates in place)

## [0.2.2] - 2026-10-24

### Fixed

- macOS: dragging the pet no longer flickers — manual JS motion is now reserved for Windows (whose startDragging shows a white HWND); macOS uses the native drag loop, and the Windows manual drag derives each position from the pointer's absolute screen coordinates instead of accumulating deltas against lagging move events
- macOS: the chat window can always be opened again — `show_chat_near_pet` used to fail outright when the pet sat where no monitor reports ownership (the whole command aborted before `show()` ran); it now falls back to the primary screen
- A persisted pet position that leaves the pet mostly off-screen (e.g. a corner sliver) is healed on startup to a visible corner instead of being restored as-is

## [0.2.1] - 2026-10-24

### Fixed

- macOS: dragging the pet no longer throws it off-screen — the drag math mixed CSS logical and physical pixels, saving coordinates far outside the desktop
- A pet last parked off-screen (e.g. left on a disconnected external display) reappears on the primary display instead of staying invisible on startup
- The pet glides to a stop inside the display it started on instead of sliding into the gap between monitors
- Dragging the pet between mixed-DPI displays (retina notebook + regular external screen) no longer jumps at the screen seam

## [0.2.0] - 2026-09-03

### Fixed

- Windows: dragging the pet no longer shows a white square (manual move + skip HWND GDI fill; tao ignores background alpha)
- Windows: clicking the pet no longer restores a titled OS window (skip set_decorations/set_shadow; strip WS_CAPTION in DWM)
- Windows pet window title is empty so no "OctopPet" caption sits above the mascot
- Windows: zero pet non-client area (WM_NCCALCSIZE) so the empty white title strip is gone
- Windows: chat/settings rounded corners no longer flash a white HWND fill on click/focus
- Windows pet and chat/settings use DWM blur-behind (not extend-frame) so the mascot is not a white square
- Clicking the pet no longer flashes a white square over the mascot
- macOS close traffic light shows × on hover and a pressed state
- Clicking the pet again reopens chat beside the icon instead of restoring the last screen position
- Chat window height no longer snaps when starting a new conversation or sending the first message; resize stays bottom-anchored and eases over 360ms
- Model and connector menus stay inside the chat window and scroll instead of growing the OS window
- Queued follow-up turns no longer mark the finished reply as “连接意外断开”
- Saving settings now logs in and stores the token; testing connection also stores the password
- Chat can silently log in with the saved password when the access token is missing
- HTTP errors show the server message (e.g. “认证失败。”) instead of raw JSON
- Connection failures in chat offer a retry button
- Retrying an assistant turn reuses the original text, attachments, and model
- Settings leftover notices no longer linger on other tabs; shortcut hint and mascot labels are clearer
- Tray “检查更新” spacing and pet menu “与 Octop 对话” wording

### Added

- Desktop pet glides to a smooth stop after release and can be resized from its bottom-right hover handle (80–224 px)
- Model and agent popovers grow with the chat window so a tall window can show the full list
- Empty chat shows a gray logo in the message area
- Agent picker uses the same popover as the model list
- Setting to keep chat and settings visible when clicking another app (on by default)
- Settings tabs: 常规 (connection + mascot), 窗口, 快捷键, 关于
- `hooks/useChatController.ts`, `hooks/useWindowChrome.ts` — chat/settings window logic extracted from UI
- `lib/octopTypes.ts`, `lib/tauriWindowApi.ts`, `lib/chatHelpers.ts` — clearer module boundaries
- `components/ChatChrome.tsx`, `components/ChatResizeChrome.tsx`
- `styles/` split CSS (`base`, `pet`, `settings`, `chat`)
- `scripts/sync-version.mjs`, `scripts/extract-changelog.mjs`
- `npm run test:coverage` with baseline thresholds
- Composer unit tests; tray shortcut normalization Rust tests
- Release workflow: tag/version validation + CHANGELOG injection

### Changed

- Chat window starts at 400px and stays resizable; empty compact state fills the window instead of shrink-wrapping
- Sending a message no longer changes chat window height
- Narrow chat windows (~300px) keep the send button on-screen; toolbar chips shrink and wrap
- Debug builds store credentials in a local app-data file so macOS Keychain does not prompt on every rebuild
- Chat and settings close buttons follow the OS: traffic-light dot on the left on macOS, × on the right on Windows and Linux
- Settings window hides after a successful save
- `ChatWindow.tsx` slimmed to layout shell (~90 lines); logic in `useChatController`
- `SettingsWindow` uses shared auto-fit + Escape hooks; events via `tauriApi`
- Removed unused Tauri scaffold `App.tsx`; `index.html` title/icon → OctopPet
- `Composer` imports DTOs from `octopTypes` instead of `octopHttp`

### Removed

- Monolithic `App.css` content (replaced by `src/styles/*` imports)

## [0.1.0] - 2026-08-04

### Added

- Initial release: system tray, floating pet, compact chat, settings window
- Octop HTTP login, agent list, thread resume, WebSocket streaming chat
- OS keyring for password and access token
- Global shortcuts for open pet and open home
- macOS and Windows CI/release workflows

[Unreleased]: https://github.com/jubaoliang/OctopPet/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jubaoliang/OctopPet/releases/tag/v0.2.0
[0.1.0]: https://github.com/jubaoliang/OctopPet/releases/tag/v0.1.0
