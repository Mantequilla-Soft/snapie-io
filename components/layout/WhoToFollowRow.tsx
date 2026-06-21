'use client';
import { useEffect, useState } from 'react';
import { Avatar, Button, HStack, Link, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useUserRelationship } from '@/hooks/useUserRelationship';
import { usePatronStatus } from '@/hooks/usePatronStatus';
import PatronBadge from '@/components/shared/PatronBadge';

interface WhoToFollowRowProps {
  account: string;
  /** Fires once the relationship check resolves, reporting whether this row
   *  ended up visible — lets the parent widget tell "still checking" apart
   *  from "checked, nothing to show" so it can hide an empty header. */
  onResolved?: (visible: boolean) => void;
}

/**
 * One suggestion row. Reuses the same relationship hook that backs the
 * profile follow button — `fetchRelationship()` is lazy, so the bridge call
 * only fires for rows that actually mount (bounded by the widget's slice
 * size, not unbounded). Renders nothing once resolved if already
 * followed/blacklisted, so the visible list self-filters.
 */
export default function WhoToFollowRow({ account, onResolved }: WhoToFollowRowProps) {
  const { isFollowing, isBlacklisted, isProcessing, fetchRelationship, handleFollow } =
    useUserRelationship(account);
  const { getTier } = usePatronStatus();
  // useUserRelationship's own isLoading starts false until its effect runs,
  // so relying on it alone would flash a "Follow" button (default state)
  // for already-followed accounts for one frame. Track our own resolved
  // flag instead — nothing renders until the check has actually completed.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchRelationship();
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [fetchRelationship]);

  useEffect(() => {
    if (checked) onResolved?.(!isFollowing && !isBlacklisted);
    // onResolved intentionally excluded — only fire once per resolution, not
    // on every parent re-render that hands in a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, isFollowing, isBlacklisted]);

  if (!checked || isFollowing || isBlacklisted) return null;

  return (
    <HStack justify="space-between" px={2} py={1.5}>
      <Link as={NextLink} href={`/@${account}`} _hover={{ textDecoration: 'none' }} minW={0} flex={1}>
        <HStack spacing={2} minW={0}>
          <Avatar size="sm" name={account} src={`https://images.hive.blog/u/${account}/avatar/small`} />
          <Text fontSize="sm" color="text" isTruncated>@{account}</Text>
          <PatronBadge tier={getTier(account)} />
        </HStack>
      </Link>
      <Button
        size="xs"
        colorScheme="blue"
        borderRadius="full"
        px={3}
        flexShrink={0}
        onClick={handleFollow}
        isLoading={isProcessing}
      >
        Follow
      </Button>
    </HStack>
  );
}
