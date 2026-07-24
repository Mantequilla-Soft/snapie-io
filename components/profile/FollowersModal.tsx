'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Box,
  Spinner,
  Button,
  Link,
} from '@chakra-ui/react';
import { getFollowers, getFollowing } from '@/lib/hive/client-functions';
import { Avatar } from '@/components/shared/Avatar';
import NextLink from 'next/link';

interface FollowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  type: 'followers' | 'following';
}

export default function FollowersModal({ isOpen, onClose, username, type }: FollowersModalProps) {
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadUsers = useCallback(async (startFrom: string = '', append: boolean = false) => {
    try {
      if (!append) {
        setLoading(true);
        setUsers([]);
      } else {
        setLoadingMore(true);
      }

      let newUsers: string[];
      if (type === 'followers') {
        newUsers = await getFollowers(username, startFrom, 50);
      } else {
        newUsers = await getFollowing(username, startFrom, 50);
      }

      if (append) {
        setUsers(prev => [...prev, ...newUsers]);
      } else {
        setUsers(newUsers);
      }

      // If we got less than 50, we've reached the end
      setHasMore(newUsers.length === 50);
    } catch (error) {
      console.error(`Error loading ${type}:`, error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [username, type]);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen, loadUsers]);

  const loadMore = () => {
    if (hasMore && !loadingMore && users.length > 0) {
      const lastUser = users[users.length - 1];
      loadUsers(lastUser, true);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="muted" borderColor="border" borderWidth="2px">
        <ModalHeader color="primary" borderBottomWidth="1px" borderBottomColor="border">
          {type === 'followers' ? 'Followers' : 'Following'}
        </ModalHeader>
        <ModalCloseButton color="primary" _hover={{ bg: 'background' }} />
        <ModalBody pb={6}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <Spinner size="lg" color="primary" />
            </Box>
          ) : users.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="accent">
                No {type} found
              </Text>
            </Box>
          ) : (
            <VStack spacing={3} align="stretch">
              {users.map((user) => (
                <Link
                  key={user}
                  as={NextLink}
                  href={`/@${user}`}
                  _hover={{ textDecoration: 'none' }}
                  onClick={onClose}
                >
                  <HStack
                    p={3}
                    borderRadius="md"
                    bg="background"
                    borderWidth="1px"
                    borderColor="border"
                    _hover={{ 
                      bg: 'muted',
                      borderColor: 'primary',
                      transform: 'translateY(-1px)',
                      shadow: 'md'
                    }}
                    transition="all 0.2s"
                    cursor="pointer"
                  >
                    <Avatar size="sm" username={user} />
                    <Text fontWeight="medium" color="text">@{user}</Text>
                  </HStack>
                </Link>
              ))}
              
              {hasMore && (
                <Button
                  onClick={loadMore}
                  isLoading={loadingMore}
                  variant="ghost"
                  w="full"
                  mt={2}
                  color="primary"
                  _hover={{ bg: 'background', color: 'accent' }}
                >
                  Load More
                </Button>
              )}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
