'use client';

import { Box } from '@chakra-ui/react';
import { HOME_RIGHT_SIDEBAR_WIDTH, homeRightSidebarFrame } from '@/lib/layout/homeSidebarSlot';

/** Reserved column while the sidebar chunk is still waiting on the LCP photo. */
export default function HomeRightSidebarSlot() {
  return (
    <Box
      as="aside"
      aria-hidden
      data-home-sidebar-slot=""
      data-sidebar-width={HOME_RIGHT_SIDEBAR_WIDTH}
      {...homeRightSidebarFrame}
    />
  );
}
