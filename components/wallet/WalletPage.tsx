'use client';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Spinner,
  Alert,
  AlertIcon,
  Image,
  Flex,
  Icon,
  Avatar,
  Grid,
  Button,
  HStack,
  VStack,
  Badge,
  useDisclosure,
} from '@chakra-ui/react';
import { FaGlobe, FaExchangeAlt, FaPiggyBank, FaShoppingCart, FaArrowDown, FaShareAlt, FaDollarSign, FaArrowUp, FaPaperPlane, FaCoins, FaChartLine, FaGift, FaEdit, FaShieldAlt, FaExternalLinkAlt } from 'react-icons/fa';
import useHiveAccount from '@/hooks/useHiveAccount';
import {
  getProfile,
  convertVestToHive,
  getCryptoPrices,
  transferWithKeychain,
  powerUpWithKeychain,
  powerDownWithKeychain,
  delegateWithKeychain,
  broadcastWithKeychain,
  getHiveHbdTicker,
  getHiveHbdMarketQuote,
  swapHiveHbdWithSlippage,
  claimRewardsWithKeychain,
  claimHbdSavingsInterest,
  type SwapDirection,
} from '@/lib/hive/client-functions';
import EditProfileModal from '@/components/wallet/EditProfileModal';
import { useHbdSavingsInterest } from '@/hooks/useHbdSavingsInterest';
import { extractNumber } from '@/lib/utils/extractNumber';
import WalletModal from '@/components/wallet/WalletModal';
import TransactionHistory from '@/components/wallet/TransactionHistory';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { useSnapieAuth } from '@/contexts/SnapieAuthContext';

interface WalletPageProps {
  username: string;
}

interface WalletModalContent {
  title: string;
  description?: string;
  showMemoField?: boolean;
  showUsernameField?: boolean;
  swapDirection?: SwapDirection;
}

export default function WalletPage({ username }: WalletPageProps) {
  const router = useRouter();
  const { username: user } = useCurrentUser();
  const { snapieUser } = useSnapieAuth();
  const { hiveAccount, isLoading, error, refetch } = useHiveAccount(username);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();

  const [prices, setPrices] = useState<{ hive: number; hbd: number } | null>(null);
  const [profileMetadata, setProfileMetadata] = useState<{ profileImage: string; coverImage: string; website: string; name: string; about: string; location: string }>({
    profileImage: '',
    coverImage: '',
    website: '',
    name: '',
    about: '',
    location: '',
  });
  const [profileInfo, setProfileInfo] = useState<any>(null);
  const [modalContent, setModalContent] = useState<WalletModalContent | null>(null);
  const [hivePower, setHivePower] = useState<string | undefined>(undefined);
  const [swapPrice, setSwapPrice] = useState<number | null>(null);
  const [swapQuote, setSwapQuote] = useState<{ highestBid: number; lowestAsk: number; latest: number } | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClaimingInterest, setIsClaimingInterest] = useState(false);
  const { pendingInterest, annualRatePct, isLoading: isInterestLoading } = useHbdSavingsInterest(hiveAccount);

  const textMuted = 'gray.400';
  const successColor = 'success';
  const accentColor = 'accent';

  useEffect(() => {
    const empty = { profileImage: '', coverImage: '', website: '', name: '', about: '', location: '' };
    const raw = hiveAccount?.posting_json_metadata;
    if (!raw) { setProfileMetadata(empty); return; }
    try {
      const parsedMetadata = JSON.parse(raw);
      const profile = parsedMetadata?.profile || {};
      setProfileMetadata({
        profileImage: profile.profile_image || '',
        coverImage: profile.cover_image || '',
        website: profile.website || '',
        name: profile.name || '',
        about: profile.about || '',
        location: profile.location || '',
      });
    } catch (err) {
      console.error('Failed to parse profile metadata', err);
      setProfileMetadata(empty);
    }
  }, [hiveAccount?.posting_json_metadata]);

  useEffect(() => {
    const fetchProfileInfo = async () => {
      try {
        const profileData = await getProfile(username);
        setProfileInfo(profileData);
      } catch (err) {
        console.error('Failed to fetch profile info', err);
      }
    };
    if (username) fetchProfileInfo();
  }, [username]);

  useEffect(() => {
    const fetchHivePower = async () => {
      if (hiveAccount?.vesting_shares) {
        try {
          const power = (await convertVestToHive(Number(extractNumber(String(hiveAccount.vesting_shares))))).toFixed(3);
          setHivePower(power.toString());
        } catch (err) {
          console.error('Failed to convert vesting shares to Hive power', err);
        }
      }
    };
    fetchHivePower();
  }, [hiveAccount?.vesting_shares]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const priceData = await getCryptoPrices();
        setPrices(priceData);
      } catch (err) {
        console.error('Failed to fetch crypto prices', err);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchSwapPrice = async () => {
      try {
        const [ticker, marketQuote] = await Promise.all([
          getHiveHbdTicker(),
          getHiveHbdMarketQuote(),
        ]);
        setSwapPrice(ticker);
        setSwapQuote(marketQuote);
      } catch (err) {
        console.error('Failed to fetch HIVE/HBD ticker', err);
      }
    };
    fetchSwapPrice();
    const interval = setInterval(fetchSwapPrice, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleModalOpen = (content: WalletModalContent) => {
    setModalContent(content);
    onOpen();
  };

  const executableSwapPrice = modalContent?.swapDirection
    ? (modalContent.swapDirection === 'HIVE_TO_HBD'
      ? (swapQuote?.highestBid || swapQuote?.latest || swapPrice || 0)
      : (swapQuote?.lowestAsk || swapQuote?.latest || swapPrice || 0))
    : swapPrice || 0;

  async function handleConfirm(amount: number, username?: string, memo?: string, swapDirection?: SwapDirection, slippagePercent?: number) {
    if (!modalContent || !user) return;
    try {
      switch (modalContent.title) {
        case 'Send HIVE':
          if (username) await transferWithKeychain(user, username, amount.toFixed(3), memo || '', 'HIVE');
          break;
        case 'Power Up':
          await powerUpWithKeychain(user, amount);
          break;
        case 'Convert HBD → HIVE':
          await broadcastWithKeychain(user, [["convert", { "owner": user, "requestid": Math.floor(1000000000 + Math.random() * 9000000000), "amount": { "amount": amount.toFixed(3), "precision": 3, "nai": "@@000000013" } }]], 'active');
          break;
        case 'Swap HIVE':
        case 'Swap HBD': {
          if (!swapDirection) throw new Error('Swap direction is required.');
          if (!swapPrice) throw new Error('Market price unavailable.');
          await swapHiveHbdWithSlippage({
            username: user,
            direction: swapDirection,
            amount,
            slippagePercent: slippagePercent ?? 0.5,
          });
          break;
        }
        case 'HIVE Savings':
          await broadcastWithKeychain(user, [["transfer_to_savings", { "from": user, "to": user, "amount": amount.toFixed(3) + " HIVE", "memo": memo || "" }]], 'active');
          break;
        case 'Power Down':
          await powerDownWithKeychain(user, amount);
          break;
        case 'Delegate':
          if (username) await delegateWithKeychain(user, username, amount);
          break;
        case 'Send HBD':
          if (username) await transferWithKeychain(user, username, amount.toFixed(3), memo || '', 'HBD');
          break;
        case 'HBD Savings':
          await broadcastWithKeychain(user, [["transfer_to_savings", { "from": user, "to": user, "amount": amount.toFixed(3) + " HBD", "memo": memo || "" }]], 'active');
          break;
        case 'Withdraw HBD Savings':
          await broadcastWithKeychain(user, [["transfer_from_savings", { "from": user, "to": user, "request_id": Math.floor(1000000000 + Math.random() * 9000000000), "amount": amount.toFixed(3) + " HBD", "memo": memo || "" }]], 'active');
          break;
        case 'Withdraw HIVE Savings':
          await broadcastWithKeychain(user, [["transfer_from_savings", { "from": user, "to": user, "request_id": Math.floor(1000000000 + Math.random() * 9000000000), "amount": amount.toFixed(3) + " HIVE", "memo": memo || "" }]], 'active');
          break;
        default:
          console.log('Default action - Amount:', amount, 'Memo:', memo);
      }
    } catch (error) {
      console.error('Transaction failed:', error);
    }
    onClose();
    setTimeout(refetch, 3500);
  }

  const followers = profileInfo?.stats?.followers || 0;
  const following = profileInfo?.stats?.following || 0;
  const location = profileInfo?.metadata?.profile?.location || '';

  if (isLoading || !hiveAccount) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner size="xl" color="primary" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Alert status="error" borderRadius="md" variant="solid">
          <AlertIcon />
          {error}
        </Alert>
      </Box>
    );
  }

  const rewardHive = String(hiveAccount?.reward_hive_balance ?? '0.000 HIVE');
  const rewardHbd = String(hiveAccount?.reward_hbd_balance ?? '0.000 HBD');
  const rewardVests = String(hiveAccount?.reward_vesting_balance ?? '0.000000 VESTS');
  const rewardHiveNum = extractNumber(rewardHive);
  const rewardHbdNum = extractNumber(rewardHbd);
  const rewardVestsNum = extractNumber(rewardVests);
  const rewardVestingHiveNum = extractNumber(String(hiveAccount?.reward_vesting_hive ?? '0.000 HIVE'));
  const hasPendingRewards = rewardHiveNum > 0 || rewardHbdNum > 0 || rewardVestsNum > 0;

  async function handleClaimRewards() {
    if (!user || !hasPendingRewards) return;
    setIsClaiming(true);
    try {
      await claimRewardsWithKeychain(user, rewardHive, rewardHbd, rewardVests);
    } catch (err) {
      console.error('Claim rewards failed:', err);
    } finally {
      setIsClaiming(false);
    }
    setTimeout(refetch, 3500);
  }

  const balance = hiveAccount?.balance ? String(extractNumber(String(hiveAccount.balance))) : '0.000';
  const hbdBalance = hiveAccount?.hbd_balance ? String(extractNumber(String(hiveAccount.hbd_balance))) : '0.000';
  const savingsBalance = hiveAccount?.savings_balance ? String(extractNumber(String(hiveAccount.savings_balance))) : '0.000';
  const hbdSavingsBalance = hiveAccount?.savings_hbd_balance ? String(extractNumber(String(hiveAccount.savings_hbd_balance))) : '0.000';
  const isOwnWallet = user === username;

  const totalUSD = prices
    ? (parseFloat(balance) * prices.hive) +
      (parseFloat(hbdBalance) * prices.hbd) +
      (parseFloat(hivePower || '0') * prices.hive) +
      (parseFloat(savingsBalance) * prices.hive) +
      (parseFloat(hbdSavingsBalance) * prices.hbd)
    : 0;

  return (
    <Box color="text" maxW="container.lg" mx="auto">
      {/* Profile Header */}
      <Box position="relative" height="200px" borderTopRadius="xl" overflow="hidden">
        <Image
          src={profileMetadata.coverImage}
          alt={`${hiveAccount?.name} cover`}
          width="100%"
          height="100%"
          objectFit="cover"
          fallback={<div />}
        />
      </Box>

      <Flex position="relative" mt={-16} p={4} alignItems="center" boxShadow="lg" justifyContent="space-between" borderBottomRadius="xl">
        <Box
          position="absolute"
          top={0} left={0} right={0} bottom={0}
          bg="muted"
          opacity={0.92}
          zIndex={1}
          backdropFilter="blur(12px)"
          borderBottomRadius="xl"
        />

        <Flex alignItems="center" zIndex={2} position="relative">
          <Avatar
            src={getHiveAvatarUrl(username, 'large')}
            name={hiveAccount?.name}
            borderRadius="full"
            boxSize="100px"
            mr={4}
            border="2px solid"
            borderColor="primary"
            boxShadow="0 0 18px rgba(24, 168, 255, 0.25)"
          />
          <Box>
            <Flex alignItems="center" gap={2}>
              <Heading as="h2" size="lg" color="primary">
                {profileInfo?.metadata?.profile?.name || username}
              </Heading>
              <Badge colorScheme="purple" fontSize="xs" borderRadius="full" px={2}>
                {profileInfo?.reputation ? Math.round(profileInfo.reputation) : 0}
              </Badge>
            </Flex>
            <Text fontSize="xs" color="text" mt={1} opacity={0.7}>
              {following} following · {followers} followers {location && `· ${location}`}
            </Text>
            {profileMetadata.website && (
              <Flex alignItems="center" mt={1} gap={1}>
                <Icon as={FaGlobe} w={3} h={3} color="primary" onClick={() => window.open(profileMetadata.website, '_blank')} style={{ cursor: 'pointer' }} />
                <Text fontSize="xs" color="primary">{profileMetadata.website}</Text>
              </Flex>
            )}
          </Box>
        </Flex>

        <HStack zIndex={2} position="relative" spacing={2}>
          {isOwnWallet && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Icon as={FaEdit} boxSize={3} />}
              onClick={onEditOpen}
              color="gray.400"
              _hover={{ color: 'primary', bg: 'rgba(24,168,255,0.08)' }}
              borderRadius="full"
              px={3}
            >
              Edit Profile
            </Button>
          )}
          <Flex
            alignItems="center" gap={2}
            bg="rgba(24, 168, 255, 0.1)"
            border="1px solid" borderColor="rgba(24, 168, 255, 0.3)"
            borderRadius="full" px={4} py={2}
          >
            <Icon as={FaCoins} color="primary" boxSize={4} />
            <Text fontSize="sm" fontWeight="bold" color="primary">Wallet</Text>
          </Flex>
        </HStack>
      </Flex>

      {/* Wallet Content */}
      <Container maxW="container.lg" mt={8}>

        {/* Estimated Account Value Hero */}
        {prices && (
          <Box
            bg="muted"
            p={7}
            borderRadius="10px"
            border="tb1"
            boxShadow="lg"
            mb={6}
            position="relative"
            overflow="hidden"
          >
            <Box
              position="absolute" top="-50px" right="-50px"
              w="180px" h="180px" borderRadius="full"
              bg="rgba(24, 168, 255, 0.07)" filter="blur(50px)"
              pointerEvents="none"
            />
            <Box
              position="absolute" bottom="-30px" left="30%"
              w="140px" h="140px" borderRadius="full"
              bg="rgba(66, 231, 162, 0.05)" filter="blur(40px)"
              pointerEvents="none"
            />

            <Flex justifyContent="space-between" alignItems="center" position="relative">
              <Box>
                <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="widest" mb={2}>
                  Estimated Account Value
                </Text>
                <Heading
                  fontSize={{ base: '4xl', md: '5xl' }}
                  color={successColor}
                  letterSpacing="-0.02em"
                  lineHeight={1}
                  mb={2}
                >
                  ${totalUSD.toFixed(2)}
                </Heading>
                <Text fontSize="xs" color={textMuted}>USD equivalent across all holdings</Text>
              </Box>

              <VStack align="flex-end" spacing={3}>
                <HStack spacing={2}>
                  <Box w="8px" h="8px" borderRadius="full" bg="primary" boxShadow="0 0 8px rgba(24, 168, 255, 0.7)" />
                  <VStack spacing={0} align="flex-end">
                    <Text fontSize="xs" color={textMuted}>HIVE</Text>
                    <Text fontSize="sm" fontWeight="bold">${prices.hive.toFixed(3)}</Text>
                  </VStack>
                </HStack>
                <HStack spacing={2}>
                  <Box w="8px" h="8px" borderRadius="full" bg={successColor} boxShadow="0 0 8px rgba(66, 231, 162, 0.7)" />
                  <VStack spacing={0} align="flex-end">
                    <Text fontSize="xs" color={textMuted}>HBD</Text>
                    <Text fontSize="sm" fontWeight="bold">${prices.hbd.toFixed(3)}</Text>
                  </VStack>
                </HStack>
              </VStack>
            </Flex>
          </Box>
        )}

        {/* Summary Stats */}
        <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4} mb={8}>
          <Box bg="muted" borderRadius="10px" border="tb1" boxShadow="md" overflow="hidden">
            <Box h="3px" bgGradient="linear(90deg, primary, accent)" />
            <Box p={5}>
              <Flex alignItems="center" gap={3} mb={3}>
                <Flex w={9} h={9} borderRadius="full" bg="rgba(24, 168, 255, 0.12)" border="1px solid" borderColor="rgba(24, 168, 255, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaCoins} color="primary" boxSize={4} />
                </Flex>
                <Text fontSize="sm" color={textMuted} fontWeight="semibold">Total HIVE</Text>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold" color="primary" mb={0.5}>{balance}</Text>
              <Text fontSize="xs" color={textMuted}>
                {prices ? `≈ $${(parseFloat(balance) * prices.hive).toFixed(2)} USD` : 'Liquid Balance'}
              </Text>
            </Box>
          </Box>

          <Box bg="muted" borderRadius="10px" border="tb1" boxShadow="md" overflow="hidden">
            <Box h="3px" bgGradient="linear(90deg, accent, primary)" />
            <Box p={5}>
              <Flex alignItems="center" gap={3} mb={3}>
                <Flex w={9} h={9} borderRadius="full" bg="rgba(102, 228, 255, 0.12)" border="1px solid" borderColor="rgba(102, 228, 255, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaChartLine} color={accentColor} boxSize={4} />
                </Flex>
                <Text fontSize="sm" color={textMuted} fontWeight="semibold">Hive Power</Text>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold" color={accentColor} mb={0.5}>{hivePower || '...'}</Text>
              <Text fontSize="xs" color={textMuted}>
                {prices && hivePower ? `≈ $${(parseFloat(hivePower) * prices.hive).toFixed(2)} USD` : 'Staked Power'}
              </Text>
            </Box>
          </Box>

          <Box bg="muted" borderRadius="10px" border="tb1" boxShadow="md" overflow="hidden">
            <Box h="3px" bgGradient="linear(90deg, success, primary)" />
            <Box p={5}>
              <Flex alignItems="center" gap={3} mb={3}>
                <Flex w={9} h={9} borderRadius="full" bg="rgba(66, 231, 162, 0.12)" border="1px solid" borderColor="rgba(66, 231, 162, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaDollarSign} color={successColor} boxSize={4} />
                </Flex>
                <Text fontSize="sm" color={textMuted} fontWeight="semibold">HBD Balance</Text>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold" color={successColor} mb={0.5}>{hbdBalance}</Text>
              <Text fontSize="xs" color={textMuted}>
                {prices ? `≈ $${(parseFloat(hbdBalance) * prices.hbd).toFixed(2)} USD` : 'Stable Coin'}
              </Text>
            </Box>
          </Box>
        </Grid>

        {/* Detailed Wallet Sections */}
        <VStack spacing={4} align="stretch">

          {/* Custodial Account Notice */}
          {isOwnWallet && snapieUser?.custodyMode === 'custodial' && (
            <Box
              bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
              sx={{ border: '1px solid rgba(167, 139, 250, 0.25)', borderLeft: '3px solid #a78bfa' }}
            >
              <Box p={5}>
                <Flex alignItems="flex-start" gap={4}>
                  <Flex
                    w={10} h={10} borderRadius="full" flexShrink={0}
                    bg="rgba(167, 139, 250, 0.12)" border="1px solid" borderColor="rgba(167, 139, 250, 0.25)"
                    alignItems="center" justifyContent="center"
                  >
                    <Icon as={FaShieldAlt} color="purple.300" boxSize={4} />
                  </Flex>
                  <Box flex={1}>
                    <Flex alignItems="center" gap={2} mb={2}>
                      <Heading size="sm" color="purple.300">Custodial Account</Heading>
                      <Badge colorScheme="purple" fontSize="xs" borderRadius="full" px={2} variant="subtle">
                        Snapie Managed
                      </Badge>
                    </Flex>
                    <Text fontSize="sm" color={textMuted} mb={2}>
                      Snapie securely holds your account keys on your behalf, so you can use Hive without managing a wallet yourself. Your HIVE is always yours — Snapie simply signs transactions when you take action.
                    </Text>
                    <Text fontSize="sm" color={textMuted} mb={4}>
                      You can take full ownership of your keys at any time by <Text as="span" color="purple.300" fontWeight="semibold">emancipating</Text> your account. Once emancipated, you manage your own wallet and Snapie no longer has access to your keys.
                    </Text>
                    <Button
                      as="a"
                      href="https://auth.snapie.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      variant="outline"
                      colorScheme="purple"
                      rightIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    >
                      Emancipate at auth.snapie.io
                    </Button>
                  </Box>
                </Flex>
              </Box>
            </Box>
          )}

          {/* HIVE */}
          <Box
            bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
            sx={{ border: '1px solid rgba(102, 228, 255, 0.18)', borderLeft: '3px solid var(--chakra-colors-primary)' }}
          >
            <Flex justifyContent="space-between" alignItems="center" p={5} pb={isOwnWallet ? 3 : 5}>
              <Flex alignItems="center" gap={3}>
                <Flex w={10} h={10} borderRadius="full" bg="rgba(24, 168, 255, 0.12)" border="1px solid" borderColor="rgba(24, 168, 255, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaCoins} color="primary" boxSize={4} />
                </Flex>
                <Box>
                  <Heading size="md">HIVE</Heading>
                  <Text fontSize="xs" color={textMuted}>Liquid balance</Text>
                </Box>
              </Flex>
              <Box textAlign="right">
                <Text fontSize="2xl" fontWeight="bold">{balance}</Text>
                {prices && <Text fontSize="xs" color={textMuted}>≈ ${(parseFloat(balance) * prices.hive).toFixed(2)}</Text>}
              </Box>
            </Flex>
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap" px={5} pb={4}>
                <Button size="sm" leftIcon={<FaPaperPlane />} onClick={() => handleModalOpen({ title: 'Send HIVE', description: 'Send Hive to another account', showMemoField: true, showUsernameField: true })} variant="outline" colorScheme="blue">Send</Button>
                <Button size="sm" leftIcon={<FaArrowUp />} onClick={() => handleModalOpen({ title: 'Power Up', description: 'Power Up your HIVE to HP' })} variant="outline" colorScheme="purple">Power Up</Button>
                <Button size="sm" leftIcon={<FaExchangeAlt />} onClick={() => handleModalOpen({ title: 'Convert HBD → HIVE', description: 'Burn HBD to receive HIVE at a 3.5-day average price' })} variant="outline" colorScheme="orange">Convert</Button>
                <Button size="sm" leftIcon={<FaExchangeAlt />} onClick={() => handleModalOpen({ title: 'Swap HIVE', description: 'Fast market swap HIVE -> HBD (immediate-or-cancel)', swapDirection: 'HIVE_TO_HBD' })} variant="outline" colorScheme="yellow">Swap</Button>
                <Button size="sm" leftIcon={<FaPiggyBank />} onClick={() => handleModalOpen({ title: 'HIVE Savings', description: 'Transfer to HIVE savings' })} variant="outline" colorScheme="teal">To Savings</Button>
                <Button
                  size="sm"
                  leftIcon={<FaShoppingCart />}
                  variant="outline"
                  colorScheme="green"
                  isDisabled
                  title="Coming soon"
                >
                  Buy HIVE (Coming soon)
                </Button>
              </Flex>
            )}
          </Box>

          {/* Hive Power */}
          <Box
            bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
            sx={{ border: '1px solid rgba(102, 228, 255, 0.18)', borderLeft: '3px solid var(--chakra-colors-accent)' }}
          >
            <Flex justifyContent="space-between" alignItems="center" p={5} pb={isOwnWallet ? 3 : 5}>
              <Flex alignItems="center" gap={3}>
                <Flex w={10} h={10} borderRadius="full" bg="rgba(102, 228, 255, 0.12)" border="1px solid" borderColor="rgba(102, 228, 255, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaChartLine} color={accentColor} boxSize={4} />
                </Flex>
                <Box>
                  <Heading size="md">Hive Power</Heading>
                  <Text fontSize="xs" color={textMuted}>Staked HIVE for voting power</Text>
                </Box>
              </Flex>
              <Box textAlign="right">
                <Text fontSize="2xl" fontWeight="bold">{hivePower || 'Loading...'}</Text>
                {prices && hivePower && <Text fontSize="xs" color={textMuted}>≈ ${(parseFloat(hivePower) * prices.hive).toFixed(2)}</Text>}
              </Box>
            </Flex>
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap" px={5} pb={4}>
                <Button size="sm" leftIcon={<FaArrowDown />} onClick={() => handleModalOpen({ title: 'Power Down', description: 'Unstake Hive Power' })} variant="outline" colorScheme="red">Power Down</Button>
                <Button size="sm" leftIcon={<FaShareAlt />} onClick={() => handleModalOpen({ title: 'Delegate', description: 'Delegate HP to another user', showMemoField: false, showUsernameField: true })} variant="outline" colorScheme="cyan">Delegate</Button>
              </Flex>
            )}
          </Box>

          {/* HBD */}
          <Box
            bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
            sx={{ border: '1px solid rgba(102, 228, 255, 0.18)', borderLeft: '3px solid var(--chakra-colors-success)' }}
          >
            <Flex justifyContent="space-between" alignItems="center" p={5} pb={isOwnWallet ? 3 : 5}>
              <Flex alignItems="center" gap={3}>
                <Flex w={10} h={10} borderRadius="full" bg="rgba(66, 231, 162, 0.12)" border="1px solid" borderColor="rgba(66, 231, 162, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaDollarSign} color={successColor} boxSize={4} />
                </Flex>
                <Box>
                  <Heading size="md">HBD</Heading>
                  <Text fontSize="xs" color={textMuted}>Stable coin pegged to USD</Text>
                </Box>
              </Flex>
              <Box textAlign="right">
                <Text fontSize="2xl" fontWeight="bold">{hbdBalance}</Text>
                {prices && <Text fontSize="xs" color={textMuted}>≈ ${(parseFloat(hbdBalance) * prices.hbd).toFixed(2)}</Text>}
              </Box>
            </Flex>
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap" px={5} pb={4}>
                <Button size="sm" leftIcon={<FaPaperPlane />} onClick={() => handleModalOpen({ title: 'Send HBD', description: 'Send HBD to another account', showMemoField: true, showUsernameField: true })} variant="outline" colorScheme="blue">Send</Button>
                <Button size="sm" leftIcon={<FaExchangeAlt />} onClick={() => handleModalOpen({ title: 'Swap HBD', description: 'Fast market swap HBD -> HIVE (immediate-or-cancel)', swapDirection: 'HBD_TO_HIVE' })} variant="outline" colorScheme="yellow">Swap</Button>
                <Button size="sm" leftIcon={<FaPiggyBank />} onClick={() => handleModalOpen({ title: 'HBD Savings', description: 'Send HBD to Savings' })} variant="outline" colorScheme="teal">To Savings</Button>
              </Flex>
            )}
          </Box>

          {/* Pending Rewards */}
          {(hasPendingRewards || isOwnWallet) && (
            <Box
              bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
              sx={{ border: '1px solid rgba(255, 200, 80, 0.25)', borderLeft: '3px solid #f6c90e' }}
            >
              <Flex justifyContent="space-between" alignItems="center" p={5} pb={isOwnWallet ? 3 : 5}>
                <Flex alignItems="center" gap={3}>
                  <Flex w={10} h={10} borderRadius="full" bg="rgba(246, 201, 14, 0.12)" border="1px solid" borderColor="rgba(246, 201, 14, 0.3)" alignItems="center" justifyContent="center">
                    <Icon as={FaGift} color="yellow.400" boxSize={4} />
                  </Flex>
                  <Box>
                    <Heading size="md">Pending Rewards</Heading>
                    <Text fontSize="xs" color={textMuted}>Unclaimed author &amp; curation rewards</Text>
                  </Box>
                </Flex>
                {!hasPendingRewards && (
                  <Text fontSize="sm" color={textMuted}>No pending rewards</Text>
                )}
              </Flex>

              {hasPendingRewards && (
                <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={3} px={5} pb={isOwnWallet ? 3 : 5}>
                  {rewardHiveNum > 0 && (
                    <Box p={3} bg="rgba(246, 201, 14, 0.05)" borderRadius="10px" border="1px solid rgba(246, 201, 14, 0.15)">
                      <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="wide" mb={1}>HIVE</Text>
                      <Text fontSize="lg" fontWeight="bold">{rewardHiveNum.toFixed(3)}</Text>
                      {prices && <Text fontSize="xs" color={textMuted}>≈ ${(rewardHiveNum * prices.hive).toFixed(2)}</Text>}
                    </Box>
                  )}
                  {rewardHbdNum > 0 && (
                    <Box p={3} bg="rgba(246, 201, 14, 0.05)" borderRadius="10px" border="1px solid rgba(246, 201, 14, 0.15)">
                      <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="wide" mb={1}>HBD</Text>
                      <Text fontSize="lg" fontWeight="bold">{rewardHbdNum.toFixed(3)}</Text>
                      {prices && <Text fontSize="xs" color={textMuted}>≈ ${(rewardHbdNum * prices.hbd).toFixed(2)}</Text>}
                    </Box>
                  )}
                  {rewardVestsNum > 0 && (
                    <Box p={3} bg="rgba(246, 201, 14, 0.05)" borderRadius="10px" border="1px solid rgba(246, 201, 14, 0.15)">
                      <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="wide" mb={1}>HP</Text>
                      <Text fontSize="lg" fontWeight="bold">{rewardVestingHiveNum.toFixed(3)}</Text>
                      {prices && <Text fontSize="xs" color={textMuted}>≈ ${(rewardVestingHiveNum * prices.hive).toFixed(2)}</Text>}
                    </Box>
                  )}
                </Grid>
              )}

              {isOwnWallet && hasPendingRewards && (
                <Flex px={5} pb={4}>
                  <Button
                    size="sm"
                    leftIcon={<FaGift />}
                    colorScheme="yellow"
                    variant="outline"
                    isLoading={isClaiming}
                    loadingText="Claiming..."
                    onClick={handleClaimRewards}
                  >
                    Claim Rewards
                  </Button>
                </Flex>
              )}
            </Box>
          )}

          {/* Savings */}
          <Box
            bg="muted" borderRadius="10px" boxShadow="md" overflow="hidden"
            sx={{ border: '1px solid rgba(102, 228, 255, 0.18)', borderLeft: '3px solid var(--chakra-colors-accent)' }}
          >
            <Box p={5}>
              <Flex alignItems="center" gap={3} mb={5}>
                <Flex w={10} h={10} borderRadius="full" bg="rgba(102, 228, 255, 0.12)" border="1px solid" borderColor="rgba(102, 228, 255, 0.25)" alignItems="center" justifyContent="center">
                  <Icon as={FaPiggyBank} color="accent" boxSize={4} />
                </Flex>
                <Box>
                  <Heading size="md">Savings</Heading>
                  <Text fontSize="xs" color={textMuted}>Locked funds earning interest</Text>
                </Box>
              </Flex>

              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                <Box p={4} bg="rgba(24, 168, 255, 0.04)" borderRadius="10px" border="tb1">
                  <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="wide" mb={1}>HIVE Savings</Text>
                  <Text fontSize="xl" fontWeight="bold" mb={2}>{savingsBalance}</Text>
                  {isOwnWallet && (
                    <Button size="xs" leftIcon={<FaDollarSign />} onClick={() => handleModalOpen({ title: 'Withdraw HIVE Savings', description: 'Withdraw HIVE from Savings' })} variant="ghost" colorScheme="teal">
                      Withdraw
                    </Button>
                  )}
                </Box>
                <Box p={4} bg="rgba(66, 231, 162, 0.04)" borderRadius="10px" border="tb1">
                  <Text fontSize="xs" color={textMuted} textTransform="uppercase" letterSpacing="wide" mb={1}>HBD Savings</Text>
                  <Text fontSize="xl" fontWeight="bold" mb={1}>{hbdSavingsBalance}</Text>
                  {annualRatePct > 0 && (
                    <Text fontSize="xs" color="green.400" mb={2}>{annualRatePct.toFixed(0)}% APR</Text>
                  )}
                  {isOwnWallet && pendingInterest >= 0.001 && (
                    <Box mb={2} p={2} bg="rgba(66, 231, 162, 0.08)" borderRadius="8px" border="1px solid" borderColor="rgba(66, 231, 162, 0.2)">
                      <Text fontSize="xs" color={textMuted} mb={1}>Pending interest</Text>
                      <Text fontSize="sm" fontWeight="bold" color="green.300" mb={2}>
                        {isInterestLoading ? '…' : `~${pendingInterest.toFixed(3)} HBD`}
                      </Text>
                      <Button
                        size="xs"
                        colorScheme="green"
                        variant="solid"
                        isLoading={isClaimingInterest}
                        loadingText="Claiming…"
                        isDisabled={parseFloat(String(hiveAccount?.hbd_balance ?? '0')) < 0.001}
                        title={parseFloat(String(hiveAccount?.hbd_balance ?? '0')) < 0.001 ? 'You need at least 0.001 liquid HBD to trigger interest' : ''}
                        onClick={async () => {
                          if (!user) return;
                          setIsClaimingInterest(true);
                          try {
                            await claimHbdSavingsInterest(user);
                            setTimeout(refetch, 3500);
                          } catch (e) {
                            console.error('Failed to claim HBD interest:', e);
                          } finally {
                            setIsClaimingInterest(false);
                          }
                        }}
                      >
                        Claim Interest
                      </Button>
                    </Box>
                  )}
                  {isOwnWallet && (
                    <Button size="xs" leftIcon={<FaDollarSign />} onClick={() => handleModalOpen({ title: 'Withdraw HBD Savings', description: 'Withdraw HBD from Savings' })} variant="ghost" colorScheme="teal">
                      Withdraw
                    </Button>
                  )}
                </Box>
              </Grid>
            </Box>
          </Box>
        </VStack>

        {/* Transaction History */}
        <Box mt={8} mb={8}>
          <Flex alignItems="center" gap={3} mb={4}>
            <Flex w={8} h={8} borderRadius="full" bg="rgba(24, 168, 255, 0.12)" border="1px solid" borderColor="rgba(24, 168, 255, 0.25)" alignItems="center" justifyContent="center">
              <Icon as={FaExchangeAlt} color="primary" boxSize={3.5} />
            </Flex>
            <Heading size="lg">Transaction History</Heading>
          </Flex>
          <TransactionHistory username={username} />
        </Box>
      </Container>

      <WalletModal
        isOpen={isOpen}
        onClose={onClose}
        title={modalContent?.title || ''}
        description={modalContent?.description}
        showMemoField={modalContent?.showMemoField}
        showUsernameField={modalContent?.showUsernameField}
        swapConfig={{
          enabled: Boolean(modalContent?.swapDirection),
          direction: modalContent?.swapDirection || 'HIVE_TO_HBD',
          price: executableSwapPrice || undefined,
          slippagePercent: 0.5,
        }}
        onConfirm={handleConfirm}
      />

      <EditProfileModal
        isOpen={isEditOpen}
        onClose={onEditClose}
        username={username}
        initialData={profileMetadata}
        onSaved={refetch}
      />
    </Box>
  );
}
