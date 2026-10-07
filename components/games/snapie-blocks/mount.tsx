'use client';

import { createRoot, type Root } from 'react-dom/client';
import { SnapieBlocksMatch } from './SnapieBlocksMatch';

export interface SnapieBlocksHandle {
  destroy: () => void;
}

/** Mount a guest Snapie Blocks match into any DOM element. */
export function mountSnapieBlocks(element: HTMLElement, username?: string | null): SnapieBlocksHandle {
  const root: Root = createRoot(element);
  root.render(<SnapieBlocksMatch username={username ?? null} />);
  return {
    destroy: () => {
      setTimeout(() => root.unmount(), 0);
    },
  };
}
