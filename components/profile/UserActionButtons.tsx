'use client';
import React, { useEffect } from 'react';
import { HStack, Button } from '@chakra-ui/react';
import { useUserRelationship } from '@/hooks/useUserRelationship';

interface UserActionButtonsProps {
  targetUsername: string;
  currentUsername: string | null;
  showBlacklist?: boolean;
}

export default function UserActionButtons({ targetUsername, currentUsername, showBlacklist = true }: UserActionButtonsProps) {
  const {
    isFollowing, isMuted, isBlacklisted,
    isLoading, isProcessing,
    fetchRelationship, handleFollow, handleMute, handleBlacklist,
  } = useUserRelationship(targetUsername);

  useEffect(() => {
    fetchRelationship();
  }, [fetchRelationship]);

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
      {showBlacklist && (
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
      )}
    </HStack>
  );
}
