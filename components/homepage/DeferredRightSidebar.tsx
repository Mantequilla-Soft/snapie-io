'use client';

import { Box } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { afterLcpPaint } from '@/lib/perf/afterLcpPaint';
import { RIGHT_SIDEBAR_WIDTH } from '@/components/layout/rightSidebarWidth';

const RightSidebar = dynamic(() => import('@/components/layout/RightSideBar'), { ssr: false });

/** Right column waits until the LCP image has painted, and never mounts
 *  below the md breakpoint. Phones were downloading Swiper for a column
 *  that stays display:none. The empty slot keeps that width on desktop
 *  from the first effect, before the chunk arrives. */
export default function DeferredRightSidebar({ engagedAuthors }: { engagedAuthors: Set<string> }) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 48em)');
    let cancel = false;
    const apply = () => {
      setIsDesktop(mq.matches);
      if (!mq.matches) {
        setReady(false);
        return;
      }
      afterLcpPaint().then(() => {
        if (!cancel && mq.matches) setReady(true);
      });
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      cancel = true;
      mq.removeEventListener('change', apply);
    };
  }, []);
  if (!isDesktop) return null;
  if (!ready) {
    return (
      <Box
        aria-hidden
        data-testid="right-sidebar-slot"
        display={{ base: 'none', md: 'block' }}
        w={{ base: '100%', md: RIGHT_SIDEBAR_WIDTH }}
        flexShrink={0}
      />
    );
  }
  return <RightSidebar engagedAuthors={engagedAuthors} />;
}
