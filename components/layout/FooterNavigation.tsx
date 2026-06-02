import { useAioha } from '@aioha/react-ui';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { Box, Button, HStack, Icon, Tooltip, useColorMode } from '@chakra-ui/react';
import { CountBadge } from '@/components/ui/CountBadge';
import NextLink from 'next/link';
import { FiBell, FiBook, FiCreditCard, FiHome, FiUser, FiLogIn, FiLogOut, FiMessageSquare, FiChevronLeft, FiChevronRight, FiRadio, FiUserPlus } from 'react-icons/fi';
import { useState, useRef, useEffect } from 'react';
import { useOpenPodsCount } from '@/hooks/useOpenPodsCount';
import { useHiveNotifications } from '@/hooks/useHiveNotifications';

interface FooterNavigationProps {
    isChatOpen?: boolean;
    setIsChatOpen?: (v: boolean) => void;
    chatUnreadCount?: number;
}

export default function FooterNavigation({ isChatOpen = false, setIsChatOpen, chatUnreadCount = 0 }: FooterNavigationProps) {

    const { user, aioha } = useAioha();
    const { openLoginModal } = useLoginModal();
    const logout = () => aioha.logout();
    const { colorMode } = useColorMode();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);
    const openPodsCount = useOpenPodsCount();
    const { unreadCount } = useHiveNotifications(user, { limit: 1, poll: false });
    
    // Check scroll position to show/hide fade indicators
    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setShowLeftFade(scrollLeft > 5);
            setShowRightFade(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, []);

    return (
        <Box
            as="nav"
            position="fixed"
            bottom="0"
            left="0"
            right="0"
            bg="rgba(8, 24, 40, 0.88)"
            borderTop="1px solid"
            borderColor="rgba(102, 228, 255, 0.20)"
            display={{ base: 'block', sm: 'none' }}
            zIndex="999"
            backdropFilter="blur(18px)"
            boxShadow="0 -18px 48px rgba(0, 0, 0, 0.38)"
        >
            {/* Left fade indicator */}
            {showLeftFade && (
                <Box
                    position="absolute"
                    left="0"
                    top="0"
                    bottom="0"
                    width="30px"
                    bgGradient="linear(to-r, secondary, transparent)"
                    zIndex="1"
                    pointerEvents="none"
                    display="flex"
                    alignItems="center"
                    pl={1}
                >
                    <Icon as={FiChevronLeft} color="whiteAlpha.600" boxSize={4} />
                </Box>
            )}
            
            {/* Right fade indicator */}
            {showRightFade && (
                <Box
                    position="absolute"
                    right="0"
                    top="0"
                    bottom="0"
                    width="30px"
                    bgGradient="linear(to-l, secondary, transparent)"
                    zIndex="1"
                    pointerEvents="none"
                    display="flex"
                    alignItems="center"
                    justifyContent="flex-end"
                    pr={1}
                >
                    <Icon as={FiChevronRight} color="whiteAlpha.600" boxSize={4} />
                </Box>
            )}

            <Box
                ref={scrollRef}
                overflowX="auto"
                onScroll={checkScroll}
                p={2}
                css={{
                    '&::-webkit-scrollbar': { display: 'none' },
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
            <HStack spacing={1} minW="max-content" justify="center" px={2}>
                <Tooltip label="Home" aria-label="Home tooltip">
                    <Button
                        as={NextLink}
                        href="/"
                        variant="ghost"
                        color="white"
                        size="sm"
                        minW="40px"
                        borderRadius="full"
                        _hover={{ bg: 'whiteAlpha.200', color: 'accent' }}
                        leftIcon={<Icon as={FiHome} boxSize={4} />}
                    />
                </Tooltip>

                <Tooltip label="Blog" aria-label="Blog tooltip">
                    <Button
                        as={NextLink}
                        href="/blog"
                        variant="ghost"
                        color="white"
                        size="sm"
                        minW="40px"
                        borderRadius="full"
                        _hover={{ bg: 'whiteAlpha.200', color: 'accent' }}
                        leftIcon={<Icon as={FiBook} boxSize={4} />}
                    />
                </Tooltip>

                <Tooltip label="OpenPods" aria-label="OpenPods tooltip">
                    <Box position="relative">
                        <Button
                            as={NextLink}
                            href="/hangouts"
                            variant="ghost"
                            color="white"
                            size="sm"
                            minW="40px"
                            borderRadius="full"
                            _hover={{ bg: 'whiteAlpha.200', color: 'accent' }}
                            leftIcon={<Icon as={FiRadio} boxSize={4} />}
                        />
                        <CountBadge count={openPodsCount} top="-2px" right="-2px" />
                    </Box>
                </Tooltip>

                {user ? (
                    <>
                        <Tooltip label="Notifications" aria-label="Notifications tooltip">
                            <Box position="relative">
                                <Button
                                    as={NextLink}
                                    href={`/@${user}/notifications`}
                                    variant="ghost"
                                    color="white"
                                    size="sm"
                                    minW="40px"
                                    borderRadius="full"
                                    _hover={{ bg: 'whiteAlpha.200' }}
                                    leftIcon={<Icon as={FiBell} boxSize={4} color={unreadCount > 0 ? 'red.300' : 'white'} />}
                                />
                                <CountBadge count={unreadCount} colorScheme="red" top="-2px" right="-2px" />
                            </Box>
                        </Tooltip>

                        <Tooltip label="Wallet" aria-label="Wallet tooltip">
                            <Button
                                as={NextLink}
                                href={`/@${user}/wallet`}
                                variant="ghost"
                                color="white"
                                size="sm"
                                minW="40px"
                                borderRadius="full"
                                _hover={{ bg: 'whiteAlpha.200' }}
                                leftIcon={<Icon as={FiCreditCard} boxSize={4} />}
                            />
                        </Tooltip>

                        <Tooltip label="Chat" aria-label="Chat tooltip">
                            <Box position="relative">
                                <Button
                                    onClick={() => setIsChatOpen?.(!isChatOpen)}
                                    variant="ghost"
                                    color="white"
                                    size="sm"
                                    minW="40px"
                                    bg={isChatOpen ? 'blue.500' : 'transparent'}
                                    borderRadius="full"
                                    _hover={{ bg: isChatOpen ? 'blue.600' : 'whiteAlpha.200' }}
                                    leftIcon={<Icon as={FiMessageSquare} boxSize={4} />}
                                />
                                <CountBadge count={!isChatOpen ? chatUnreadCount : 0} colorScheme="red" top="-2px" right="-2px" />
                            </Box>
                        </Tooltip>

                        <Tooltip label="Profile" aria-label="Profile tooltip">
                            <Button
                                as={NextLink}
                                href={`/@${user}`}
                                variant="ghost"
                                color="white"
                                size="sm"
                                minW="40px"
                                borderRadius="full"
                                _hover={{ bg: 'whiteAlpha.200' }}
                                leftIcon={<Icon as={FiUser} boxSize={4} />}
                            />
                        </Tooltip>
                        
                        <Tooltip label="Logout" aria-label="Logout tooltip">
                            <Button
                                onClick={logout}
                                variant="ghost"
                                color="white"
                                size="sm"
                                minW="40px"
                                borderRadius="full"
                                _hover={{ bg: 'whiteAlpha.200' }}
                                leftIcon={<Icon as={FiLogOut} boxSize={4} />}
                            />
                        </Tooltip>
                    </>
                ) : (
                    <>
                        <Tooltip label="Login" aria-label="Login tooltip">
                            <Button
                                onClick={openLoginModal}
                                variant="ghost"
                                color="white"
                                size="sm"
                                minW="40px"
                                borderRadius="full"
                                _hover={{ bg: 'whiteAlpha.200' }}
                                leftIcon={<Icon as={FiLogIn} boxSize={4} />}
                            />
                        </Tooltip>
                        <Tooltip label="Create account" aria-label="Create account tooltip">
                            <Button
                                as={NextLink}
                                href="/join"
                                variant="ghost"
                                color="white"
                                size="sm"
                                minW="40px"
                                borderRadius="full"
                                _hover={{ bg: 'whiteAlpha.200' }}
                                leftIcon={<Icon as={FiUserPlus} boxSize={4} />}
                            />
                        </Tooltip>
                    </>
                )}
            </HStack>
            </Box>
        </Box>
    );
}
