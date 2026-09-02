'use client';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserRelationship } from '@/hooks/useUserRelationship';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

/**
 * Gates content by whether the viewer has muted `author` — checked against
 * the same combined (personal + community-role) list that already filters
 * feeds, comments, and notifications, so direct blog/post links can't be
 * used to route around a mute.
 */
export function useAuthorMuteGate(author: string) {
  const { username: viewer } = useCurrentUser();
  const [isMuted, setIsMuted] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const relationship = useUserRelationship(author);

  const recheck = useCallback(async () => {
    // Community-role mutes apply to every visitor, logged in or not — only
    // skip the check for a user looking at their own profile/post.
    if (!author || viewer === author) {
      setIsMuted(false);
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    try {
      setIsMuted(await mutedAccountsManager.isMuted(author, viewer || undefined));
    } finally {
      setIsChecking(false);
    }
  }, [viewer, author]);

  useEffect(() => {
    recheck();
  }, [recheck]);

  // Only need the personal relationship (to know whether an "Unmute" action
  // is available) once we know the viewer has this author muted.
  useEffect(() => {
    if (isMuted) relationship.fetchRelationship();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted]);

  const unmute = useCallback(async () => {
    // Community-role mutes aren't the viewer's to lift — only offer this
    // when the block comes from the viewer's own personal mute.
    if (!relationship.isMuted) return false;
    const success = await relationship.handleMute();
    if (success) await recheck();
    return success;
  }, [relationship, recheck]);

  return {
    isChecking,
    isMuted,
    canUnmute: relationship.isMuted,
    isRelationshipLoading: relationship.isLoading,
    isProcessing: relationship.isProcessing,
    unmute,
  };
}
