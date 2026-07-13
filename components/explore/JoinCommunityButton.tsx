'use client';
import { useEffect } from 'react';
import { Button } from '@chakra-ui/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCommunitySubscription } from '@/hooks/useCommunitySubscription';

interface JoinCommunityButtonProps {
  communityId: string;
  size?: string;
}

export default function JoinCommunityButton({ communityId, size = 'sm' }: JoinCommunityButtonProps) {
  const { username } = useCurrentUser();
  const { isSubscribed, isLoading, isProcessing, fetchSubscription, handleToggleSubscribe } =
    useCommunitySubscription(communityId);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  if (!username || isLoading) return null;

  return (
    <Button
      size={size}
      colorScheme={isSubscribed ? 'gray' : 'blue'}
      variant={isSubscribed ? 'outline' : 'solid'}
      onClick={handleToggleSubscribe}
      isDisabled={isProcessing}
      isLoading={isProcessing}
      borderRadius="full"
      flexShrink={0}
    >
      {isSubscribed ? 'Joined' : 'Join'}
    </Button>
  );
}
