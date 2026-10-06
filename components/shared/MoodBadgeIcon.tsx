import { Box } from '@chakra-ui/react';
import ProxiedImage from '@/components/shared/ProxiedImage';
import { MoodBadgeSku, MOOD_BADGES } from '@/lib/moodBadges/constants';

export interface MoodBadgeIconProps {
  sku: MoodBadgeSku;
  username: string;
  size?: string;
}

/** The small badge shown via Avatar's `overlay` slot. A plain circular
 *  frame around the art (the art itself has no background baked in — see
 *  the transparency verification when the assets were prepared) so it
 *  reads consistently regardless of what's behind it. Hover shows what the
 *  badge actually means — it renders small enough that the icon alone
 *  isn't always self-explanatory. */
export function MoodBadgeIcon({ sku, username, size = '16px' }: MoodBadgeIconProps) {
  const badge = MOOD_BADGES[sku];
  return (
    <Box
        title={`@${username} is feeling ${badge.feeling}`}
        position="relative"
        boxSize={size}
        borderRadius="full"
        bg="background"
        border="1px solid"
        borderColor="surfaceBorder"
        overflow="hidden"
      >
        <Box position="absolute" inset={0}>
          <ProxiedImage url={badge.imageSrc} alt={badge.label} sizes="48px" />
        </Box>
    </Box>
  );
}
