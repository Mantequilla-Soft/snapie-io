'use client';
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SnapieRush } from "./SnapieRush";
import type { SnapieControls, SnapieOptions } from "./types";

export type SnapieRushHandle = SnapieControls & { destroy: () => void };

/** Mount Snapie Rush into any DOM element, for non-React hosts. */
export function mountSnapieRush(element: HTMLElement, options: SnapieOptions = {}): SnapieRushHandle {
  const ref = createRef<SnapieControls>();
  const root: Root = createRoot(element);
  root.render(<SnapieRush ref={ref} {...options} />);

  return {
    start: (startStage?: number) => ref.current?.start(startStage),
    pause: () => ref.current?.pause(),
    resume: () => ref.current?.resume(),
    reset: () => ref.current?.reset(),
    getPhase: () => ref.current?.getPhase() ?? "idle",
    getHud: () => ref.current?.getHud() ?? null,
    destroy: () => {
      setTimeout(() => root.unmount(), 0);
    },
  };
}
