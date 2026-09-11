'use client';
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PuffQuest } from "./PuffQuest";
import type { PuffQuestControls, PuffQuestOptions } from "./types";

export type PuffQuestInstance = PuffQuestControls & { destroy: () => void };

/**
 * Mount the game into any DOM element, from any framework (or plain JS).
 *
 *   const game = mountPuffQuest(document.getElementById('game')!, {
 *     playerName: 'alice',
 *     sessionId: matchId,
 *     autoStart: true,
 *     onResult: (r) => postToChain(r),
 *   });
 *   // later: game.pause(); game.destroy();
 */
export function mountPuffQuest(element: HTMLElement, options: PuffQuestOptions = {}): PuffQuestInstance {
  const ref = createRef<PuffQuestControls>();
  const root: Root = createRoot(element);
  root.render(<PuffQuest ref={ref} {...options} />);

  const call = <K extends keyof PuffQuestControls>(key: K) =>
    ((...args: unknown[]) => (ref.current?.[key] as (...a: unknown[]) => unknown)?.(...args)) as PuffQuestControls[K];

  return {
    start: call("start"),
    pause: call("pause"),
    resume: call("resume"),
    reset: call("reset"),
    getPhase: call("getPhase"),
    getHud: call("getHud"),
    destroy: () => {
      ref.current?.pause();
      queueMicrotask(() => root.unmount());
    },
  };
}
