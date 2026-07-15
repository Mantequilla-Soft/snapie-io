'use client';
import { useEffect } from 'react';
import { useToast } from '@chakra-ui/react';
import { POINTS_EARNED_EVENT, PointsEarnedDetail } from '@/lib/points/client';

/** Listens for points-earned events (dispatched by lib/points/client) and shows
 *  a small "+N Snapie Points" toast. Mounted once, globally, in LayoutContent.
 *  Rendering it is already gated there behind the points allowlist. */
export default function PointsToaster() {
  const toast = useToast();

  useEffect(() => {
    const onEarned = (e: Event) => {
      const detail = (e as CustomEvent<PointsEarnedDetail>).detail;
      if (!detail || detail.awarded <= 0) return;
      toast({
        title: `+${detail.awarded} Snapie Points`,
        description: `Balance: ${detail.balance}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'bottom-right',
      });
    };
    window.addEventListener(POINTS_EARNED_EVENT, onEarned);
    return () => window.removeEventListener(POINTS_EARNED_EVENT, onEarned);
  }, [toast]);

  return null;
}
