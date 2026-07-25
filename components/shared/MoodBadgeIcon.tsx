import { Box, Image } from '@chakra-ui/react';
import { MoodBadgeSku, MOOD_BADGES } from '@/lib/moodBadges/constants';

export interface MoodBadgeIconProps {
  sku: MoodBadgeSku;
  size?: string;
}

/** The small badge shown via Avatar's `overlay` slot. A plain circular
 *  frame around the art (the art itself has no background baked in — see
 *  the transparency verification when the assets were prepared) so it
 *  reads consistently regardless of what's behind it. */
export function MoodBadgeIcon({ sku, size = '16px' }: MoodBadgeIconProps) {
  const badge = MOOD_BADGES[sku];
  return (
    <Box
      boxSize={size}
      borderRadius="full"
      bg="background"
      border="1px solid"
      borderColor="surfaceBorder"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Image src={badge.imageSrc} alt={badge.label} boxSize="100%" objectFit="cover" />
    </Box>
  );
}
