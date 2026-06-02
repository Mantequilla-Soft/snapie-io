'use client';
import { Flex, IconButton, Menu, MenuButton, MenuList, MenuItem, Button, Input, InputGroup, InputRightElement, CloseButton } from '@chakra-ui/react';
import { FaTh, FaBars, FaPen, FaSort } from 'react-icons/fa'; 
import { useRouter } from 'next/navigation';

interface TopBarProps {
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    setQuery: (query: string) => void;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    onSearchSubmit: () => void;
    onSearchClear: () => void;
}

export default function TopBar({
    viewMode,
    setViewMode,
    setQuery,
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onSearchClear,
}: TopBarProps) {
    const router = useRouter(); 

    return (
        <Flex justifyContent="space-between" mb={4} gap={4} align="center" flexWrap="wrap">
            <Flex gap={3} align="center" flex="1" minW={{ base: '100%', md: '360px' }}>
                <IconButton
                    aria-label="Compose"
                    icon={<FaPen />}
                    onClick={() => router.push('/compose')}
                    variant="outline"
                />
                <InputGroup maxW={{ base: 'full', md: '480px' }}>
                    <Input
                        placeholder="Search posts, titles, authors..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') onSearchSubmit();
                        }}
                        bg="muted"
                    />
                    {searchTerm && (
                        <InputRightElement>
                            <CloseButton
                                size="sm"
                                onClick={onSearchClear}
                                aria-label="Clear search"
                            />
                        </InputRightElement>
                    )}
                </InputGroup>
                <Button onClick={onSearchSubmit} size="sm" colorScheme="blue">
                    Go
                </Button>
            </Flex>
            <Flex justifyContent="flex-end">
                <IconButton
                    aria-label="Grid View"
                    icon={<FaTh />} 
                    onClick={() => setViewMode('grid')}
                    isActive={viewMode === 'grid'}
                    variant={viewMode === 'grid' ? 'solid' : 'outline'}  
                />
                <IconButton
                    aria-label="List View"
                    icon={<FaBars />}  
                    onClick={() => setViewMode('list')}
                    isActive={viewMode === 'list'}
                    variant={viewMode === 'list' ? 'solid' : 'outline'}
                    ml={4}
                />
                <Menu>
                    <MenuButton
                        as={Button}
                        aria-label="Sort Options"
                        leftIcon={<FaSort />} 
                        variant="outline"
                        ml={4}
                    >
                        Sort
                    </MenuButton>
                    <MenuList zIndex="popover">
                        <MenuItem onClick={() => setQuery('created')}>Recent</MenuItem>
                        <MenuItem onClick={() => setQuery('trending')}>Trending</MenuItem>
                        <MenuItem onClick={() => setQuery('hot')}>Hot</MenuItem>
                    </MenuList>
                </Menu>
            </Flex>
        </Flex>
    );
}
