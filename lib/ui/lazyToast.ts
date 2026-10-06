import type { UseToastOptions } from '@chakra-ui/react';

/**
 * Chakra's useToast pulls the toast transition (framer-motion) into the
 * first-load graph. Vote and edit errors can wait for that chunk.
 */
export function lazyToast(options: UseToastOptions): void {
  void import('@/lib/ui/lazyToastImpl').then((mod) => mod.showToast(options));
}
