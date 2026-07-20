'use client';
import { Box, Flex, Text, HStack, Icon, Link as ChakraLink } from '@chakra-ui/react';
import { FaChartLine } from 'react-icons/fa';
import { useEffect, useState } from 'react';
import type { TrendingMarket } from '@/app/api/markets/trending/route';

// HivePredict doesn't expose stable per-market URLs (no market-id routes in
// their sitemap), so every link — header and rows alike — points at the
// general markets list rather than guessing a deep link that might 404.
const HIVEPREDICT_MARKETS_URL = 'https://hivepredict.app/markets';

function leadingOutcome(market: TrendingMarket): { label: string; percent: number } | null {
  const entries = Object.entries(market.outcomePools);
  if (entries.length === 0) return null;
  const [topKey, topValue] = entries.reduce((max, entry) => (parseFloat(entry[1]) > parseFloat(max[1]) ? entry : max));
  const pool = parseFloat(topValue);
  const total = parseFloat(market.totalPool);
  if (!total || pool <= 0) return null;
  return { label: market.outcomeLabels[topKey] ?? topKey, percent: Math.round((pool / total) * 100) };
}

export default function TrendingMarketsWidget() {
  const [markets, setMarkets] = useState<TrendingMarket[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/markets/trending')
      .then(res => res.json())
      .then(data => { if (!cancelled) setMarkets(Array.isArray(data.markets) ? data.markets.slice(0, 4) : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (markets.length === 0) return null;

  return (
    <Box px={2} mb={4}>
      <Flex align="center" justify="space-between" px={2} pt={2} pb={3}>
        <HStack spacing={1.5}>
          <Icon as={FaChartLine} color="overlay.500" boxSize="11px" />
          <Text fontSize="xs" fontWeight="bold" color="overlay.400" letterSpacing="widest" textTransform="uppercase">
            Prediction Markets
          </Text>
        </HStack>
        <ChakraLink href={HIVEPREDICT_MARKETS_URL} isExternal fontSize="xs" color="overlay.400" _hover={{ color: 'overlay.700' }}>
          All
        </ChakraLink>
      </Flex>

      <Flex direction="column" gap={1}>
        {markets.map((market) => {
          const leading = leadingOutcome(market);
          return (
            <ChakraLink
              key={market.id}
              href={HIVEPREDICT_MARKETS_URL}
              isExternal
              display="block"
              px={2}
              py={1.5}
              borderRadius="8px"
              transition="background 0.15s"
              _hover={{ bg: 'overlay.50', textDecoration: 'none' }}
            >
              <Text fontSize="12px" fontWeight={600} color="text" noOfLines={1}>
                {market.title}
              </Text>
              <Text fontSize="11px" color="overlay.500" noOfLines={1}>
                {leading ? `${leading.label} ${leading.percent}% · ` : ''}
                {parseFloat(market.totalPool).toLocaleString()} {market.token}
              </Text>
            </ChakraLink>
          );
        })}
      </Flex>
    </Box>
  );
}
