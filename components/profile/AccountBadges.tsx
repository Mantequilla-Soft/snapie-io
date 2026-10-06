'use client';
import { Box, Flex, Link, Tooltip } from '@chakra-ui/react';
import { useState } from 'react';
import { useAccountBadges } from '@/hooks/useAccountBadges';
import ProxiedImage from '@/components/shared/ProxiedImage';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';

interface AccountBadgesProps {
  username: string;
}

/**
 * PeakD-style badge row — see lib/hive/accountBadges.ts for how these are
 * discovered (badge-XXXXXX Hive accounts following this profile). Unlike a
 * post's image (primary content worth a visible "failed to load" fallback,
 * see ImageWithFallback), a badge icon is decorative — a single broken one
 * is just quietly dropped from the row rather than shown as broken.
 */
export default function AccountBadges({ username }: AccountBadgesProps) {
  const { badges } = useAccountBadges(username);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const visible = badges.filter((b) => !failed.has(b.account) && resolveFeedImageSrc(b.image));
  if (visible.length === 0) return null;

  return (
    <Flex gap={2} flexWrap="wrap" mt={2}>
      {visible.map(badge => (
        <Tooltip key={badge.account} label={badge.about ? `${badge.name} — ${badge.about}` : badge.name} hasArrow fontSize="xs">
          <Link href={`https://peakd.com/b/${badge.account}`} isExternal flexShrink={0}>
            <Box position="relative" boxSize="36px" borderRadius="full" overflow="hidden" border="1px solid" borderColor="surfaceBorder">
              <ProxiedImage
                url={badge.image}
                alt={badge.name}
                sizes="36px"
                onError={() => setFailed((prev) => new Set(prev).add(badge.account))}
              />
            </Box>
          </Link>
        </Tooltip>
      ))}
    </Flex>
  );
}
