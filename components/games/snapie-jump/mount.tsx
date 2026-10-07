'use client';
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SnapieJump, type SnapieJumpProps } from "./SnapieJump";
import type { SnapieControls } from "./types";

export type SnapieJumpHandle = SnapieControls & { destroy: () => void };

/** Mount Snapie Jump into any DOM element (give it a width/height), for non-React hosts. */
export function mountSnapieJump(element: HTMLElement, options: SnapieJumpProps = {}): SnapieJumpHandle {
  const ref = createRef<SnapieControls>();
  const root: Root = createRoot(element);
  root.render(<SnapieJump ref={ref} {...options} />);
  return {
    start: () => ref.current?.start(),
    pause: () => ref.current?.pause(),
    resume: () => ref.current?.resume(),
    reset: () => ref.current?.reset(),
    getPhase: () => ref.current?.getPhase() ?? "idle",
    getHud: () => ref.current?.getHud() ?? null,
    destroy: () => setTimeout(() => root.unmount(), 0),
  };
}
