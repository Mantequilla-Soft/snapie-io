'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Box,
  Button,
  Code,
  Heading,
  Link,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import HiveClient from '@/lib/hive/hiveclient';
import { broadcastOps, KeyTypes } from '@/lib/hive/aioha';
import { useHiveUser } from '@/contexts/UserContext';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { decodeAccountData, type ShareableAccountData } from '@/lib/hive/share-link';

interface SponsorFlowProps {
  code: string;
}

type Mode = 'loading' | 'invalid' | 'needLogin' | 'ready' | 'broadcasting' | 'success' | 'error';
type Variant = 'claimed' | 'paid' | 'claim_first';

function buildAuth(pub: string) {
  return {
    weight_threshold: 1,
    account_auths: [] as Array<[string, number]>,
    key_auths: [[pub, 1]] as Array<[string, number]>,
  };
}

function buildPostingAuth(pub: string, delegate: string) {
  return {
    weight_threshold: 1,
    account_auths: [[delegate, 1]] as Array<[string, number]>,
    key_auths: [[pub, 1]] as Array<[string, number]>,
  };
}

export default function SponsorFlow({ code }: SponsorFlowProps) {
  const { hiveUser } = useHiveUser();
  const { openLoginModal } = useLoginModal();

  const [data, setData] = useState<ShareableAccountData | null>(null);
  const [pendingAct, setPendingAct] = useState<number>(0);
  const [nameStillAvailable, setNameStillAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const decoded = decodeAccountData(code);
    if (!decoded) {
      setMode('invalid');
      return;
    }
    setData(decoded);
  }, [code]);

  // Pull sponsor's ACT count + verify name is still free
  useEffect(() => {
    if (!data) return;
    if (!hiveUser?.name) {
      setMode('needLogin');
      return;
    }
    setMode('loading');
    let cancelled = false;
    (async () => {
      try {
        const [sponsorAccts, targetAccts] = await Promise.all([
          HiveClient.database.getAccounts([hiveUser.name]),
          HiveClient.database.getAccounts([data.username]),
        ]);
        if (cancelled) return;
        if (sponsorAccts.length === 0) {
          setError('Could not load your account');
          setMode('error');
          return;
        }
        const acct = sponsorAccts[0] as unknown as { pending_claimed_accounts?: number };
        setPendingAct(acct.pending_claimed_accounts ?? 0);
        setNameStillAvailable(targetAccts.length === 0);
        setMode('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load account data');
        setMode('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, hiveUser?.name, reloadTick]);

  const broadcast = async (variant: Variant) => {
    if (!data || !hiveUser?.name) return;
    setMode('broadcasting');
    setError(null);
    const postingDelegate = process.env.NEXT_PUBLIC_POSTING_AUTHORITY_ACCOUNT ?? 'snapie';
    try {
      let op: [string, Record<string, unknown>];
      let title: string;

      if (variant === 'claim_first') {
        op = ['claim_account', {
          creator: hiveUser.name,
          fee: '0.000 HIVE',
          extensions: [],
        }];
        title = 'Claim 1 Account Creation Token';
      } else if (variant === 'claimed') {
        op = ['create_claimed_account', {
          creator: hiveUser.name,
          new_account_name: data.username,
          owner: buildAuth(data.ownerPubkey),
          active: buildAuth(data.activePubkey),
          posting: buildPostingAuth(data.postingPubkey, postingDelegate),
          memo_key: data.memoPubkey,
          json_metadata: '',
          extensions: [],
        }];
        title = `Sponsor @${data.username}`;
      } else {
        op = ['account_create', {
          fee: '3.000 HIVE',
          creator: hiveUser.name,
          new_account_name: data.username,
          owner: buildAuth(data.ownerPubkey),
          active: buildAuth(data.activePubkey),
          posting: buildPostingAuth(data.postingPubkey, postingDelegate),
          memo_key: data.memoPubkey,
          json_metadata: '',
        }];
        title = `Create @${data.username} for 3 HIVE`;
      }

      const result = await broadcastOps([op], KeyTypes.Active, title);
      const broadcastResult = result.result as { id?: string; tx_id?: string } | undefined;
      const id = broadcastResult?.tx_id ?? broadcastResult?.id ?? null;

      if (variant === 'claim_first') {
        setPendingAct((n) => n + 1);
        setMode('ready');
      } else {
        setTxId(id);
        setMode('success');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Broadcast failed');
      setMode('error');
    }
  };

  if (mode === 'loading') {
    return (
      <Box display="flex" justifyContent="center" py={16}>
        <Spinner color="white" />
      </Box>
    );
  }

  if (mode === 'invalid') {
    return (
      <Stack maxW="md" mx="auto" px={4} py={8}>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          This invite link is invalid or corrupted.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={5} maxW="md" mx="auto" w="full" px={4} py={8}>
      <Box textAlign="center">
        <Heading size="lg" color="white" mb={2}>
          Sponsor a Hive account
        </Heading>
        <Text fontSize="sm" color="gray.400">
          Someone is asking you to create{' '}
          <Code colorScheme="blue" fontFamily="mono">
            @{data?.username}
          </Code>{' '}
          for them. They generated the keys on their own device — you only sign the on-chain transaction.
        </Text>
      </Box>

      {nameStillAvailable === false && (
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <Text fontSize="sm">
            <Text as="span" fontFamily="mono">@{data?.username}</Text> is already taken. Ask them to generate a new link with a different username.
          </Text>
        </Alert>
      )}

      <Accordion allowToggle>
        <AccordionItem border="1px solid" borderColor="whiteAlpha.200" borderRadius="md">
          <AccordionButton _hover={{ bg: 'whiteAlpha.50' }}>
            <Box flex="1" textAlign="left" fontSize="sm" color="white">
              View public keys being assigned
            </Box>
            <AccordionIcon color="white" />
          </AccordionButton>
          <AccordionPanel pb={4}>
            {data && (
              <Stack spacing={2}>
                {(
                  [
                    ['Owner', data.ownerPubkey],
                    ['Active', data.activePubkey],
                    ['Posting', data.postingPubkey],
                    ['Memo', data.memoPubkey],
                  ] as const
                ).map(([label, key]) => (
                  <Box key={label}>
                    <Text fontSize="xs" color="gray.500">{label}</Text>
                    <Code fontSize="xs" wordBreak="break-all" w="full" bg="blackAlpha.500" color="gray.200">
                      {key}
                    </Code>
                  </Box>
                ))}
              </Stack>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {mode === 'needLogin' && (
        <Button colorScheme="blue" size="lg" onClick={openLoginModal}>
          Log in with Hive to sponsor
        </Button>
      )}

      {mode === 'ready' && nameStillAvailable !== false && (
        <Stack spacing={3}>
          <Text fontSize="sm" color="gray.300">
            Signed in as <Text as="span" fontWeight="bold" color="white">@{hiveUser?.name}</Text>.
            You hold{' '}
            <Text as="span" fontWeight="bold" color="white">{pendingAct}</Text>{' '}
            Account Creation Token{pendingAct === 1 ? '' : 's'}.
          </Text>

          {pendingAct > 0 ? (
            <Button colorScheme="green" size="lg" onClick={() => broadcast('claimed')}>
              Sponsor @{data?.username} (free, uses 1 ACT)
            </Button>
          ) : (
            <Stack spacing={2}>
              <Text fontSize="xs" color="gray.400">
                You don&apos;t have any Account Creation Tokens. Choose how to proceed:
              </Text>
              <Button variant="outline" onClick={() => broadcast('claim_first')}>
                Claim 1 ACT first (uses Resource Credits — free)
              </Button>
              <Button variant="outline" colorScheme="orange" onClick={() => broadcast('paid')}>
                Pay 3 HIVE to create the account directly
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {mode === 'broadcasting' && (
        <Box display="flex" alignItems="center" gap={3} bg="whiteAlpha.50" p={3} borderRadius="md">
          <Spinner size="sm" color="white" />
          <Text fontSize="sm" color="white">Approve the transaction in your wallet…</Text>
        </Box>
      )}

      {mode === 'success' && (
        <Alert status="success" flexDirection="column" alignItems="flex-start" gap={2} borderRadius="md">
          <Box display="flex" alignItems="center">
            <AlertIcon />
            <Text fontWeight="bold">@{data?.username} is live on Hive.</Text>
          </Box>
          {txId && (
            <Link href={`https://hiveblocks.com/tx/${txId}`} isExternal fontSize="sm" color="blue.600">
              View transaction <Box as="span" display="inline-block" ml={1}><FaExternalLinkAlt /></Box>
            </Link>
          )}
        </Alert>
      )}

      {mode === 'error' && (
        <Alert status="error" flexDirection="column" alignItems="flex-start" gap={2} borderRadius="md">
          <Box display="flex" alignItems="center">
            <AlertIcon />
            <Text fontSize="sm">{error || 'Something went wrong.'}</Text>
          </Box>
          <Button size="sm" onClick={() => setReloadTick((n) => n + 1)}>
            Try again
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
