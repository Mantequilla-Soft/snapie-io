'use client';
import { useMemo, useState } from 'react';
import { Box, Text, VStack } from '@chakra-ui/react';
import { useWhoToFollow } from '@/hooks/useWhoToFollow';
import WhoToFollowRow from './WhoToFollowRow';

const DISPLAY_SLICE = 8;

interface WhoToFollowWidgetProps {
  engagedAuthors?: Set<string>;
}

export default function WhoToFollowWidget({ engagedAuthors }: WhoToFollowWidgetProps) {
  const { candidates, isLoading } = useWhoToFollow({ engagedAuthors });
  const slice = useMemo(() => candidates.slice(0, DISPLAY_SLICE), [candidates]);

  // Rows resolve their own visibility asynchronously (already-followed
  // accounts hide themselves). Track resolutions so we can tell "still
  // checking" apart from "checked everything, nothing to show" — otherwise
  // the header would render with zero rows beneath it whenever the whole
  // slice turns out to already be followed.
  const [resolvedCount, setResolvedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  const handleResolved = (visible: boolean) => {
    setResolvedCount(c => c + 1);
    if (visible) setVisibleCount(c => c + 1);
  };

  const allResolvedWithNoneVisible = resolvedCount >= slice.length && visibleCount === 0;

  if (isLoading || slice.length === 0 || allResolvedWithNoneVisible) return null;

  return (
    <Box px={2} pb={2}>
      <Text
        fontSize="xs"
        fontWeight="bold"
        color="overlay.400"
        letterSpacing="widest"
        textTransform="uppercase"
        px={2}
        pt={2}
        pb={3}
      >
        Who to follow
      </Text>
      <VStack spacing={0} align="stretch">
        {slice.map(account => (
          <WhoToFollowRow key={account} account={account} onResolved={handleResolved} />
        ))}
      </VStack>
    </Box>
  );
}
