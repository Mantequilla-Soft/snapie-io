'use client';
import { useState, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { getUserSubscribedCommunities, setCommunitySubscription } from '@/lib/hive/client-functions';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useCommunitySubscription(communityId: string) {
  const { username: user } = useCurrentUser();
  const toast = useToast();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Call this to (re)load subscription state — lazy so callers control when it fires.
  const fetchSubscription = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const subs = await getUserSubscribedCommunities(user);
      setIsSubscribed(subs.some(s => s.id === communityId));
    } catch {
      // non-fatal — UI stays at defaults
    } finally {
      setIsLoading(false);
    }
  }, [user, communityId]);

  const handleToggleSubscribe = useCallback(async () => {
    if (!user) {
      toast({ title: 'Please login', description: 'You need to be logged in to join communities', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    setIsProcessing(true);
    try {
      const success = await setCommunitySubscription(user, communityId, !isSubscribed);
      if (success) {
        setIsSubscribed(s => !s);
        toast({ title: isSubscribed ? 'Left community' : 'Joined community', description: `You ${isSubscribed ? 'left' : 'joined'} ${communityId}`, status: 'success', duration: 3000, isClosable: true });
      } else {
        throw new Error('Transaction failed');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update community subscription', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setIsProcessing(false);
    }
  }, [user, communityId, isSubscribed, toast]);

  return {
    isSubscribed,
    isLoading,
    isProcessing,
    fetchSubscription,
    handleToggleSubscribe,
  };
}
