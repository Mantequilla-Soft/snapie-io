'use client';
import { Tooltip, Box } from '@chakra-ui/react';

/** Marks a snap surfaced by content resurrection — dormant, then genuinely
 *  spiking against its own baseline (see lib/discovery/contentResurrection.ts).
 *  Gold/amber on purpose, distinct from the calmer existing badges — this is
 *  meant to read as a rare, delightful find, not routine. */
export default function VaultBadge() {
  return (
    <Tooltip label="From the Vault! This one went quiet for a while and just caught fire again" hasArrow fontSize="xs">
      <Box
        as="span"
        display="inline-flex"
        alignItems="center"
        px="6px"
        py="1px"
        borderRadius="full"
        fontSize="9px"
        fontWeight="bold"
        letterSpacing="wide"
        textTransform="uppercase"
        color="#7a5200"
        bg="rgba(245, 179, 21, 0.18)"
        border="1px solid rgba(245, 179, 21, 0.55)"
        flexShrink={0}
        lineHeight="1.4"
      >
        Vault
      </Box>
    </Tooltip>
  );
}
