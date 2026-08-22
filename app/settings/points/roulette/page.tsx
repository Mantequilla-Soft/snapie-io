'use client';
import { Box, Button, Flex, Heading, HStack, Text, Icon, Link as ChakraLink, useToast } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiAward, FiXCircle, FiStar } from 'react-icons/fi';
import { FaCoins } from 'react-icons/fa';
import { motion, useAnimation } from 'framer-motion';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { spinRoulette, SpinClientResult } from '@/lib/points/rouletteClient';
import { STAKE_PRESETS, SPIN_COOLDOWN_MS, ROULETTE_ODDS_BP, RouletteMultiplier } from '@/lib/points/rouletteConfig';

// Strip layout. Purely cosmetic — the tiles that fly by mean nothing; only
// the tile at LANDING_INDEX carries a real result, and it's only ever set to
// the server's actual multiplier, never a placeholder pretending to be one.
const TILE_SIZE = 68;
const TILE_GAP = 8;
const EFFECTIVE_TILE = TILE_SIZE + TILE_GAP;
const VISIBLE_TILES = 5;
const DECOY_COUNT = 24;
const STRIP_WIDTH = VISIBLE_TILES * EFFECTIVE_TILE;
const LANDING_INDEX = DECOY_COUNT;
const FINAL_X = -(LANDING_INDEX * EFFECTIVE_TILE) + (STRIP_WIDTH / 2 - TILE_SIZE / 2);

// Odds-weighted, same shape as the server's rollOutcome (rouletteService.ts)
// but Math.random-driven since this only decides what flies by mid-spin, not
// a real outcome.
function decoyMultiplier(): RouletteMultiplier {
  const roll = Math.random() * 10000;
  for (const { multiplier, thresholdBp } of ROULETTE_ODDS_BP) {
    if (roll < thresholdBp) return multiplier;
  }
  return 0;
}

function buildStrip(landing: RouletteMultiplier): RouletteMultiplier[] {
  return [...Array.from({ length: DECOY_COUNT }, decoyMultiplier), landing];
}

function tileLabel(m: RouletteMultiplier): string {
  return m === 0 ? '—' : `${m}x`;
}

// Tint per outcome tier — hex values match themes/windows95.ts's dark-mode
// success/warning tokens, converted to translucent rgba (same "hardcode a
// dark-mode tint" convention already used elsewhere, e.g.
// app/settings/points/buy/page.tsx's rgba(28,161,241,...) callouts).
function tileVisual(m: RouletteMultiplier): { text: string; bg: string; border: string } {
  if (m === 0) return { text: 'overlay.400', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' };
  if (m === 5) return { text: 'warning', bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.4)' };
  return { text: 'success', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' };
}

const ODDS_LABELS: Record<RouletteMultiplier, string> = { 0: 'Lose', 2: '2x', 3: '3x', 5: 'Jackpot 5x' };

// Derived from ROULETTE_ODDS_BP's cumulative thresholds, not hardcoded —
// duplicating these as separate literal percentages here previously meant a
// config retune (see rouletteConfig.ts) could silently leave the displayed
// odds stale and wrong, exactly the kind of mismatch that would undermine
// the odds-transparency guardrail this table exists for.
const ODDS_ROWS: { label: string; pct: string; multiplier: RouletteMultiplier }[] = (() => {
  let prevBp = 0;
  return ROULETTE_ODDS_BP.map(({ multiplier, thresholdBp }) => {
    const pct = `${((thresholdBp - prevBp) / 100).toFixed(2)}%`;
    prevBp = thresholdBp;
    return { label: ODDS_LABELS[multiplier], pct, multiplier };
  });
})();

export default function RoulettePage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();
  const controls = useAnimation();

  const [selectedStake, setSelectedStake] = useState<number>(STAKE_PRESETS[0]);
  // Deterministic placeholder for the very first (server-rendered) render —
  // Math.random() here would diverge between server and client and trigger a
  // hydration mismatch. The real decorative strip is filled in client-side
  // only, after mount, below.
  const [strip, setStrip] = useState<RouletteMultiplier[]>(() => Array(DECOY_COUNT + 1).fill(0));
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [lastResult, setLastResult] = useState<SpinClientResult | null>(null);
  const [cooling, setCooling] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Increments once per completed spin — used purely as a React `key` to
  // replay the balance flash animation below, since the balance itself is
  // already kept live by usePointsSummary's POINTS_SPENT_EVENT listener
  // (see lib/points/client.ts / rouletteClient.ts) and needs no polling.
  const [flashSeq, setFlashSeq] = useState(0);
  const [flashWon, setFlashWon] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance = points?.balance ?? 0;
  const canAfford = balance >= selectedStake;
  const isBusy = phase === 'spinning';

  // The displayed number, deliberately decoupled from the live `balance`
  // above. rouletteClient's POINTS_SPENT_EVENT fires the instant the server
  // responds — well before the ~1.1s strip-landing animation even starts —
  // so rendering `balance` directly would reveal whether the spin won or
  // lost before the strip visually lands on it. Only re-sync the displayed
  // number once the animation has actually finished (phase !== 'spinning'),
  // so the reveal order stays strip-first, balance-second, never the other
  // way around.
  const [displayedBalance, setDisplayedBalance] = useState<number | null>(null);
  useEffect(() => {
    if (phase === 'spinning') return;
    if (points) setDisplayedBalance(points.balance);
  }, [points, phase]);

  // Client-only: swap the deterministic placeholder for a real randomized
  // decorative strip once mounted (see the placeholder's comment above).
  useEffect(() => {
    setStrip(buildStrip(0));
  }, []);

  async function handleSpin() {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    if (isBusy || cooling || !canAfford) return;

    setPhase('spinning');
    setLastResult(null);
    const decoys = Array.from({ length: DECOY_COUNT }, decoyMultiplier);
    setStrip([...decoys, 0]);
    controls.set({ x: 0 });
    // Loose "still deciding" shuffle — cancelled the moment the real result
    // lands, per controls.start below. Never claims to be the outcome.
    //
    // Ping-pongs (repeatType: 'reverse') within a fixed, small distance —
    // deliberately NOT a one-way loop that snaps back to 0. A one-way loop
    // needs its scroll distance to exactly match the rendered content's
    // width, or the window scrolls past the last real tile into empty
    // space before it snaps back (looked like a derailed train — the strip
    // visually ran out of track mid-spin). Reversing back and forth inside
    // a distance well within DECOY_COUNT's actual width sidesteps that bug
    // entirely: there's no distance at which tiles can run out.
    controls.start({
      x: [0, -(8 * EFFECTIVE_TILE)],
      transition: { duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
    });

    try {
      const result = await spinRoulette(username, selectedStake);

      if (result.status !== 'spun') {
        controls.stop();
        setPhase('idle');
        if (result.status === 'insufficient_balance') {
          toast({ status: 'warning', title: 'Not enough points', description: `You need ${selectedStake.toLocaleString()} points for this spin.` });
        } else if (result.status === 'cooldown') {
          toast({ status: 'info', title: 'Slow down', description: 'Give it a couple seconds between spins.' });
        } else {
          toast({ status: 'error', title: 'Could not complete this spin' });
        }
        return;
      }

      const multiplier = result.multiplier ?? 0;
      setStrip([...decoys, multiplier]);
      await controls.start({
        x: FINAL_X,
        transition: { duration: 1.1, ease: [0.12, 0, 0.3, 1] },
      });

      setLastResult(result);
      setPhase('result');
      setFlashWon(result.netDelta > 0);
      setFlashSeq(s => s + 1);
      setFlashActive(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashActive(false), 900);
      setCooling(true);
      cooldownTimer.current = setTimeout(() => setCooling(false), SPIN_COOLDOWN_MS);
    } catch (err: any) {
      controls.stop();
      setPhase('idle');
      toast({ status: 'error', title: 'Spin failed', description: err?.message });
    }
  }

  const resultMultiplier = lastResult?.multiplier ?? 0;
  const resultVisual = tileVisual(resultMultiplier);

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Points Roulette
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Burn points for a shot at 2x, 3x, or a rare 5x jackpot. Most spins lose everything — that&apos;s the game.
      </Text>

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        borderTop="3px solid rgba(245,158,11,0.45)"
        backdropFilter="blur(18px)"
        boxShadow="0 8px 32px rgba(245,158,11,0.06)"
        p={6}
      >
        {isLoggedIn && (
          <Flex align="center" justify="space-between" bg="rgba(255,255,255,0.03)" border="1px solid" borderColor="rgba(255,255,255,0.08)" borderRadius="10px" px={4} py={3} mb={5}>
            <HStack spacing={2} color="overlay.500">
              <Icon as={FaCoins} boxSize={3.5} />
              <Text fontSize="xs" fontWeight="bold" letterSpacing="wide" textTransform="uppercase">Balance</Text>
            </HStack>
            <motion.div
              key={flashSeq}
              initial={flashSeq > 0 ? { scale: 1.3 } : false}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <Text fontSize="xl" fontWeight="bold" color={flashActive ? (flashWon ? 'success' : 'error') : 'text'} transition="color 0.9s ease">
                {displayedBalance !== null ? displayedBalance.toLocaleString() : '—'} <Text as="span" fontSize="sm" color="overlay.500" fontWeight="normal">points</Text>
              </Text>
            </motion.div>
          </Flex>
        )}

        <Text fontSize="xs" fontWeight="bold" color="overlay.400" letterSpacing="widest" textTransform="uppercase" mb={3}>
          Odds
        </Text>
        <HStack spacing={2} mb={6} wrap="wrap">
          {ODDS_ROWS.map(row => {
            const v = tileVisual(row.multiplier);
            return (
              <Box key={row.label} px={3} py={1.5} borderRadius="full" bg={v.bg} border="1px solid" borderColor={v.border}>
                <Text fontSize="xs" fontWeight="bold" color={v.text}>
                  {row.label} <Text as="span" color="overlay.400" fontWeight="normal">{row.pct}</Text>
                </Text>
              </Box>
            );
          })}
        </HStack>

        <Box
          position="relative"
          width={`${STRIP_WIDTH}px`}
          maxW="100%"
          mx="auto"
          overflow="hidden"
          borderRadius="12px"
          bg="background"
          boxShadow="inset 0 2px 12px rgba(0,0,0,0.5), inset 0 -2px 12px rgba(0,0,0,0.5)"
          mb={2}
        >
          <Flex as={motion.div} animate={controls} gap={`${TILE_GAP}px`} py={2} px={0}>
            {strip.map((m, i) => {
              const isLanding = i === LANDING_INDEX;
              const revealed = isLanding && phase === 'result';
              const v = tileVisual(m);
              const showQuestionMark = isLanding && phase !== 'result';
              return (
                <motion.div
                  key={i}
                  animate={revealed ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ flexShrink: 0 }}
                >
                  <Flex
                    width={`${TILE_SIZE}px`}
                    height={`${TILE_SIZE}px`}
                    align="center"
                    justify="center"
                    borderRadius="10px"
                    bg={revealed ? v.bg : 'rgba(255,255,255,0.03)'}
                    border="1px solid"
                    borderColor={revealed ? v.border : 'rgba(255,255,255,0.06)'}
                    boxShadow={revealed && m === 5 ? '0 0 18px rgba(245,158,11,0.5)' : undefined}
                    fontSize={m === 5 ? 'xl' : 'lg'}
                    fontWeight="bold"
                    color={revealed ? v.text : 'overlay.400'}
                  >
                    {showQuestionMark ? '?' : tileLabel(m)}
                  </Flex>
                </motion.div>
              );
            })}
          </Flex>

          {/* Edge fades so tiles feel like they scroll through a window,
              not abruptly cut off. */}
          <Box position="absolute" top={0} bottom={0} left={0} width="28px" bgGradient="linear(to-r, background, transparent)" pointerEvents="none" />
          <Box position="absolute" top={0} bottom={0} right={0} width="28px" bgGradient="linear(to-l, background, transparent)" pointerEvents="none" />

          {/* Pointer marks — the tile between them is the one that counts. */}
          <Box position="absolute" top="1px" left="50%" transform="translateX(-50%)" width={0} height={0} borderLeft="5px solid transparent" borderRight="5px solid transparent" borderTop="6px solid" borderTopColor="rgba(245,158,11,0.7)" />
          <Box position="absolute" bottom="1px" left="50%" transform="translateX(-50%)" width={0} height={0} borderLeft="5px solid transparent" borderRight="5px solid transparent" borderBottom="6px solid" borderBottomColor="rgba(245,158,11,0.7)" />
        </Box>

        <Box minH="64px" mb={4}>
          {phase === 'result' && lastResult && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Flex
                align="center"
                justify="center"
                gap={2}
                mt={3}
                py={3}
                borderRadius="10px"
                bg={resultVisual.bg}
                border="1px solid"
                borderColor={resultVisual.border}
              >
                {resultMultiplier === 0 ? <FiXCircle color="var(--chakra-colors-overlay-400)" /> : resultMultiplier === 5 ? <FiStar color="var(--chakra-colors-warning)" /> : <FiAward color="var(--chakra-colors-success)" />}
                <Text fontSize="md" fontWeight="bold" color={resultVisual.text}>
                  {resultMultiplier === 0
                    ? `Lost ${selectedStake.toLocaleString()} points`
                    : `${resultMultiplier}x — +${lastResult.netDelta.toLocaleString()} net (${lastResult.payout.toLocaleString()} back)`}
                </Text>
              </Flex>
            </motion.div>
          )}
        </Box>

        <Text fontSize="xs" fontWeight="bold" color="overlay.400" letterSpacing="widest" textTransform="uppercase" mb={3}>
          Stake
        </Text>
        <HStack spacing={2} mb={5} wrap="wrap">
          {STAKE_PRESETS.map(stake => (
            <Button
              key={stake}
              size="sm"
              variant={selectedStake === stake ? 'solid' : 'outline'}
              colorScheme={selectedStake === stake ? 'blue' : 'gray'}
              onClick={() => setSelectedStake(stake)}
              isDisabled={isBusy}
            >
              {stake.toLocaleString()}
            </Button>
          ))}
        </HStack>

        <Button
          colorScheme="blue"
          width="100%"
          size="lg"
          fontWeight="bold"
          onClick={handleSpin}
          isDisabled={(isLoggedIn && !canAfford) || cooling}
          isLoading={isBusy}
          loadingText="Spinning…"
        >
          {isLoggedIn ? (canAfford ? `Spin (${selectedStake.toLocaleString()} points)` : 'Not enough points') : 'Log in to spin'}
        </Button>

        <Text fontSize="xs" color="overlay.400" mt={4}>
          Spins are final and don&apos;t affect your leaderboard rank — a jackpot is spendable balance, not sweat equity.
        </Text>
      </Box>
    </Box>
  );
}
