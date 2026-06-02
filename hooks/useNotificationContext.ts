'use client';

import { useEffect, useMemo, useState } from 'react';
import { Discussion, Notifications } from '@hiveio/dhive';
import HiveClient from '@/lib/hive/hiveclient';
import { getNotificationPostKey, truncatePreviewWords } from '@/lib/utils/notificationHelpers';

interface NotificationContextPreview {
  label: string;
  previewText: string;
  parentRoute: string;
}

type NotificationContextMap = Record<string, NotificationContextPreview | undefined>;

const REPLY_TYPES = new Set(['reply', 'reply_comment']);
const CONCURRENCY_LIMIT = 5;

const contentCache = new Map<string, Promise<Discussion | null>>();
const previewCache = new Map<string, NotificationContextPreview | null>();

function makeContentKey(author: string, permlink: string): string {
  return `${author.toLowerCase()}/${permlink}`;
}

async function fetchContent(author: string, permlink: string): Promise<Discussion | null> {
  const key = makeContentKey(author, permlink);
  const cached = contentCache.get(key);
  if (cached) return cached;

  const request = HiveClient.database
    .call('get_content', [author, permlink])
    .then((result) => {
      if (!result || !(result as Discussion).author || !(result as Discussion).permlink) return null;
      return result as Discussion;
    })
    .catch(() => null);

  contentCache.set(key, request);
  return request;
}

function toRoute(author: string, permlink: string): string {
  return `/@${author}/${permlink}`;
}

async function resolveParentPreview(replyAuthor: string, replyPermlink: string): Promise<NotificationContextPreview | null> {
  const cacheKey = makeContentKey(replyAuthor, replyPermlink);
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey) ?? null;

  const reply = await fetchContent(replyAuthor, replyPermlink);
  if (!reply?.parent_author || !reply?.parent_permlink) {
    previewCache.set(cacheKey, null);
    return null;
  }

  const parent = await fetchContent(reply.parent_author, reply.parent_permlink);
  if (!parent) {
    previewCache.set(cacheKey, null);
    return null;
  }

  const parentTitle = (parent.title || '').trim();
  const isParentPost = Number(parent.depth || 0) === 0;
  const previewText = isParentPost && parentTitle
    ? parentTitle
    : truncatePreviewWords(parent.body || '', 12, 16);

  if (!previewText) {
    previewCache.set(cacheKey, null);
    return null;
  }

  const preview: NotificationContextPreview = {
    label: isParentPost ? 'Replied to your post' : 'Replied to your comment',
    previewText,
    parentRoute: toRoute(parent.author, parent.permlink),
  };

  previewCache.set(cacheKey, preview);
  return preview;
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (tasks.length === 0) return [];

  const results: T[] = new Array(tasks.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      results[current] = await tasks[current]();
    }
  });

  await Promise.all(workers);
  return results;
}

export function useNotificationContext(notifications: Notifications[]): NotificationContextMap {
  const [contextMap, setContextMap] = useState<NotificationContextMap>({});

  const replyItems = useMemo(() => notifications.filter((n) => REPLY_TYPES.has(n.type)), [notifications]);

  useEffect(() => {
    let cancelled = false;

    async function resolveAll() {
      if (replyItems.length === 0) {
        if (!cancelled) setContextMap({});
        return;
      }

      const tasks = replyItems.map((notification) => async () => {
        const key = getNotificationPostKey(notification);
        if (!key) return { id: notification.id, preview: undefined };

        const [author, permlink] = key.split('/');
        if (!author || !permlink) return { id: notification.id, preview: undefined };

        const preview = await resolveParentPreview(author, permlink);
        return { id: notification.id, preview: preview ?? undefined };
      });

      const resolved = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
      if (cancelled) return;

      setContextMap((prev) => {
        const next: NotificationContextMap = { ...prev };
        for (const item of resolved) {
          next[item.id] = item.preview;
        }
        return next;
      });
    }

    resolveAll();

    return () => {
      cancelled = true;
    };
  }, [replyItems]);

  return contextMap;
}
