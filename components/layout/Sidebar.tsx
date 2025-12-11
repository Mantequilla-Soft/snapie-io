'use client';
import React, { useEffect, useState } from 'react';
import { Badge, Box, VStack, Button, Icon, Image, Spinner, Flex, Text, useColorMode, transition, Tooltip, useBreakpointValue, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Input, useToast } from '@chakra-ui/react';
import { useRouter, usePathname } from 'next/navigation';
import { useKeychain } from '@/contexts/KeychainContext';
import { FiHome, FiBell, FiUser, FiShoppingCart, FiBook, FiCreditCard, FiLogIn, FiLogOut, FiMessageSquare } from 'react-icons/fi';
import { Notifications } from '@hiveio/dhive';
import { fetchNewNotifications, getCommunityInfo, getProfile } from '@/lib/hive/client-functions';
import { animate, color, motion, px } from 'framer-motion';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

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
    isChatOpen: boolean;
    setIsChatOpen: (isOpen: boolean) => void;
    chatUnreadCount?: number;
}

export default function Sidebar({ isChatOpen, setIsChatOpen, chatUnreadCount = 0 }: SidebarProps) {
    const { user, login, logout, isLoggedIn } = useKeychain();
    const router = useRouter();
    const pathname = usePathname();
    const [notifications, setNotifications] = useState<Notifications[]>([]);
    const [communityInfo, setCommunityInfo] = useState<CommunityInfo | null>(null); // State to hold community info
    const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null); // State to hold profile info
    const [loading, setLoading] = useState(true); // Loading state
    const { colorMode } = useColorMode();
    const [modalDisplayed, setModalDisplayed] = useState(false);
    const [username, setUsername] = useState('');
    const toast = useToast();

    useEffect(() => {
        console.log('🔵 Sidebar: isChatOpen changed to:', isChatOpen);
    }, [isChatOpen]);
    
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
        const loadNotifications = async () => {
            if (user) {
                try {
                    const newNotifications = await fetchNewNotifications(user);
                    setNotifications(newNotifications);
                } catch (error) {
                    console.error("Failed to fetch notifications:", error);
                }
            }
        };

        loadNotifications();
    }, [user]);

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
            bg="muted"
            p={1}
            w={forceCompact ? '60px' : { base: 'full', sm: '60px', md: '20%' }}
            h={"100vh"}
            position={{ base: 'relative', sm: 'fixed' }}
            left={{ base: 'auto', sm: '0' }}
            top={{ base: 'auto', sm: '0' }}
            zIndex={{ base: 'auto', sm: '10' }}
            display={{ base: 'none', sm: 'block' }}
            transition="width 0.3s ease"
            sx={{
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                scrollbarWidth: 'none',
            }}
        >
            <Flex direction="column" justify="space-between" height="100%" px={forceCompact ? 1 : { sm: 1, md: 3 }}>
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
                                <Text fontSize="lg" fontWeight="bold">{communityInfo?.title}</Text>
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
                                borderRadius="md"
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
                                borderRadius="md"
                            >
                                <Text display={textDisplay}>Blog</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    {user && (
                        <>
                            <Tooltip label="Notifications" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full">
                                    <Button
                                        onClick={() => handleNavigation("/@" + user + "/notifications")}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={
                                            notifications.length > 0 ? (
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
                                        borderRadius="md"
                                    >
                                        <Text display={textDisplay}>Notifications</Text>
                                    </Button>
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
                                        borderRadius="md"
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
                                        borderRadius="md"
                                    >
                                        <Text display={textDisplay}>Wallet</Text>
                                    </Button>
                                </Box>
                            </Tooltip>
                            <Tooltip label="Chat" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        onClick={() => {
                                            console.log('🔵 Chat button clicked! Current state:', isChatOpen);
                                            setIsChatOpen(!isChatOpen);
                                            console.log('🔵 Setting chat to:', !isChatOpen);
                                        }}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={<Icon as={FiMessageSquare} boxSize={4} />}
                                        px={3}
                                        borderRadius="md"
                                        bg={isChatOpen ? 'blue.500' : 'transparent'}
                                        color={isChatOpen ? 'white' : 'inherit'}
                                        _hover={{ bg: isChatOpen ? 'blue.600' : 'gray.100' }}
                                    >
                                        <Text display={textDisplay}>Chat</Text>
                                    </Button>
                                    {chatUnreadCount > 0 && !isChatOpen && (
                                        <Badge
                                            position="absolute"
                                            top="2px"
                                            right="2px"
                                            colorScheme="red"
                                            borderRadius="full"
                                            minW="18px"
                                            h="18px"
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            fontSize="xs"
                                        >
                                            {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                                        </Badge>
                                    )}
                                </Box>
                            </Tooltip>
                        </>
                    )}
                    
                    {/* Login/Logout Button */}
                    <Tooltip label={isLoggedIn ? 'Logout' : 'Login'} placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full" mt="auto">
                            <Button
                                onClick={() => isLoggedIn ? logout() : setModalDisplayed(true)}
                                variant="solid"
                                colorScheme="teal"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={isLoggedIn ? FiLogOut : FiLogIn} boxSize={4} />}
                                px={3}
                                borderRadius="md"
                            >
                                <Text display={textDisplay}>{isLoggedIn ? 'Logout' : 'Login'}</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                </VStack>
            </Flex>
            
            {/* Login Modal */}
            <Modal isOpen={modalDisplayed} onClose={() => setModalDisplayed(false)}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Login with Hive Keychain</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <Input
                            placeholder="Enter your Hive username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            mb={4}
                        />
                        <Button
                            colorScheme="blue"
                            width="full"
                            onClick={async () => {
                                try {
                                    const success = await login(username);
                                    if (success) {
                                        setModalDisplayed(false);
                                        setUsername('');
                                        toast({
                                            title: 'Success!',
                                            description: `Logged in as @${username}`,
                                            status: 'success',
                                            duration: 3000,
                                        });
                                    }
                                } catch (error) {
                                    toast({
                                        title: 'Login failed',
                                        description: error instanceof Error ? error.message : 'Please try again',
                                        status: 'error',
                                        duration: 5000,
                                    });
                                }
                            }}
                        >
                            Login
                        </Button>
                    </ModalBody>
                </ModalContent>
            </Modal>
        </Box>
    );

}
