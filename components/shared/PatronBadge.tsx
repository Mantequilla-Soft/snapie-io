'use client';
import { Tooltip, Box } from '@chakra-ui/react';
import { FiStar } from 'react-icons/fi';
import type { PatronTier } from '@/hooks/usePatronStatus';

interface TierStyle {
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  boxShadow?: string;
}

// Escalating visual weight per tier: outline -> filled -> glowing.
const TIER_STYLE: Record<PatronTier, TierStyle> = {
  snaperino: {
    label: 'Snaperino',
    description: 'Snaperino — supports Snapie',
    color: 'whiteAlpha.700',
    bg: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  },
  snapian: {
    label: 'Snapian',
    description: 'Snapian — supports Snapie',
    color: 'white',
    bg: 'rgba(28, 161, 241, 0.35)',
    border: '1px solid rgba(28, 161, 241, 0.6)',
  },
  'snap-master': {
    label: 'Snap Master',
    description: 'Snap Master — top-tier Snapie patron',
    color: 'white',
    bg: 'linear-gradient(135deg, rgba(255, 196, 0, 0.45), rgba(28, 161, 241, 0.45))',
    border: '1px solid rgba(255, 196, 0, 0.7)',
    boxShadow: '0 0 8px rgba(255, 196, 0, 0.5)',
  },
};

interface PatronBadgeProps {
  tier: PatronTier | null | undefined;
}

export default function PatronBadge({ tier }: PatronBadgeProps) {
  if (!tier) return null;
  const style = TIER_STYLE[tier];
  if (!style) return null;

  return (
    <Tooltip label={style.description} hasArrow fontSize="xs">
      <Box
        as="span"
        display="inline-flex"
        alignItems="center"
        gap="3px"
        px="6px"
        py="1px"
        borderRadius="full"
        fontSize="9px"
        fontWeight="bold"
        letterSpacing="wide"
        textTransform="uppercase"
        color={style.color}
        bg={style.bg}
        border={style.border}
        boxShadow={style.boxShadow}
        flexShrink={0}
        lineHeight="1.4"
      >
        <FiStar size={9} />
        {style.label}
      </Box>
    </Tooltip>
  );
}
