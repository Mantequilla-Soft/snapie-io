'use client';
import React, { useState, useEffect } from 'react';
import { HStack, Button, useToast, Spinner } from '@chakra-ui/react';
import { getRelationshipBetweenAccounts, setUserRelationship } from '@/lib/hive/client-functions';
import { useAioha } from '@aioha/react-ui';

interface UserActionButtonsProps {
  targetUsername: string;
  currentUsername: string | null;
}

export default function UserActionButtons({ targetUsername, currentUsername }: UserActionButtonsProps) {
  const { user } = useAioha();
  const toast = useToast();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch current relationship status
  useEffect(() => {
    const fetchRelationship = async () => {
      if (!currentUsername || currentUsername === targetUsername) {
        setIsLoading(false);
        return;
      }

      try {
        const relationship = await getRelationshipBetweenAccounts(currentUsername, targetUsername);
        setIsFollowing(relationship.follows);
        setIsMuted(relationship.ignores);
        setIsBlacklisted(relationship.blacklists);
      } catch (error) {
        console.error('Error fetching relationship:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRelationship();
  }, [currentUsername, targetUsername]);

  const handleFollow = async () => {
    if (!user) {
      toast({
        title: 'Please login',
        description: 'You need to be logged in to follow users',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsProcessing(true);
    try {
      const success = await setUserRelationship(
        user,
        targetUsername,
        isFollowing ? '' : 'blog'
      );

      if (success) {
        setIsFollowing(!isFollowing);
        toast({
          title: isFollowing ? 'Unfollowed' : 'Following',
          description: `You ${isFollowing ? 'unfollowed' : 'are now following'} @${targetUsername}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update follow status',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMute = async () => {
    if (!user) {
      toast({
        title: 'Please login',
        description: 'You need to be logged in to mute users',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsProcessing(true);
    try {
      const success = await setUserRelationship(
        user,
        targetUsername,
        isMuted ? '' : 'ignore'
      );

      if (success) {
        setIsMuted(!isMuted);
        // If muting, also unfollow
        if (!isMuted && isFollowing) {
          setIsFollowing(false);
        }
        toast({
          title: isMuted ? 'Unmuted' : 'Muted',
          description: `You ${isMuted ? 'unmuted' : 'muted'} @${targetUsername}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Error updating mute status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update mute status',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBlacklist = async () => {
    if (!user) {
      toast({
        title: 'Please login',
        description: 'You need to be logged in to blacklist users',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsProcessing(true);
    try {
      const success = await setUserRelationship(
        user,
        targetUsername,
        isBlacklisted ? '' : 'blacklist'
      );

      if (success) {
        setIsBlacklisted(!isBlacklisted);
        // If blacklisting, also unfollow
        if (!isBlacklisted && isFollowing) {
          setIsFollowing(false);
        }
        toast({
          title: isBlacklisted ? 'Removed from blacklist' : 'Blacklisted',
          description: `You ${isBlacklisted ? 'removed' : 'added'} @${targetUsername} ${isBlacklisted ? 'from' : 'to'} your blacklist`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Error updating blacklist status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update blacklist status',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't show buttons if viewing own profile or not logged in
  if (!currentUsername || currentUsername === targetUsername || isLoading) {
    return null;
  }

  return (
    <HStack spacing={2}>
      <Button
        size="sm"
        colorScheme={isFollowing ? 'gray' : 'blue'}
        onClick={handleFollow}
        isDisabled={isProcessing || isMuted || isBlacklisted}
        isLoading={isProcessing}
      >
        {isFollowing ? 'Unfollow' : 'Follow'}
      </Button>
      <Button
        size="sm"
        colorScheme={isMuted ? 'orange' : 'gray'}
        variant={isMuted ? 'solid' : 'outline'}
        onClick={handleMute}
        isDisabled={isProcessing}
        isLoading={isProcessing}
      >
        {isMuted ? 'Unmute' : 'Mute'}
      </Button>
      <Button
        size="sm"
        colorScheme={isBlacklisted ? 'red' : 'gray'}
        variant={isBlacklisted ? 'solid' : 'outline'}
        onClick={handleBlacklist}
        isDisabled={isProcessing}
        isLoading={isProcessing}
      >
        {isBlacklisted ? 'Unblacklist' : 'Blacklist'}
      </Button>
    </HStack>
  );
}
