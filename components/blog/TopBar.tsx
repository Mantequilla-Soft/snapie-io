'use client';
import { Flex, Button, IconButton, Box, Icon, Input, InputGroup, InputRightElement, CloseButton, Text } from '@chakra-ui/react';
import { FaTh, FaBars, FaPen } from 'react-icons/fa';
import { useRouter } from 'next/navigation';

interface SortOption {
    label: string;
    value: string;
    icon: string;
}

const SORT_OPTIONS: SortOption[] = [
    { label: 'New',      value: 'created',  icon: '✨' },
    { label: 'Hot',      value: 'hot',      icon: '🔥' },
    { label: 'Trending', value: 'trending', icon: '📈' },
    { label: 'Top',      value: 'payout',   icon: '💰' },
];

interface TopBarProps {
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    activeQuery: string;
    setQuery: (query: string) => void;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    onSearchSubmit: () => void;
    onSearchClear: () => void;
}

export default function TopBar({
    viewMode,
    setViewMode,
    activeQuery,
    setQuery,
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onSearchClear,
}: TopBarProps) {
    const router = useRouter();

    return (
        <Flex direction="column" gap={3} mb={4}>
            {/* Row 1 — search + view toggle */}
            <Flex gap={3} align="center" flexWrap="wrap">
                <Button
                    leftIcon={<Icon as={FaPen} boxSize={3} />}
                    onClick={() => router.push('/compose')}
                    bgGradient="linear(135deg, #18a8ff, #66e4ff)"
                    color="white"
                    borderRadius="10px"
                    size="sm"
                    fontWeight="semibold"
                    flexShrink={0}
                    boxShadow="0 2px 14px rgba(28, 161, 241, 0.32)"
                    _hover={{ opacity: 0.88, boxShadow: '0 4px 20px rgba(28, 161, 241, 0.5)' }}
                    _active={{ transform: 'scale(0.97)' }}
                >
                    Write<Box as="span" display={{ base: 'none', md: 'inline' }}>&nbsp;a blog</Box>
                </Button>
                <InputGroup flex="1" maxW={{ base: 'full', md: '480px' }}>
                    <Input
                        placeholder="Search posts, titles, authors..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onSearchSubmit(); }}
                        bg="muted"
                        borderColor="border"
                        borderRadius="10px"
                        color="text"
                        _placeholder={{ color: 'gray.500' }}
                        _focus={{ boxShadow: 'none', borderColor: 'primary' }}
                    />
                    {searchTerm && (
                        <InputRightElement>
                            <CloseButton size="sm" onClick={onSearchClear} aria-label="Clear search" />
                        </InputRightElement>
                    )}
                </InputGroup>
                <Button
                    onClick={onSearchSubmit}
                    size="sm"
                    variant="outline"
                    borderColor="primary"
                    color="primary"
                    borderRadius="10px"
                    _hover={{ bg: 'muted' }}
                >
                    Go
                </Button>
                <Flex gap={2} ml="auto">
                    <IconButton
                        aria-label="Grid View"
                        icon={<FaTh />}
                        onClick={() => setViewMode('grid')}
                        variant="ghost"
                        bg={viewMode === 'grid' ? 'muted' : 'transparent'}
                        color="text"
                        borderRadius="10px"
                        _hover={{ bg: 'muted' }}
                    />
                    <IconButton
                        aria-label="List View"
                        icon={<FaBars />}
                        onClick={() => setViewMode('list')}
                        variant="ghost"
                        bg={viewMode === 'list' ? 'muted' : 'transparent'}
                        color="text"
                        borderRadius="10px"
                        _hover={{ bg: 'muted' }}
                    />
                </Flex>
            </Flex>

            {/* Row 2 — sort pills */}
            <Flex gap={2} flexWrap="wrap">
                {SORT_OPTIONS.map((opt) => {
                    const isActive = activeQuery === opt.value;
                    return (
                        <Button
                            key={opt.value}
                            size="sm"
                            variant="ghost"
                            borderRadius="full"
                            bg={isActive ? 'muted' : 'transparent'}
                            color={isActive ? 'text' : 'gray.500'}
                            borderWidth="1px"
                            borderColor={isActive ? 'primary' : 'border'}
                            _hover={{ bg: 'muted', color: 'text' }}
                            onClick={() => setQuery(opt.value)}
                            leftIcon={<Text as="span" fontSize="sm">{opt.icon}</Text>}
                        >
                            {opt.label}
                        </Button>
                    );
                })}
            </Flex>
        </Flex>
    );
}
