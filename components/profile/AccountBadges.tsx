'use client';
import { Flex, Image, Link, Tooltip } from '@chakra-ui/react';
import { useState } from 'react';
import { useAccountBadges } from '@/hooks/useAccountBadges';

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

  const visible = badges.filter(b => !failed.has(b.account));
  if (visible.length === 0) return null;

  return (
    <Flex gap={2} flexWrap="wrap" mt={2}>
      {visible.map(badge => (
        <Tooltip key={badge.account} label={badge.about ? `${badge.name} — ${badge.about}` : badge.name} hasArrow fontSize="xs">
          <Link href={`https://peakd.com/b/${badge.account}`} isExternal flexShrink={0}>
            <Image
              src={badge.image}
              alt={badge.name}
              boxSize="36px"
              borderRadius="full"
              objectFit="cover"
              border="1px solid"
              borderColor="surfaceBorder"
              onError={() => setFailed(prev => new Set(prev).add(badge.account))}
            />
          </Link>
        </Tooltip>
      ))}
    </Flex>
  );
}
