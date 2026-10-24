import { useEffect, useRef, useState } from "react";

import MascotImage from "../components/MascotImage";
import { DEFAULT_APP_CONFIG, MASCOT_SRC } from "../lib/configLogic";
import { showPetContextMenu } from "../lib/petContextMenu";
import { tauriApi } from "../lib/tauriApi";
import {
  clearPetWebviewChrome,
  getPetWebviewWindow,
  onPetWebviewFocusChanged,
  onPetWebviewMoved,
  petSupportsManualMotion,
  setPetWebviewLogicalSize,
  setPetWebviewPosition,
  startPetWebviewDrag,
} from "../lib/tauriWebviewApi";
import type { AppConfig, MascotId } from "../lib/types";

const CLICK_MOVE_THRESHOLD = 4;
const MIN_PET_SIZE = 80;
const MAX_PET_SIZE = 224;
const GLIDE_STOP_SPEED = 0.02;
const GLIDE_MAX_SPEED = 1.4;
const GLIDE_FRICTION_PER_FRAME = 0.88;

interface PointerSample {
  x: number;
  y: number;
  time: number;
}

function clearPetSelection() {
  window.getSelection()?.removeAllRanges();
}

function clampPetSize(size: number) {
  return Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, Math.round(size)));
}

/**
 * Pet coordinates are physical pixels everywhere: `onMoved` reports them and
 * the config stores them. Pointer events are CSS (logical) pixels, so the drag
 * math must scale by the device pixel ratio before doing arithmetic.
 */
function petScale(): number {
  return window.devicePixelRatio || 1;
}

export default function PetWindow() {
  const [mascotId, setMascotId] = useState<MascotId>(
    DEFAULT_APP_CONFIG.mascotId,
  );
  const configRef = useRef<AppConfig>(DEFAULT_APP_CONFIG);
  const pointerDownRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const lastPointerClientRef = useRef({ x: 0, y: 0 });
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const pointerSamplesRef = useRef<PointerSample[]>([]);
  const glideFrameRef = useRef<number | null>(null);
  const petSizeRef = useRef(DEFAULT_APP_CONFIG.petSize);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, size: 160 });
  const movedSincePointerDownRef = useRef(false);
  const dragStartedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastOpenAtRef = useRef(0);
  const screenBoundsRef = useRef<Array<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }> | null>(null);

  useEffect(() => {
    const appWindow = getPetWebviewWindow();
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const registerUnlistener = (unlisten: () => void) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };

    const initialize = async () => {
      await clearPetWebviewChrome(appWindow);

      const config = await tauriApi.loadConfig().catch((error) => {
        console.error("加载宠物配置失败", error);
        return DEFAULT_APP_CONFIG;
      });
      if (disposed) return;

      configRef.current = config;
      setMascotId(config.mascotId);
      petSizeRef.current = clampPetSize(config.petSize);
      await setPetWebviewLogicalSize(petSizeRef.current);

      if (config.petX !== null && config.petY !== null) {
        let x = config.petX;
        let y = config.petY;
        // Heal positions that were saved off-screen (physical pixels) —
        // the Rust side accepts them only when a monitor still contains them.
        try {
          [x, y] = await tauriApi.clampPetRestorePosition(
            config.petX,
            config.petY,
            petSizeRef.current * petScale(),
          );
        } catch (error) {
          console.error("校验宠物位置失败", error);
        }
        if (disposed) return;
        lastPositionRef.current = { x, y };
        await setPetWebviewPosition(x, y);
      } else {
        // Seed the drag origin from the real window so the first drag does
        // not jump when no position was persisted yet.
        const origin = await Promise.resolve(appWindow.outerPosition?.()).catch(
          () => null,
        );
        if (disposed) return;
        if (origin) {
          lastPositionRef.current = { x: origin.x, y: origin.y };
        }
      }
      if (disposed) return;

      await tauriApi
        .listenMascotChanged((payload) => {
          configRef.current = { ...configRef.current, mascotId: payload };
          setMascotId(payload);
        })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物切换失败", error));
      if (disposed) return;

      await onPetWebviewFocusChanged(() => {
        void clearPetWebviewChrome(appWindow);
      })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物焦点失败", error));
      if (disposed) return;

      await onPetWebviewMoved((position) => {
        if (pointerDownRef.current) {
          movedSincePointerDownRef.current = true;
        }

        const updatedConfig = {
          ...configRef.current,
          petX: position.x,
          petY: position.y,
        };
        lastPositionRef.current = position;
        configRef.current = updatedConfig;
        if (positionSaveTimerRef.current !== null) {
          clearTimeout(positionSaveTimerRef.current);
        }
        positionSaveTimerRef.current = setTimeout(() => {
          positionSaveTimerRef.current = null;
          saveQueueRef.current = saveQueueRef.current
            .then(() =>
              tauriApi.patchConfig({
                petX: position.x,
                petY: position.y,
              }),
            )
            .catch((error) => console.error("保存宠物位置失败", error));
        }, 120);
      })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物位置失败", error));

      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          void clearPetWebviewChrome(appWindow);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      registerUnlistener(() =>
        document.removeEventListener("visibilitychange", onVisibility),
      );
    };

    const onSelectStart = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", onSelectStart);
    registerUnlistener(() =>
      document.removeEventListener("selectstart", onSelectStart),
    );

    void initialize();

    return () => {
      disposed = true;
      if (glideFrameRef.current !== null) {
        cancelAnimationFrame(glideFrameRef.current);
      }
      if (positionSaveTimerRef.current !== null) {
        clearTimeout(positionSaveTimerRef.current);
      }
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
    clearPetSelection();
    pointerDownRef.current = true;
    movedSincePointerDownRef.current = false;
    dragStartedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    // Measure motion against the window's own CSS viewport and scale by its
    // current device pixel ratio. Stays correct while the pet is dragged
    // between mixed-DPI displays; absolute screenX would jump at the seam.
    lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
    // Inertia samples track the window origin (physical px) so the glide
    // reflects how the pet actually moved, not just the pointer.
    pointerSamplesRef.current = [
      {
        x: lastPositionRef.current.x,
        y: lastPositionRef.current.y,
        time: performance.now(),
      },
    ];
    void tauriApi
      .petScreenBounds()
      .then((rects) => {
        screenBoundsRef.current = rects.map((rect) => {
          const [x, y, width, height] = rect;
          return { left: x, top: y, right: x + width, bottom: y + height };
        });
      })
      .catch((error) => console.error("读取显示器边界失败", error));
    if (petSupportsManualMotion() && event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerDownRef.current) return;

    const distance = Math.hypot(
      event.clientX - pointerStartRef.current.x,
      event.clientY - pointerStartRef.current.y,
    );
    if (distance <= CLICK_MOVE_THRESHOLD && !dragStartedRef.current) return;

    movedSincePointerDownRef.current = true;
    if (petSupportsManualMotion()) {
      dragStartedRef.current = true;
      // Accumulate the origin incrementally so each event is scaled by the
      // ratio of the screen the pet is currently on.
      const scale = petScale();
      const position = {
        x:
          lastPositionRef.current.x +
          (event.clientX - lastPointerClientRef.current.x) * scale,
        y:
          lastPositionRef.current.y +
          (event.clientY - lastPointerClientRef.current.y) * scale,
      };
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      lastPositionRef.current = position;
      const now = performance.now();
      pointerSamplesRef.current = [
        ...pointerSamplesRef.current.filter(
          (sample) => now - sample.time <= 100,
        ),
        { x: position.x, y: position.y, time: now },
      ].slice(-6);
      void setPetWebviewPosition(position.x, position.y);
      return;
    }
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    void startPetWebviewDrag();
  };

  const startGlide = () => {
    const samples = pointerSamplesRef.current;
    if (samples.length < 2) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = Math.max(1, last.time - first.time);
    let vx = (last.x - first.x) / elapsed;
    let vy = (last.y - first.y) / elapsed;
    // Samples are physical pixels, so the speed limits must scale too.
    const scale = petScale();
    const stopSpeed = GLIDE_STOP_SPEED * scale;
    const maxSpeed = GLIDE_MAX_SPEED * scale;
    const speed = Math.hypot(vx, vy);
    if (speed < stopSpeed) return;
    if (speed > maxSpeed) {
      const scaleDown = maxSpeed / speed;
      vx *= scaleDown;
      vy *= scaleDown;
    }

    let previousTime = performance.now();
    const step = (now: number) => {
      const elapsedMs = Math.min(32, now - previousTime);
      previousTime = now;
      const friction = Math.pow(
        GLIDE_FRICTION_PER_FRAME,
        elapsedMs / (1000 / 60),
      );
      vx *= friction;
      vy *= friction;
      let position = {
        x: lastPositionRef.current.x + vx * elapsedMs,
        y: lastPositionRef.current.y + vy * elapsedMs,
      };
      const size = petSizeRef.current * scale;
      // Keep the glide inside the display the pet is currently on; a fast
      // flick must not park it invisible in the gap between monitors.
      const current = lastPositionRef.current;
      let bounds = screenBoundsRef.current;
      if (!bounds || bounds.length === 0) {
        const desktop = window.screen as Screen & {
          availLeft?: number;
          availTop?: number;
        };
        bounds = [
          {
            left: (desktop.availLeft ?? 0) * scale,
            top: (desktop.availTop ?? 0) * scale,
            right:
              (desktop.availLeft ?? 0) * scale + desktop.availWidth * scale,
            bottom:
              (desktop.availTop ?? 0) * scale + desktop.availHeight * scale,
          },
        ];
      }
      const host = bounds.find(
        (boundsOf) =>
          current.x >= boundsOf.left &&
          current.x < boundsOf.right &&
          current.y >= boundsOf.top &&
          current.y < boundsOf.bottom,
      );
      if (host) {
        const clamped = {
          x: Math.min(host.right - size, Math.max(host.left, position.x)),
          y: Math.min(host.bottom - size, Math.max(host.top, position.y)),
        };
        if (clamped.x !== position.x) vx = 0;
        if (clamped.y !== position.y) vy = 0;
        position = clamped;
      }
      lastPositionRef.current = position;
      void setPetWebviewPosition(position.x, position.y);

      if (Math.hypot(vx, vy) > GLIDE_STOP_SPEED * petScale()) {
        glideFrameRef.current = requestAnimationFrame(step);
      } else {
        glideFrameRef.current = null;
        void clearPetWebviewChrome(getPetWebviewWindow());
      }
    };
    glideFrameRef.current = requestAnimationFrame(step);
  };

  const endPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStartedRef.current) {
      void clearPetWebviewChrome(getPetWebviewWindow());
      if (petSupportsManualMotion()) {
        startGlide();
      }
    }
    pointerDownRef.current = false;
    dragStartedRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
    resizingRef.current = true;
    resizeStartRef.current = {
      x: event.screenX,
      y: event.screenY,
      size: petSizeRef.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!resizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = Math.max(
      event.screenX - resizeStartRef.current.x,
      event.screenY - resizeStartRef.current.y,
    );
    const size = clampPetSize(resizeStartRef.current.size + delta);
    if (size === petSizeRef.current) return;
    petSizeRef.current = size;
    void setPetWebviewLogicalSize(size);
  };

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const petSize = petSizeRef.current;
    configRef.current = { ...configRef.current, petSize };
    void tauriApi
      .patchConfig({ petSize })
      .catch((error) => console.error("保存宠物大小失败", error));
  };

  const handleClick = () => {
    pointerDownRef.current = false;
    clearPetSelection();
    if (movedSincePointerDownRef.current) return;

    const now = Date.now();
    if (now - lastOpenAtRef.current < 400) return;
    lastOpenAtRef.current = now;

    void tauriApi
      .showChatNearPet()
      .catch((error) => console.error("打开聊天窗口失败", error));
  };

  return (
    <main
      className="pet-window"
      data-testid="pet-drag-region"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={endPointer}
      onPointerUp={endPointer}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        clearPetSelection();
      }}
      onDragStart={(event) => event.preventDefault()}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void showPetContextMenu().catch((error) =>
          console.error("打开桌宠菜单失败", error),
        );
      }}
    >
      <MascotImage src={MASCOT_SRC[mascotId]} />
      <button
        className="pet-resize-handle"
        type="button"
        aria-label="调整宠物大小"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </main>
  );
}
