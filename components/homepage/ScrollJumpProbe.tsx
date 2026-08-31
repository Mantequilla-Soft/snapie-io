'use client';
import { Box } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

/**
 * Temporary diagnostic for the mobile "feed jumps back up" bug — rendered
 * only when the page URL carries ?scrolldebug=1, invisible otherwise.
 *
 * Watches the feed's scroll container and freezes a short on-screen log of
 * the events that matter to scroll-position bugs, so a phone user can simply
 * read back what happened at the moment of a jump:
 *  - JUMP:   scrollTop moved up >250px in a single scroll event
 *  - RESIZE: a direct child of the scroll container changed height
 *  - ADD/RM: a node was inserted into / removed from the container
 */
export default function ScrollJumpProbe({ scrollableId }: { scrollableId: string }) {
  const [lines, setLines] = useState<string[]>(['probe active']);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = document.getElementById(scrollableId);
    if (!el) return;

    const log: string[] = [];
    const push = (s: string) => {
      log.unshift(`${new Date().toISOString().slice(14, 23)} ${s}`);
      if (log.length > 7) log.pop();
      setLines([...log]);
    };

    const labelOf = (n: Element): string => {
      const html = n as HTMLElement;
      if (html.id) return `#${html.id}`;
      if (html.dataset?.testid) return `[${html.dataset.testid}]`;
      const cls = typeof html.className === 'string' ? html.className.split(' ')[0].slice(0, 20) : '';
      return `${n.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };

    let lastTop = el.scrollTop;
    let ticking = false;
    const onScroll = () => {
      const now = el.scrollTop;
      const delta = now - lastTop;
      if (delta < -250) {
        push(`JUMP up ${Math.round(-delta)}px (${Math.round(lastTop)}->${Math.round(now)}) sh=${el.scrollHeight}`);
      }
      lastTop = now;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { setScrollTop(Math.round(el.scrollTop)); ticking = false; });
      }
    };
    el.addEventListener('scroll', onScroll);

    const heights = new Map<Element, number>();
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.round(entry.target.getBoundingClientRect().height);
        const prev = heights.get(entry.target);
        heights.set(entry.target, h);
        if (prev !== undefined && Math.abs(h - prev) > 8) {
          push(`RESIZE ${labelOf(entry.target)} ${prev}->${h}`);
        }
      }
    });
    const observeChildren = () => {
      for (const child of Array.from(el.children)) {
        if (!heights.has(child)) resizeObserver.observe(child);
      }
    };
    observeChildren();

    const mutationObserver = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of Array.from(m.addedNodes)) {
          if (n.nodeType === 1) push(`ADD ${labelOf(n as Element)}`);
        }
        for (const n of Array.from(m.removedNodes)) {
          if (n.nodeType === 1) push(`RM ${labelOf(n as Element)}`);
        }
      }
      observeChildren(); // pick up resize-watching any newly added children
    });
    mutationObserver.observe(el, { childList: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollableId]);

  return (
    <Box
      position="fixed"
      bottom="70px"
      left={0}
      right={0}
      zIndex={10000}
      bg="blackAlpha.800"
      color="#7CFC00"
      fontFamily="mono"
      fontSize="10px"
      px={2}
      py={1}
      pointerEvents="none"
      whiteSpace="pre-wrap"
      lineHeight="1.35"
    >
      {`scrollTop=${scrollTop}\n${lines.join('\n')}`}
    </Box>
  );
}
