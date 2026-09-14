'use client';
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SnapieBlast } from "./SnapieBlast";
import type { SnapieControls, SnapieOptions } from "./types";

export type MountedSnapieBlast = SnapieControls & { destroy: () => void };

/** Mount Snapie Blast into any DOM element from a non-React host. */
export function mountSnapieBlast(element: HTMLElement, options: SnapieOptions = {}): MountedSnapieBlast {
  const ref = createRef<SnapieControls>();
  const root: Root = createRoot(element);
  root.render(<SnapieBlast ref={ref} {...options} />);

  return {
    start: (stage) => ref.current?.start(stage),
    pause: () => ref.current?.pause(),
    resume: () => ref.current?.resume(),
    reset: () => ref.current?.reset(),
    getPhase: () => ref.current?.getPhase() ?? "ready",
    getHud: () => ref.current?.getHud() ?? null,
    destroy: () => root.unmount(),
  };
}
