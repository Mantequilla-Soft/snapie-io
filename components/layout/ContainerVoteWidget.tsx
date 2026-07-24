'use client';
import { Box, Flex, Text, Icon, useToast } from '@chakra-ui/react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { getLastSnapsContainer, getPost, vote } from '@/lib/hive/client-functions';
import { awardPoints } from '@/lib/points/client';

// The daily "container" post every Hive frontend's Snaps reply under
// (peak.snaps — shared infra, not Snapie-specific). Voting it isn't
// self-promotion: a bigger container payout is what funds reward payouts
// for everyone's snap replies, on every frontend, not just here.
export default function ContainerVoteWidget() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const toast = useToast();

  const [container, setContainer] = useState<{ author: string; permlink: string } | null>(null);
  const [voted, setVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  // Tracks the last-seen container permlink outside React state so the
  // polling loop can cheaply tell "still the same post" from "peak.snaps
  // rolled over to a new one" without re-rendering on every tick.
  const knownPermlinkRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // force=true always re-checks vote state even if the container didn't
    // change — needed on mount/login since the voter identity itself changed.
    // The polling tick passes force=false so it only pays for the heavier
    // getPost() call when peak.snaps has actually posted a new container.
    async function refresh(force: boolean) {
      try {
        const { author, permlink } = await getLastSnapsContainer();
        if (cancelled) return;
        const isNewContainer = knownPermlinkRef.current !== permlink;
        if (!isNewContainer && !force) return;
        knownPermlinkRef.current = permlink;
        const post = await getPost(author, permlink);
        if (cancelled) return;
        setContainer({ author, permlink });
        setVoted(!!post.active_votes?.some((v: any) => v.voter === username));
      } catch {
        // Container lookup failed — just hide the widget rather than show
        // something broken.
      }
    }

    refresh(true);
    // peak.snaps rolls over to a new container multiple times a day — poll
    // so a long-lived tab doesn't keep showing stale vote state against a
    // container that's since been replaced.
    const interval = setInterval(() => refresh(false), 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [username]);

  async function handleClick() {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    if (!container || isVoting) return;
    const wasVoted = voted;
    setIsVoting(true);
    setVoted(!wasVoted);
    try {
      const result = await vote({
        username,
        author: container.author,
        permlink: container.permlink,
        weight: wasVoted ? 0 : 10000,
      });
      if (!result.success) {
        setVoted(wasVoted);
        toast({ status: 'error', title: 'Could not vote', description: result.error });
      } else if (!wasVoted) {
        awardPoints('vote', username, container.author, container.permlink);
      }
    } catch (err: any) {
      setVoted(wasVoted);
      toast({ status: 'error', title: 'Could not vote', description: err?.message });
    } finally {
      setIsVoting(false);
    }
  }

  if (!container) return null;

  return (
    <Box px={2} mb={4}>
      <Flex
        align="center"
        justify="space-between"
        gap={3}
        bg="surface"
        border="1px solid"
        borderColor="surfaceBorder"
        borderRadius="14px"
        px={4}
        py={3}
      >
        <Text fontSize="13px" color="text" lineHeight="1.4">
          Vote the daily Snaps post to help fund rewards for everyone&apos;s replies.
        </Text>
        <Flex
          as="button"
          onClick={handleClick}
          align="center"
          justify="center"
          boxSize="40px"
          flexShrink={0}
          borderRadius="10px"
          bg="overlay.100"
          cursor="pointer"
          transition="background 0.15s"
          _hover={{ bg: 'overlay.200' }}
          opacity={isVoting ? 0.6 : 1}
          aria-label={voted ? 'Remove vote' : 'Vote'}
        >
          <Icon as={voted ? FaHeart : FaRegHeart} boxSize={4} color={voted ? 'red.400' : 'overlay.500'} />
        </Flex>
      </Flex>
    </Box>
  );
}
