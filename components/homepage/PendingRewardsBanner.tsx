'use client';
import { useEffect, useState } from 'react';
import { Box, Flex, Text, Button, IconButton } from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiGift, FiX } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnclaimedRewardsDetail, UnclaimedRewardsDetail } from '@/hooks/useUnclaimedRewards';

function dismissKey(username: string): string {
  return `snapie-pending-rewards-dismissed-${username}`;
}

/** "0.296 HIVE + 0.297 HP" — only the non-zero parts, in the same 3-decimal
 *  form the wallet page uses for these same fields. */
function formatRewardAmounts({ hive, hbd, hp }: UnclaimedRewardsDetail): string {
  const parts: string[] = [];
  if (hive > 0) parts.push(`${hive.toFixed(3)} HIVE`);
  if (hbd > 0) parts.push(`${hbd.toFixed(3)} HBD`);
  if (hp > 0) parts.push(`${hp.toFixed(3)} HP`);
  return parts.join(' + ');
}

/**
 *  Home-feed nudge for unclaimed rewards. The wallet menu's LED (desktop
 *  sidebar / mobile bottom tab, both wired to the same useUnclaimedRewards
 *  signal) is a few-pixel dot on an icon nobody's specifically looking at —
 *  this puts the same fact somewhere it'll actually get seen.
 *
 *  Dismissing hides it until the next claim: the dismissal is cleared the
 *  moment hasUnclaimed goes false, so it's back, fresh, next time rewards
 *  accrue rather than staying hidden forever after the first dismiss.
 */
export default function PendingRewardsBanner() {
  const { username, isLoggedIn } = useCurrentUser();
  const detail = useUnclaimedRewardsDetail();
  const hasUnclaimed = detail.has;
  // Defaults hidden so there's no flash of the banner before localStorage has
  // been read for this specific username.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!username) return;
    try {
      setDismissed(localStorage.getItem(dismissKey(username)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [username]);

  useEffect(() => {
    if (!username || hasUnclaimed) return;
    try { localStorage.removeItem(dismissKey(username)); } catch {}
  }, [username, hasUnclaimed]);

  if (!isLoggedIn || !username || !hasUnclaimed || dismissed) return null;

  function handleDismiss() {
    if (!username) return;
    try { localStorage.setItem(dismissKey(username), '1'); } catch {}
    setDismissed(true);
  }

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={3}
      mb={3}
      p={3}
      pl={4}
      borderRadius="10px"
      bg="rgba(246, 201, 14, 0.08)"
      border="1px solid rgba(246, 201, 14, 0.3)"
      borderLeft="3px solid #f6c90e"
    >
      <Flex align="center" gap={3} minW={0}>
        <FiGift color="#f6c90e" size={18} style={{ flexShrink: 0 }} />
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="bold" noOfLines={1}>You have pending rewards</Text>
          <Text fontSize="xs" color="overlay.600" noOfLines={1}>
            {formatRewardAmounts(detail)} waiting in your wallet
          </Text>
        </Box>
      </Flex>
      <Flex align="center" gap={1} flexShrink={0}>
        <Button
          as={NextLink}
          href={`/@${username}/wallet`}
          size="sm"
          colorScheme="yellow"
          variant="outline"
        >
          Claim now
        </Button>
        <IconButton
          aria-label="Dismiss"
          icon={<FiX />}
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
        />
      </Flex>
    </Flex>
  );
}
