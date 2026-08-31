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
    // h={0}: the banner appears/disappears while the user is mid-scroll (the
    // new-snaps poll fires on its own schedule), and it sits above SnapList
    // inside the scroll container — if it occupied layout height, every
    // appearance would push the whole feed down under the user's finger
    // (part of the mobile "scroll keeps jumping back" bug). Zero-height +
    // overflow lets it float over the feed without ever displacing it.
    <Flex
      justify="center"
      h={0}
      overflow="visible"
      position="sticky"
      top={`${top}px`}
      zIndex={9}
      pointerEvents="none"
    >
      <Button
        mt={2}
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
