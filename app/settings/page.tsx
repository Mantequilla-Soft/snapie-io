'use client';
import {
    Box, Flex, Heading, Text, VStack, Icon, Divider,
} from '@chakra-ui/react';
import { FiZap, FiDollarSign, FiMoon, FiSun } from 'react-icons/fi';
import { useUserSettings, type PayoutType, type ColorMode } from '@/hooks/useUserSettings';

interface PayoutOption {
    value: PayoutType;
    icon: React.ElementType;
    label: string;
    sublabel: string;
    description: string;
}

const PAYOUT_OPTIONS: PayoutOption[] = [
    {
        value: 'half_hbd',
        icon: FiDollarSign,
        label: '50 / 50',
        sublabel: 'Default',
        description: 'Half paid as HBD (liquid), half as Hive Power.',
    },
    {
        value: 'power_up_100',
        icon: FiZap,
        label: 'Power Up 100%',
        sublabel: 'All HP',
        description: 'Full payout converted to Hive Power. Grows your influence on the network.',
    },
];

interface AppearanceOption {
    value: ColorMode;
    icon: React.ElementType;
    label: string;
    sublabel: string;
    description: string;
}

const APPEARANCE_OPTIONS: AppearanceOption[] = [
    {
        value: 'dark',
        icon: FiMoon,
        label: 'Dark',
        sublabel: 'Default',
        description: 'The classic Snapie look.',
    },
    {
        value: 'light',
        icon: FiSun,
        label: 'Light',
        sublabel: 'New',
        description: 'A brighter, high-contrast theme.',
    },
];

export default function SettingsPage() {
    const { settings, update } = useUserSettings();

    return (
        <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
            <Heading size="lg" fontWeight="bold" color="text" mb={1}>
                Settings
            </Heading>
            <Text color="overlay.500" fontSize="sm" mb={8}>
                Your preferences are saved locally on this device.
            </Text>

            {/* Appearance section */}
            <Box
                bg="surface"
                borderRadius="16px"
                border="1px solid"
                borderColor="surfaceBorder"
                backdropFilter="blur(18px)"
                overflow="hidden"
                mb={6}
            >
                <Box px={6} py={4}>
                    <Text fontSize="xs" fontWeight="semibold" color="overlay.500" textTransform="uppercase" letterSpacing="0.08em">
                        Appearance
                    </Text>
                </Box>

                <Divider borderColor="surfaceBorder" />

                <Box px={6} py={5}>
                    <Text color="text" fontWeight="medium" fontSize="sm" mb={1}>
                        Theme
                    </Text>
                    <Text color="overlay.500" fontSize="xs" mb={5}>
                        Applies across the app on this device.
                    </Text>

                    <VStack spacing={3} align="stretch">
                        {APPEARANCE_OPTIONS.map(opt => {
                            const selected = settings.colorMode === opt.value;
                            return (
                                <Flex
                                    key={opt.value}
                                    as="button"
                                    onClick={() => update({ colorMode: opt.value })}
                                    align="center"
                                    gap={4}
                                    px={4}
                                    py={4}
                                    borderRadius="12px"
                                    border="1px solid"
                                    borderColor={selected ? 'rgba(28, 161, 241, 0.55)' : 'surfaceBorder'}
                                    bg={selected ? 'rgba(28, 161, 241, 0.08)' : 'surface'}
                                    cursor="pointer"
                                    transition="all 0.15s"
                                    _hover={{
                                        borderColor: 'rgba(28, 161, 241, 0.35)',
                                        bg: 'rgba(28, 161, 241, 0.06)',
                                    }}
                                    textAlign="left"
                                    w="full"
                                >
                                    {/* Radio dot */}
                                    <Box
                                        flexShrink={0}
                                        w="18px"
                                        h="18px"
                                        borderRadius="full"
                                        border="2px solid"
                                        borderColor={selected ? 'primary' : 'overlay.300'}
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                    >
                                        {selected && (
                                            <Box w="8px" h="8px" borderRadius="full" bg="primary" />
                                        )}
                                    </Box>

                                    {/* Icon */}
                                    <Flex
                                        flexShrink={0}
                                        w="36px"
                                        h="36px"
                                        borderRadius="10px"
                                        bg={selected ? 'rgba(28, 161, 241, 0.15)' : 'overlay.50'}
                                        align="center"
                                        justify="center"
                                    >
                                        <Icon as={opt.icon} boxSize={4} color={selected ? 'primary' : 'overlay.500'} />
                                    </Flex>

                                    {/* Text */}
                                    <Box flex={1} overflow="hidden">
                                        <Flex align="center" gap={2} mb="2px">
                                            <Text color="text" fontWeight="semibold" fontSize="sm">
                                                {opt.label}
                                            </Text>
                                            <Text
                                                fontSize="10px"
                                                fontWeight="medium"
                                                color={selected ? 'primary' : 'overlay.400'}
                                                bg={selected ? 'rgba(28, 161, 241, 0.12)' : 'overlay.50'}
                                                px={2}
                                                py="1px"
                                                borderRadius="full"
                                            >
                                                {opt.sublabel}
                                            </Text>
                                        </Flex>
                                        <Text color="overlay.500" fontSize="xs" noOfLines={2}>
                                            {opt.description}
                                        </Text>
                                    </Box>
                                </Flex>
                            );
                        })}
                    </VStack>
                </Box>
            </Box>

            {/* Posting section */}
            <Box
                bg="surface"
                borderRadius="16px"
                border="1px solid"
                borderColor="surfaceBorder"
                backdropFilter="blur(18px)"
                overflow="hidden"
            >
                <Box px={6} py={4}>
                    <Text fontSize="xs" fontWeight="semibold" color="overlay.500" textTransform="uppercase" letterSpacing="0.08em">
                        Posting
                    </Text>
                </Box>

                <Divider borderColor="surfaceBorder" />

                <Box px={6} py={5}>
                    <Text color="text" fontWeight="medium" fontSize="sm" mb={1}>
                        Payout preference
                    </Text>
                    <Text color="overlay.500" fontSize="xs" mb={5}>
                        Applies to all new snaps and blog posts.
                    </Text>

                    <VStack spacing={3} align="stretch">
                        {PAYOUT_OPTIONS.map(opt => {
                            const selected = settings.payoutType === opt.value;
                            return (
                                <Flex
                                    key={opt.value}
                                    as="button"
                                    onClick={() => update({ payoutType: opt.value })}
                                    align="center"
                                    gap={4}
                                    px={4}
                                    py={4}
                                    borderRadius="12px"
                                    border="1px solid"
                                    borderColor={selected ? 'rgba(28, 161, 241, 0.55)' : 'surfaceBorder'}
                                    bg={selected ? 'rgba(28, 161, 241, 0.08)' : 'surface'}
                                    cursor="pointer"
                                    transition="all 0.15s"
                                    _hover={{
                                        borderColor: 'rgba(28, 161, 241, 0.35)',
                                        bg: 'rgba(28, 161, 241, 0.06)',
                                    }}
                                    textAlign="left"
                                    w="full"
                                >
                                    {/* Radio dot */}
                                    <Box
                                        flexShrink={0}
                                        w="18px"
                                        h="18px"
                                        borderRadius="full"
                                        border="2px solid"
                                        borderColor={selected ? 'primary' : 'overlay.300'}
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                    >
                                        {selected && (
                                            <Box w="8px" h="8px" borderRadius="full" bg="primary" />
                                        )}
                                    </Box>

                                    {/* Icon */}
                                    <Flex
                                        flexShrink={0}
                                        w="36px"
                                        h="36px"
                                        borderRadius="10px"
                                        bg={selected ? 'rgba(28, 161, 241, 0.15)' : 'overlay.50'}
                                        align="center"
                                        justify="center"
                                    >
                                        <Icon as={opt.icon} boxSize={4} color={selected ? 'primary' : 'overlay.500'} />
                                    </Flex>

                                    {/* Text */}
                                    <Box flex={1} overflow="hidden">
                                        <Flex align="center" gap={2} mb="2px">
                                            <Text color="text" fontWeight="semibold" fontSize="sm">
                                                {opt.label}
                                            </Text>
                                            <Text
                                                fontSize="10px"
                                                fontWeight="medium"
                                                color={selected ? 'primary' : 'overlay.400'}
                                                bg={selected ? 'rgba(28, 161, 241, 0.12)' : 'overlay.50'}
                                                px={2}
                                                py="1px"
                                                borderRadius="full"
                                            >
                                                {opt.sublabel}
                                            </Text>
                                        </Flex>
                                        <Text color="overlay.500" fontSize="xs" noOfLines={2}>
                                            {opt.description}
                                        </Text>
                                    </Box>
                                </Flex>
                            );
                        })}
                    </VStack>
                </Box>
            </Box>
        </Box>
    );
}
