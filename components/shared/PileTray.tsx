'use client';
import React, { useEffect, useState } from 'react';
import { Box, Flex, HStack, VStack, Text, Image, Divider } from '@chakra-ui/react';
import { getPile, ITEM_THROWN_EVENT, ItemThrownDetail } from '@/lib/points/marketClient';
import type { PileEntry } from '@/lib/points/marketService';
import type { ItemThrowTargetType } from '@/lib/db/models/ItemThrow';
import ThrowItemButton from '@/components/shared/ThrowItemButton';
import PileThrowersModal from '@/components/shared/PileThrowersModal';
import { ITEM_MARKET_FEATURE_FLAG } from '@/lib/points/config';
import { MAX_THROWERS_PER_ITEM } from '@/lib/points/marketConfig';

interface PileTrayProps {
  author: string;
  permlink: string;
  targetType: ItemThrowTargetType;
}

/** "The Pile" — everything thrown at one post/Snap, plus the button to throw
 *  something yourself. Per-post fetch on mount, same shape as
 *  InteractionBar's reblog-freshening effect. A throw at THIS target
 *  (ITEM_THROWN_EVENT) patches local state directly instead of refetching —
 *  the event only fires on a confirmed server success, so there's nothing to
 *  double-check, and a network round-trip would just be a needless delay
 *  before the thrower sees their own throw land. */
export default function PileTray({ author, permlink, targetType }: PileTrayProps) {
  const [pile, setPile] = useState<PileEntry[]>([]);
  const [selected, setSelected] = useState<PileEntry | null>(null);

  useEffect(() => {
    if (!ITEM_MARKET_FEATURE_FLAG) return;
    getPile(author, permlink).then(setPile);
  }, [author, permlink]);

  useEffect(() => {
    if (!ITEM_MARKET_FEATURE_FLAG) return;
    const onThrown = (e: Event) => {
      const detail = (e as CustomEvent<ItemThrownDetail>).detail;
      if (!detail || detail.targetAuthor !== author || detail.targetPermlink !== permlink) return;

      const thrower = { username: detail.throwerUsername, createdAt: new Date().toISOString(), anonymous: detail.anonymous };
      setPile(prev => {
        const existing = prev.find(entry => entry.item.id === detail.item.id);
        if (!existing) {
          return [{ item: detail.item, count: 1, recentThrowers: [thrower] }, ...prev].sort((a, b) => b.count - a.count);
        }
        return prev
          .map(entry =>
            entry.item.id === detail.item.id
              ? {
                  ...entry,
                  count: entry.count + 1,
                  // Mirror the server's cap (getPile) so the optimistic list
                  // never grows past what a fresh fetch would ever show.
                  recentThrowers: [thrower, ...entry.recentThrowers].slice(0, MAX_THROWERS_PER_ITEM),
                }
              : entry,
          )
          .sort((a, b) => b.count - a.count);
      });
    };
    window.addEventListener(ITEM_THROWN_EVENT, onThrown);
    return () => window.removeEventListener(ITEM_THROWN_EVENT, onThrown);
  }, [author, permlink]);

  if (!ITEM_MARKET_FEATURE_FLAG) return null;
  if (pile.length === 0) {
    // Still show the throw affordance even when nobody's thrown anything
    // yet — otherwise there's no way to be first.
    return (
      <Box mt={3}>
        <ThrowItemButton targetAuthor={author} targetPermlink={permlink} targetType={targetType} />
      </Box>
    );
  }

  return (
    <Box mt={3}>
      <Divider mb={3} />
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <HStack spacing={2} flexWrap="wrap">
          {pile.map(entry => (
            <Box key={entry.item.id} position="relative" role="group">
              <HStack
                spacing={1}
                px={2}
                py={1}
                borderRadius="full"
                bg="background"
                borderWidth="1px"
                borderColor="border"
                cursor="pointer"
                _hover={{ borderColor: 'primary' }}
                onClick={() => setSelected(entry)}
                title={entry.item.name}
              >
                <Image src={entry.item.imageUrl} alt={entry.item.name} boxSize="18px" objectFit="contain" />
                <Text fontSize="xs" color="text">{entry.count}</Text>
              </HStack>

              {/* Desktop-only hover peek — CSS-gated to real pointer devices
                  so a touch tap never triggers a stuck "hover" state. */}
              <Box
                position="absolute"
                bottom="calc(100% + 8px)"
                left="50%"
                transform="translateX(-50%) translateY(4px)"
                opacity={0}
                pointerEvents="none"
                zIndex={20}
                bg="muted"
                borderWidth="1px"
                borderColor="border"
                borderRadius="md"
                boxShadow="lg"
                p={2}
                transition="opacity 0.15s ease, transform 0.15s ease"
                sx={{
                  '@media (hover: hover) and (pointer: fine)': {
                    '[role=group]:hover &': {
                      opacity: 1,
                      transform: 'translateX(-50%) translateY(0)',
                    },
                  },
                }}
              >
                <VStack spacing={1}>
                  <Image src={entry.item.imageUrl} alt={entry.item.name} boxSize="96px" objectFit="contain" />
                  <Text fontSize="xs" color="accent" whiteSpace="nowrap">{entry.item.name}</Text>
                </VStack>
              </Box>
            </Box>
          ))}
        </HStack>
        <ThrowItemButton targetAuthor={author} targetPermlink={permlink} targetType={targetType} />
      </Flex>

      <PileThrowersModal isOpen={!!selected} onClose={() => setSelected(null)} entry={selected} />
    </Box>
  );
}
