'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Notifications } from '@hiveio/dhive';
import HiveClient from '@/lib/hive/hiveclient';
import { customJsonWithAioha, KeyTypes } from '@/lib/hive/aioha';
import { parseHiveDate } from '@/lib/utils/notificationHelpers';

const POLL_INTERVAL_MS = 60_000;

interface UnreadNotificationState {
  lastread?: string;
  unread?: number;
}

interface UseHiveNotificationsOptions {
  limit?: number;
  poll?: boolean;
}

async function fetchNotifications(account: string, limit: number, lastId?: number | string | null): Promise<Notifications[]> {
  const params: Record<string, string | number> = { account, limit };
  if (lastId !== undefined && lastId !== null) params.last_id = lastId;

  const result = await HiveClient.call('bridge', 'account_notifications', params);
  return Array.isArray(result) ? result : [];
}

async function fetchUnreadState(account: string): Promise<UnreadNotificationState> {
  const result = await HiveClient.call('bridge', 'unread_notifications', { account });
  return result || { lastread: '1970-01-01T00:00:00', unread: 0 };
}

export function useHiveNotifications(
  account: string | null | undefined,
  { limit = 50, poll = true }: UseHiveNotificationsOptions = {},
) {
  const [notifications, setNotifications] = useState<Notifications[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [lastRead, setLastRead] = useState('1970-01-01T00:00:00');
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAsRead, setMarkingAsRead] = useState(false);

  const accountRef = useRef(account);
  accountRef.current = account;

  const lastReadRef = useRef(lastRead);
  lastReadRef.current = lastRead;

  const fetchUnread = useCallback(async () => {
    if (!account) return;

    try {
      const state = await fetchUnreadState(account);
      if (accountRef.current === account) {
        const newLastRead = parseHiveDate(state.lastread || '1970-01-01T00:00:00');
        // Never regress lastRead — guards against stale responses arriving after markAllAsRead
        if (newLastRead >= parseHiveDate(lastReadRef.current)) {
          setLastRead(state.lastread || '1970-01-01T00:00:00');
          setUnreadCount(state.unread || 0);
        }
      }
    } catch {
      // Notification unread state is nice-to-have; the list can still render.
    }
  }, [account]);

  const refetch = useCallback(async () => {
    if (!account) {
      setNotifications([]);
      setHasMore(true);
      setUnreadCount(0);
      setLastRead('1970-01-01T00:00:00');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchNotifications(account, limit);
      if (accountRef.current === account) {
        setNotifications(data);
        setHasMore(data.length >= limit);
      }
    } catch (err) {
      console.error('[notifications] fetch failed:', err);
      if (accountRef.current === account) setError(err);
    } finally {
      if (accountRef.current === account) setLoading(false);
    }

    await fetchUnread();
  }, [account, fetchUnread, limit]);

  const loadMore = useCallback(async () => {
    if (!account || loadingMore || !hasMore) return;

    const oldestId = notifications[notifications.length - 1]?.id;
    if (!oldestId) return;

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchNotifications(account, limit, oldestId);
      if (accountRef.current === account) {
        setNotifications((prev) => {
          const seen = new Set(prev.map((notification) => notification.id));
          return [...prev, ...data.filter((notification) => !seen.has(notification.id))];
        });
        setHasMore(data.length >= limit);
      }
    } catch (err) {
      console.error('[notifications] load more failed:', err);
      if (accountRef.current === account) setError(err);
    } finally {
      if (accountRef.current === account) setLoadingMore(false);
    }
  }, [account, hasMore, limit, loadingMore, notifications]);

  const markAllAsRead = useCallback(async () => {
    if (!account || markingAsRead || unreadCount === 0) return;

    setMarkingAsRead(true);
    try {
      const readThroughDate = new Date().toISOString().replace('Z', '');

      await customJsonWithAioha(
        KeyTypes.Posting,
        'notify',
        JSON.stringify(['setLastRead', { date: readThroughDate }]),
        'Mark notifications as read',
        'Mark notifications as read',
      );

      setLastRead(readThroughDate);
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('hive:notifications-read'));
    } catch (err) {
      console.error('[notifications] mark all as read failed:', err);
      throw err;
    } finally {
      setMarkingAsRead(false);
    }
  }, [account, markingAsRead, unreadCount]);

  const markAsRead = useCallback(async (notificationDate: string) => {
    if (!account || markingAsRead || parseHiveDate(notificationDate) <= parseHiveDate(lastRead)) return;

    setMarkingAsRead(true);
    try {
      await customJsonWithAioha(
        KeyTypes.Posting,
        'notify',
        JSON.stringify(['setLastRead', { date: notificationDate }]),
        'Mark notification as read',
        'Mark notification as read',
      );

      setLastRead(notificationDate);
      const newLastRead = parseHiveDate(notificationDate);
      setUnreadCount(notifications.filter((notification) => parseHiveDate(notification.date) > newLastRead).length);
    } catch (err) {
      console.error('[notifications] mark as read failed:', err);
      throw err;
    } finally {
      setMarkingAsRead(false);
    }
  }, [account, lastRead, markingAsRead, notifications]);

  const isUnread = useCallback(
    (notification: Notifications) => parseHiveDate(notification.date) > parseHiveDate(lastRead),
    [lastRead],
  );

  useEffect(() => {
    setNotifications([]);
    setHasMore(true);
    setLastRead('1970-01-01T00:00:00');
    setUnreadCount(0);
    if (account) refetch();
  }, [account, refetch]);

  useEffect(() => {
    if (!account || !poll) return;

    const intervalId = window.setInterval(refetch, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetch();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [account, poll, refetch]);

  useEffect(() => {
    const onRead = () => setUnreadCount(0);
    window.addEventListener('hive:notifications-read', onRead);
    return () => window.removeEventListener('hive:notifications-read', onRead);
  }, []);

  return {
    notifications,
    loading,
    loadingMore,
    hasMore,
    error,
    refetch,
    loadMore,
    unreadCount,
    lastRead,
    markAllAsRead,
    markAsRead,
    markingAsRead,
    isUnread,
  };
}
