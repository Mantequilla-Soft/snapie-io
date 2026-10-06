'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { afterLcpPaint } from '@/lib/perf/afterLcpPaint';
import HomeRightSidebarSlot from '@/components/layout/HomeRightSidebarSlot';

type RightSidebarProps = { engagedAuthors: Set<string> };

/** Sidebar JS (post cards, swiper) waits until the LCP image has painted.
 *  On a phone the column is display:none. The slot stays until the module
 *  has loaded: swapping to next/dynamic's empty render drops 300px and the
 *  feed reflow wraps the composer and pushes a card out of the viewport. */
export default function DeferredRightSidebar({ engagedAuthors }: RightSidebarProps) {
  const [SidebarComp, setSidebarComp] = useState<ComponentType<RightSidebarProps> | null>(null);
  useEffect(() => {
    let cancel = false;
    afterLcpPaint()
      .then(() => import('@/components/layout/RightSideBar'))
      .then((mod) => {
        if (!cancel) setSidebarComp(() => mod.default);
      });
    return () => {
      cancel = true;
    };
  }, []);
  if (!SidebarComp) return <HomeRightSidebarSlot />;
  return <SidebarComp engagedAuthors={engagedAuthors} />;
}
