'use client';
import { Button, Flex } from '@chakra-ui/react';

interface NewSnapsBannerProps {
  count: number;
  onClick: () => void;
  /** Pixel offset from the top of the scroll container — should equal the
   *  sticky tab strip's rendered height so this docks just below it instead
   *  of overlapping once both are "stuck" while scrolling. */
  top?: number;
}

export default function NewSnapsBanner({ count, onClick, top = 0 }: NewSnapsBannerProps) {
  if (count <= 0) return null;

  return (
    <Flex
      justify="center"
      py={2}
      position="sticky"
      top={`${top}px`}
      zIndex={9}
      pointerEvents="none"
    >
      <Button
        size="sm"
        bg="#1ca1f1"
        color="white"
        borderRadius="full"
        px={5}
        fontWeight="bold"
        boxShadow="0 2px 10px rgba(28, 161, 241, 0.4)"
        _hover={{ bg: '#1a91da' }}
        _active={{ bg: '#1882c4' }}
        onClick={onClick}
        pointerEvents="auto"
      >
        {count === 1 ? '1 new snap' : `${count} new snaps`} — click to view
      </Button>
    </Flex>
  );
}
