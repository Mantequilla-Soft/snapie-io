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
  GridItem,
  Button,
  HStack,
  VStack,
  Badge,
  useColorModeValue,
  useDisclosure,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
} from '@chakra-ui/react';
import { FaGlobe, FaExchangeAlt, FaPiggyBank, FaStore, FaShoppingCart, FaArrowDown, FaShareAlt, FaDollarSign, FaArrowUp, FaPaperPlane, FaCoins, FaChartLine } from 'react-icons/fa';
import useHiveAccount from '@/hooks/useHiveAccount';
import { getProfile, convertVestToHive, getCryptoPrices, transferWithKeychain, powerUpWithKeychain, powerDownWithKeychain, delegateWithKeychain, broadcastWithKeychain } from '@/lib/hive/client-functions';
import { extractNumber } from '@/lib/utils/extractNumber';
import WalletModal from '@/components/wallet/WalletModal';
import TransactionHistory from '@/components/wallet/TransactionHistory';
import { useRouter } from 'next/navigation';
import { useAioha } from '@aioha/react-ui';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

interface WalletPageProps {
  username: string;
}

export default function WalletPage({ username }: WalletPageProps) {
  const router = useRouter();
  const { user } = useAioha();
  const { hiveAccount, isLoading, error } = useHiveAccount(username);
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [prices, setPrices] = useState<{ hive: number; hbd: number } | null>(null);
  
  const [profileMetadata, setProfileMetadata] = useState<{ profileImage: string; coverImage: string; website: string }>({
    profileImage: '',
    coverImage: '',
    website: '',
  });
  const [profileInfo, setProfileInfo] = useState<any>(null);
  const [modalContent, setModalContent] = useState<{ title: string, description?: string, showMemoField?: boolean, showUsernameField?: boolean } | null>(null);
  const [hivePower, setHivePower] = useState<string | undefined>(undefined);

  // Use theme colors directly - no useColorModeValue needed
  const cardBg = 'muted';
  const borderColor = 'border';
  const hoverBg = 'secondary';
  const textMuted = 'gray.400';
  const successColor = 'success';
  const accentColor = 'accent';

  useEffect(() => {
    if (hiveAccount?.json_metadata) {
      try {
        const parsedMetadata = JSON.parse(hiveAccount.posting_json_metadata);
        const profile = parsedMetadata?.profile || {};
        setProfileMetadata({
          profileImage: profile.profile_image || '',
          coverImage: profile.cover_image || '',
          website: profile.website || '',
        });
      } catch (err) {
        console.error('Failed to parse profile metadata', err);
      }
    }
  }, [hiveAccount]);

  useEffect(() => {
    const fetchProfileInfo = async () => {
      try {
        const profileData = await getProfile(username);
        setProfileInfo(profileData);
      } catch (err) {
        console.error('Failed to fetch profile info', err);
      }
    };

    if (username) {
      fetchProfileInfo();
    }
  }, [username]);

  useEffect(() => {
    const fetchHivePower = async () => {
      if (hiveAccount?.vesting_shares) {
        try {
          const power = (await convertVestToHive(Number(extractNumber(String(hiveAccount.vesting_shares))))).toFixed(3);
          setHivePower(power.toString());
        } catch (err) {
          console.error("Failed to convert vesting shares to Hive power", err);
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
    // Refresh prices every 5 minutes
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleModalOpen = (title: string, description?: string, showMemoField?: boolean, showUsernameField?: boolean) => {
    setModalContent({ title, description, showMemoField, showUsernameField });
    onOpen();
  };

  async function handleConfirm(amount: number, username?: string, memo?: string) {
    if (!modalContent || !user) return;

    try {
      switch (modalContent.title) {
        case 'Send HIVE':
          if (username) {
            await transferWithKeychain(user, username, amount.toFixed(3), memo || '', 'HIVE');
          }
          break;
        case 'Power Up':
          await powerUpWithKeychain(user, amount);
          break;
        case 'Convert to HBD':
          await broadcastWithKeychain(user, [
            [
              "convert",
              {
                "owner": user,
                "requestid": Math.floor(1000000000 + Math.random() * 9000000000),
                "amount": {
                  "amount": amount.toFixed(3),
                  "precision": 3,
                  "nai": "@@000000013"
                }
              }
            ]
          ], 'active');
          break;
        case 'HIVE Savings':
          await broadcastWithKeychain(user, [
            [
              "transfer_to_savings",
              {
                "from": user,
                "to": user,
                "amount": amount.toFixed(3) + " HIVE",
                "memo": memo || ""
              }
            ]
          ], 'active');
          break;
        case 'Power Down':
          await powerDownWithKeychain(user, amount);
          break;
        case 'Delegate':
          if (username) {
            await delegateWithKeychain(user, username, amount);
          }
          break;
        case 'Send HBD':
          if (username) {
            await transferWithKeychain(user, username, amount.toFixed(3), memo || '', 'HBD');
          }
          break;
        case 'HBD Savings':
          await broadcastWithKeychain(user, [
            [
              "transfer_to_savings",
              {
                "from": user,
                "to": user,
                "amount": amount.toFixed(3) + " HBD",
                "memo": memo || ""
              }
            ]
          ], 'active');
          break;
        case 'Withdraw HBD Savings':
          await broadcastWithKeychain(user, [
            [
              "transfer_from_savings",
              {
                "from": user,
                "to": user,
                "request_id": Math.floor(1000000000 + Math.random() * 9000000000),
                "amount": amount.toFixed(3) + " HBD",
                "memo": memo || ""
              }
            ]
          ], 'active');
          break;
        case 'Withdraw HIVE Savings':
          await broadcastWithKeychain(user, [
            [
              "transfer_from_savings",
              {
                "from": user,
                "to": user,
                "request_id": Math.floor(1000000000 + Math.random() * 9000000000),
                "amount": amount.toFixed(3) + " HIVE",
                "memo": memo || ""
              }
            ]
          ], 'active');
          break;
        default:
          console.log('Default action - Amount:', amount, 'Memo:', memo);
          break;
      }
    } catch (error) {
      console.error('Transaction failed:', error);
    }
    
    onClose();
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

  const balance = hiveAccount?.balance ? String(extractNumber(String(hiveAccount.balance))) : "0.000";
  const hbdBalance = hiveAccount?.hbd_balance ? String(extractNumber(String(hiveAccount.hbd_balance))) : "0.000";
  const savingsBalance = hiveAccount?.savings_balance ? String(extractNumber(String(hiveAccount.savings_balance))) : "0.000";
  const hbdSavingsBalance = hiveAccount?.savings_hbd_balance ? String(extractNumber(String(hiveAccount.savings_hbd_balance))) : "0.000";

  const isOwnWallet = user === username;

  return (
    <Box color="text" maxW="container.lg" mx="auto">
      {/* Profile Header - Same as ProfilePage */}
      <Box position="relative" height="200px">
        <Container id="cover" maxW="container.lg" p={0} overflow="hidden" position="relative" height="100%">
          <Image
            src={profileMetadata.coverImage}
            alt={`${hiveAccount?.name} cover`}
            width="100%"
            height="100%"
            objectFit="cover"
            mb={4}
            fallback={(<div></div>)}
          />
        </Container>
      </Box>

      <Flex position="relative" mt={-16} p={4} alignItems="center" boxShadow="lg" justifyContent="space-between">
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="muted"
          opacity={0.85}
          zIndex={1}
        />

        <Flex alignItems="center" zIndex={2} position="relative">
          <Avatar
            src={getHiveAvatarUrl(username, 'large')}
            name={hiveAccount?.name}
            borderRadius="full"
            boxSize="100px"
            mr={4}
          />

          <Box>
            <Flex alignItems="center">
              <Heading as="h2" size="lg" color="primary" mr={2}>
                {profileInfo?.metadata.profile.name || username}
              </Heading>
              <Badge colorScheme="purple" fontSize="xs">
                {profileInfo?.reputation ? Math.round(profileInfo.reputation) : 0}
              </Badge>
            </Flex>

            <Text fontSize="xs" color="text" mt={1}>
              Following: {following} | Followers: {followers} {location && `| Location: ${location}`}
            </Text>

            {profileMetadata.website && (
              <Flex alignItems="center" mt={1}>
                <Icon as={FaGlobe} w={2} h={2} onClick={() => window.open(profileMetadata.website, '_blank')} style={{ cursor: 'pointer' }} />
                <Text ml={2} fontSize="xs" color="primary">
                  {profileMetadata.website}
                </Text>
              </Flex>
            )}
          </Box>
        </Flex>

        <Box zIndex={2} position="relative">
          <Badge bg="success" color="background" fontSize="md" px={3} py={1}>
            Wallet
          </Badge>
        </Box>
      </Flex>

      {/* Wallet Content */}
      <Container maxW="container.lg" mt={8}>
        {/* Estimated Account Value */}
        {prices && (
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="lg" mb={6}>
            <Flex justifyContent="space-between" alignItems="center">
              <Box>
                <Text fontSize="sm" color={textMuted} mb={1}>Estimated Account Value</Text>
                <Heading size="xl" color={successColor}>
                  ${(
                    (parseFloat(balance) * prices.hive) +
                    (parseFloat(hbdBalance) * prices.hbd) +
                    (parseFloat(hivePower || '0') * prices.hive) +
                    (parseFloat(savingsBalance) * prices.hive) +
                    (parseFloat(hbdSavingsBalance) * prices.hbd)
                  ).toFixed(2)}
                </Heading>
              </Box>
              <VStack align="flex-end" spacing={1}>
                <Text fontSize="xs" color={textMuted}>
                  HIVE: ${prices.hive.toFixed(3)}
                </Text>
                <Text fontSize="xs" color={textMuted}>
                  HBD: ${prices.hbd.toFixed(3)}
                </Text>
              </VStack>
            </Flex>
          </Box>
        )}

        {/* Summary Stats */}
        <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4} mb={8}>
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Stat>
              <StatLabel fontSize="sm" color={textMuted}>Total HIVE</StatLabel>
              <StatNumber fontSize="2xl" color="primary">{balance}</StatNumber>
              <StatHelpText color={textMuted}>
                <Icon as={FaCoins} mr={1} />
                {prices ? `≈ $${(parseFloat(balance) * prices.hive).toFixed(2)}` : 'Liquid Balance'}
              </StatHelpText>
            </Stat>
          </Box>

          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Stat>
              <StatLabel fontSize="sm" color={textMuted}>Hive Power</StatLabel>
              <StatNumber fontSize="2xl" color={accentColor}>{hivePower || "..."}</StatNumber>
              <StatHelpText color={textMuted}>
                <Icon as={FaChartLine} mr={1} />
                {prices && hivePower ? `≈ $${(parseFloat(hivePower) * prices.hive).toFixed(2)}` : 'Staked Power'}
              </StatHelpText>
            </Stat>
          </Box>

          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Stat>
              <StatLabel fontSize="sm" color={textMuted}>HBD Balance</StatLabel>
              <StatNumber fontSize="2xl" color={successColor}>{hbdBalance}</StatNumber>
              <StatHelpText color={textMuted}>
                <Icon as={FaDollarSign} mr={1} />
                {prices ? `≈ $${(parseFloat(hbdBalance) * prices.hbd).toFixed(2)}` : 'Stable Coin'}
              </StatHelpText>
            </Stat>
          </Box>
        </Grid>

        {/* Detailed Wallet Sections */}
        <VStack spacing={4} align="stretch">
          {/* HIVE Section */}
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Flex justifyContent="space-between" alignItems="center" mb={4}>
              <Flex alignItems="center">
                <Icon as={FaCoins} w={6} h={6} color="primary" mr={3} />
                <Box>
                  <Heading size="md">HIVE</Heading>
                  <Text fontSize="sm" color={textMuted}>Liquid balance</Text>
                </Box>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold">{balance}</Text>
            </Flex>
            
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap">
                <Button
                  size="sm"
                  leftIcon={<FaPaperPlane />}
                  onClick={() => handleModalOpen('Send HIVE', 'Send Hive to another account', true, true)}
                  colorScheme="blue"
                  variant="outline"
                >
                  Send
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaArrowUp />}
                  onClick={() => handleModalOpen('Power Up', 'Power Up your HIVE to HP')}
                  colorScheme="purple"
                  variant="outline"
                >
                  Power Up
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaExchangeAlt />}
                  onClick={() => handleModalOpen('Convert HIVE', 'Convert HIVE to HBD')}
                  colorScheme="orange"
                  variant="outline"
                >
                  Convert
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaPiggyBank />}
                  onClick={() => handleModalOpen('HIVE Savings', 'Transfer to HIVE savings')}
                  colorScheme="teal"
                  variant="outline"
                >
                  To Savings
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaShoppingCart />}
                  onClick={() => router.push(`https://global.transak.com/?apiKey=771c8ab6-b3ba-4450-b69d-ca35e4b25eb8&redirectURL=${window.location.href}&cryptoCurrencyCode=HIVE&defaultCryptoAmount=200&exchangeScreenTitle=Buy%20HIVE&isFeeCalculationHidden=false&defaultPaymentMethod=credit_debit_card&walletAddress=${user}`)}
                  colorScheme="green"
                  variant="outline"
                >
                  Buy HIVE
                </Button>
              </Flex>
            )}
          </Box>

          {/* Hive Power Section */}
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Flex justifyContent="space-between" alignItems="center" mb={4}>
              <Flex alignItems="center">
                <Icon as={FaChartLine} w={6} h={6} color={accentColor} mr={3} />
                <Box>
                  <Heading size="md">Hive Power</Heading>
                  <Text fontSize="sm" color={textMuted}>Staked HIVE for voting power</Text>
                </Box>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold">{hivePower || "Loading..."}</Text>
            </Flex>
            
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap">
                <Button
                  size="sm"
                  leftIcon={<FaArrowDown />}
                  onClick={() => handleModalOpen('Power Down', 'Unstake Hive Power')}
                  colorScheme="red"
                  variant="outline"
                >
                  Power Down
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaShareAlt />}
                  onClick={() => handleModalOpen('Delegate', 'Delegate HP to another user', false, true)}
                  colorScheme="cyan"
                  variant="outline"
                >
                  Delegate
                </Button>
              </Flex>
            )}
          </Box>

          {/* HBD Section */}
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Flex justifyContent="space-between" alignItems="center" mb={4}>
              <Flex alignItems="center">
                <Icon as={FaDollarSign} w={6} h={6} color={successColor} mr={3} />
                <Box>
                  <Heading size="md">HBD (Hive Backed Dollar)</Heading>
                  <Text fontSize="sm" color={textMuted}>Stable coin pegged to USD</Text>
                </Box>
              </Flex>
              <Text fontSize="2xl" fontWeight="bold">{hbdBalance}</Text>
            </Flex>
            
            {isOwnWallet && (
              <Flex gap={2} flexWrap="wrap">
                <Button
                  size="sm"
                  leftIcon={<FaPaperPlane />}
                  onClick={() => handleModalOpen('Send HBD', 'Send HBD to another account', true, true)}
                  colorScheme="blue"
                  variant="outline"
                >
                  Send
                </Button>
                <Button
                  size="sm"
                  leftIcon={<FaPiggyBank />}
                  onClick={() => handleModalOpen('HBD Savings', 'Send HBD to Savings')}
                  colorScheme="teal"
                  variant="outline"
                >
                  To Savings
                </Button>
              </Flex>
            )}
          </Box>

          {/* Savings Section */}
          <Box bg={cardBg} p={6} borderRadius="lg" border="1px" borderColor={borderColor} boxShadow="md">
            <Flex alignItems="center" mb={4}>
              <Icon as={FaPiggyBank} w={6} h={6} color="accent" mr={3} />
              <Heading size="md">Savings</Heading>
            </Flex>
            
            <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
              <Box p={4} bg={hoverBg} borderRadius="md">
                <Text fontSize="sm" color={textMuted} mb={1}>HIVE Savings</Text>
                <Text fontSize="xl" fontWeight="bold">{savingsBalance}</Text>
                {isOwnWallet && (
                  <Button
                    size="xs"
                    mt={2}
                    leftIcon={<FaDollarSign />}
                    onClick={() => handleModalOpen('Withdraw HIVE Savings', 'Withdraw HIVE from Savings')}
                    variant="ghost"
                    colorScheme="teal"
                  >
                    Withdraw
                  </Button>
                )}
              </Box>

              <Box p={4} bg={hoverBg} borderRadius="md">
                <Text fontSize="sm" color={textMuted} mb={1}>HBD Savings</Text>
                <Text fontSize="xl" fontWeight="bold">{hbdSavingsBalance}</Text>
                {isOwnWallet && (
                  <Button
                    size="xs"
                    mt={2}
                    leftIcon={<FaDollarSign />}
                    onClick={() => handleModalOpen('Withdraw HBD Savings', 'Withdraw HBD from Savings')}
                    variant="ghost"
                    colorScheme="teal"
                  >
                    Withdraw
                  </Button>
                )}
              </Box>
            </Grid>
          </Box>
        </VStack>

        {/* Transaction History */}
        <Box mt={8} mb={8}>
          <Heading size="lg" mb={4}>Transaction History</Heading>
          <TransactionHistory username={username} />
        </Box>
      </Container>

      {/* Wallet Modal */}
      <WalletModal
        isOpen={isOpen}
        onClose={onClose}
        title={modalContent?.title || ''}
        description={modalContent?.description}
        showMemoField={modalContent?.showMemoField}
        showUsernameField={modalContent?.showUsernameField}
        onConfirm={handleConfirm}
      />
    </Box>
  );
}
