'use client';
import { useState, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { getRelationshipBetweenAccounts, setUserRelationship } from '@/lib/hive/client-functions';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useUserRelationship(targetUsername: string) {
  const { username: user } = useCurrentUser();
  const toast = useToast();

  const [isFollowing, setIsFollowing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Call this to (re)load relationship state — lazy so callers control when it fires.
  const fetchRelationship = useCallback(async () => {
    if (!user || user === targetUsername) return;
    setIsLoading(true);
    try {
      const r = await getRelationshipBetweenAccounts(user, targetUsername);
      setIsFollowing(r.follows);
      setIsMuted(r.ignores);
      setIsBlacklisted(r.blacklists);
    } catch {
      // non-fatal — UI stays at defaults
    } finally {
      setIsLoading(false);
    }
  }, [user, targetUsername]);

  const handleFollow = useCallback(async () => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to be logged in to follow users', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    setIsProcessing(true);
    try {
      const success = await setUserRelationship(user, targetUsername, isFollowing ? '' : 'blog');
      if (success) {
        setIsFollowing(f => !f);
        toast({ title: isFollowing ? 'Unfollowed' : 'Following', description: `You ${isFollowing ? 'unfollowed' : 'are now following'} @${targetUsername}`, status: 'success', duration: 3000, isClosable: true });
      } else {
        throw new Error('Transaction failed');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update follow status', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setIsProcessing(false);
    }
  }, [user, targetUsername, isFollowing, toast]);

  const handleMute = useCallback(async () => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to be logged in to mute users', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    setIsProcessing(true);
    try {
      const success = await setUserRelationship(user, targetUsername, isMuted ? '' : 'ignore');
      if (success) {
        setIsMuted(m => !m);
        if (!isMuted && isFollowing) setIsFollowing(false);
        toast({ title: isMuted ? 'Unmuted' : 'Muted', description: `You ${isMuted ? 'unmuted' : 'muted'} @${targetUsername}`, status: 'success', duration: 3000, isClosable: true });
      } else {
        throw new Error('Transaction failed');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update mute status', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setIsProcessing(false);
    }
  }, [user, targetUsername, isMuted, isFollowing, toast]);

  const handleBlacklist = useCallback(async () => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to be logged in to blacklist users', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    setIsProcessing(true);
    try {
      const success = await setUserRelationship(user, targetUsername, isBlacklisted ? '' : 'blacklist');
      if (success) {
        setIsBlacklisted(b => !b);
        if (!isBlacklisted && isFollowing) setIsFollowing(false);
        toast({ title: isBlacklisted ? 'Removed from blacklist' : 'Blacklisted', description: `You ${isBlacklisted ? 'removed' : 'added'} @${targetUsername} ${isBlacklisted ? 'from' : 'to'} your blacklist`, status: 'success', duration: 3000, isClosable: true });
      } else {
        throw new Error('Transaction failed');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update blacklist status', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setIsProcessing(false);
    }
  }, [user, targetUsername, isBlacklisted, isFollowing, toast]);

  return {
    isFollowing,
    isMuted,
    isBlacklisted,
    isLoading,
    isProcessing,
    fetchRelationship,
    handleFollow,
    handleMute,
    handleBlacklist,
  };
}
