'use client';
import React, { useEffect, useState } from 'react';
import { Box, VStack, Button, Icon, Image, Spinner, Flex, Text, useColorMode, transition, Tooltip, useBreakpointValue, useToast } from '@chakra-ui/react';
import { CountBadge } from '@/components/ui/CountBadge';
import { useRouter, usePathname } from 'next/navigation';
import { useAioha } from '@aioha/react-ui';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { FiHome, FiBell, FiUser, FiShoppingCart, FiBook, FiCreditCard, FiLogIn, FiLogOut, FiMessageSquare, FiRadio, FiInfo, FiUserPlus } from 'react-icons/fi';
import { getCommunityInfo, getProfile } from '@/lib/hive/client-functions';
import { animate, color, motion, px } from 'framer-motion';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { useOpenPodsCount } from '@/hooks/useOpenPodsCount';
import { useHiveNotifications } from '@/hooks/useHiveNotifications';

interface ProfileInfo {
    metadata: {
        profile: {
            profile_image: string; // Profile-specific image
        };
    };
}

interface CommunityInfo {
    title: string;
    about: string;
    // No avatar_url since it's not used
}

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

interface SidebarProps {
    isChatOpen?: boolean;
    setIsChatOpen?: (v: boolean) => void;
    chatUnreadCount?: number;
}

export default function Sidebar({ isChatOpen = false, setIsChatOpen, chatUnreadCount = 0 }: SidebarProps) {
    const { user, aioha } = useAioha();
    const { openLoginModal } = useLoginModal();
    const isLoggedIn = !!user;
    const logout = () => aioha.logout();
    const router = useRouter();
    const pathname = usePathname();
    const [communityInfo, setCommunityInfo] = useState<CommunityInfo | null>(null); // State to hold community info
    const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null); // State to hold profile info
    const [loading, setLoading] = useState(true); // Loading state
    const { colorMode } = useColorMode();
    const toast = useToast();
    const openPodsCount = useOpenPodsCount();
    const { unreadCount } = useHiveNotifications(user, { limit: 1, poll: false });

    // Check if we should force compact mode (compose page)
    const forceCompact = pathname === '/compose';
    // Determine display values based on whether we're forcing compact or using responsive
    const compactBreakpoint = forceCompact ? 'block' : { sm: 'block', md: 'none' };
    const fullBreakpoint = forceCompact ? 'none' : { sm: 'none', md: 'flex' };
    const textDisplay = forceCompact ? 'none' : { sm: 'none', md: 'block' };
    const iconJustify = forceCompact ? 'center' : { sm: 'center', md: 'flex-start' };
    
    // Detect if we're in compact mode for tooltip logic
    const isCompactMode = useBreakpointValue({ base: false, sm: true, md: false }) || forceCompact;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            if (communityTag) {
                try {
                    // Fetching community data
                    const communityData = await getCommunityInfo(communityTag);
                    sessionStorage.setItem('communityData', JSON.stringify(communityData));
                    setCommunityInfo(communityData);

                    // Fetching profile data
                    const profileData = await getProfile(communityTag);
                    sessionStorage.setItem('profileData', JSON.stringify(profileData));
                    setProfileInfo(profileData);
                } catch (error) {
                    console.error('Failed to fetch data', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchData();
    }, []);

    const handleNavigation = (path: string) => {
        if (router) {
            router.push(path);
        }
    };

    return (
        <Box
            as="nav"
            bg="rgba(8, 24, 40, 0.78)"
            p={3}
            w={forceCompact ? '72px' : { base: 'full', sm: '72px', md: '260px' }}
            h={{ base: "100vh", sm: "calc(100vh - 24px)" }}
            position={{ base: 'relative', sm: 'fixed' }}
            left={{ base: 'auto', sm: '12px' }}
            top={{ base: 'auto', sm: '12px' }}
            zIndex={{ base: 'auto', sm: '10' }}
            display={{ base: 'none', sm: 'block' }}
            transition="width 0.3s ease"
            border="tb1"
            borderRadius="30px"
            boxShadow="xl"
            backdropFilter="blur(18px)"
            sx={{
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                scrollbarWidth: 'none',
            }}
        >
            <Flex direction="column" justify="space-between" height="100%" px={forceCompact ? 1 : { sm: 1, md: 2 }}>
                <VStack spacing={4} align={forceCompact ? 'center' : { sm: 'center', md: 'start' }} w="full">
                    {loading ? (
                        <Spinner size="sm" />
                    ) : (
                        <>
                            <Flex align="center" mb={4} display={fullBreakpoint}>
                                {communityTag && (
                                    <Image
                                        src={getHiveAvatarUrl(communityTag, 'medium')}
                                        alt="Profile Image"
                                        boxSize="50px"
                                        borderRadius="full"
                                        mr={2}
                                    />
                                )}
                                <Text fontSize="lg" fontWeight="bold" letterSpacing="-0.03em">{communityInfo?.title}</Text>
                            </Flex>
                            {/* Icon only for compact view */}
                            <Box display={compactBreakpoint} mb={4} w="40px" h="40px">
                                {communityTag && (
                                    <Image
                                        src={getHiveAvatarUrl(communityTag, 'small')}
                                        alt="Profile Image"
                                        boxSize="40px"
                                        borderRadius="full"
                                        objectFit="cover"
                                        minW="40px"
                                        minH="40px"
                                    />
                                )}
                            </Box>
                        </>
                    )}

                    <Tooltip label="Home" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                onClick={() => handleNavigation("/")}
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiHome} boxSize={4} />}
                                px={3}
                                mt={4}
                                borderRadius="18px"
                                _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Home</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    <Tooltip label="Blog" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                onClick={() => handleNavigation("/blog")}
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiBook} boxSize={4} />}
                                px={3}
                                borderRadius="18px"
                                _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Blog</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    <Tooltip label="OpenPods" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full" position="relative">
                            <Button
                                onClick={() => handleNavigation("/hangouts")}
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiRadio} boxSize={4} />}
                                px={3}
                                borderRadius="18px"
                                _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>OpenPods</Text>
                            </Button>
                            <CountBadge count={openPodsCount} />
                        </Box>
                    </Tooltip>
                    {user && (
                        <>
                            <Tooltip label="Notifications" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        onClick={() => handleNavigation("/@" + user + "/notifications")}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={
                                            unreadCount > 0 ? (
                                                <motion.div
                                                    animate={{ rotate: [0, 45, 0, -45, 0] }}
                                                    transition={{ duration: 0.6, repeat: Infinity }}
                                                >
                                                    <Icon as={FiBell} boxSize={4} color="red" />
                                                </motion.div>
                                            ) : (
                                                <Icon as={FiBell} boxSize={4} />
                                            )
                                        }
                                        px={3}
                                        borderRadius="18px"
                                        _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Notifications</Text>
                                    </Button>
                                    <CountBadge count={unreadCount} colorScheme="red" />
                                </Box>
                            </Tooltip>
                            <Tooltip label="Profile" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full">
                                    <Button
                                        onClick={() => handleNavigation("/@" + user)}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={
                                            user ? (
                                                <Image
                                                    src={getHiveAvatarUrl(user, 'small')}
                                                    alt="Profile Image"
                                                    boxSize={4}
                                                    borderRadius="full"
                                                />
                                            ) : (
                                                <Icon as={FiUser} boxSize={4} />
                                            )
                                        }
                                        px={3}
                                        borderRadius="18px"
                                        _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Profile</Text>
                                    </Button>
                                </Box>
                            </Tooltip>
                            <Tooltip label="Wallet" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full">
                                    <Button
                                        onClick={() => handleNavigation("/@" + user + '/wallet')}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={<Icon as={FiCreditCard} boxSize={4} />}
                                        px={3}
                                        borderRadius="18px"
                                        _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Wallet</Text>
                                    </Button>
                                </Box>
                            </Tooltip>
                            <Tooltip label="Chat" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        onClick={() => setIsChatOpen?.(!isChatOpen)}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={<Icon as={FiMessageSquare} boxSize={4} />}
                                        px={3}
                                        borderRadius="18px"
                                        bg={isChatOpen ? 'blue.500' : 'transparent'}
                                        color={isChatOpen ? 'white' : 'inherit'}
                                        _hover={{ bg: isChatOpen ? 'blue.600' : 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Chat</Text>
                                    </Button>
                                    <CountBadge count={!isChatOpen ? chatUnreadCount : 0} colorScheme="red" />
                                </Box>
                            </Tooltip>
                        </>
                    )}

                    {/* Login/Logout Button */}
                    <Tooltip label={isLoggedIn ? 'Logout' : 'Login'} placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full" mt="auto">
                            <Button
                                onClick={() => isLoggedIn ? logout() : openLoginModal()}
                                variant="solid"
                                colorScheme="teal"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={isLoggedIn ? FiLogOut : FiLogIn} boxSize={4} />}
                                px={3}
                                borderRadius="18px"
                            >
                                <Text display={textDisplay}>{isLoggedIn ? 'Logout' : 'Login'}</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    {!isLoggedIn && (
                        <Tooltip label="Create account" placement="right" hasArrow isDisabled={!isCompactMode}>
                            <Box w="full">
                                <Button
                                    onClick={() => router.push('/join')}
                                    variant="ghost"
                                    w="full"
                                    justifyContent={iconJustify}
                                    leftIcon={<Icon as={FiUserPlus} boxSize={4} />}
                                    px={3}
                                    borderRadius="18px"
                                    _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                                >
                                    <Text display={textDisplay}>Create account</Text>
                                </Button>
                            </Box>
                        </Tooltip>
                    )}
                    <Tooltip label="About Snapie" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as="a"
                                href="https://about.snapie.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiInfo} boxSize={4} />}
                                px={3}
                                borderRadius="18px"
                                _hover={{ bg: 'rgba(24, 168, 255, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>About</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                </VStack>
            </Flex>
            
        </Box>
    );

}
