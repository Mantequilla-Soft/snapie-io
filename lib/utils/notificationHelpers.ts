import { Notifications } from '@hiveio/dhive';

export const NOTIFICATION_CATEGORIES = {
  all: { label: 'All', types: null },
  replies: { label: 'Replies', types: ['reply', 'reply_comment'] },
  mentions: { label: 'Mentions', types: ['mention'] },
  votes: { label: 'Votes', types: ['vote'] },
  reblogs: { label: 'Reblogs', types: ['reblog'] },
  follows: { label: 'Follows', types: ['follow'] },
  transfers: { label: 'Transfers', types: ['transfer'] },
} as const;

export type NotificationFilter = keyof typeof NOTIFICATION_CATEGORIES | 'unread';

const TYPE_LABELS: Record<string, string> = {
  reply: 'replied',
  reply_comment: 'replied',
  mention: 'mentioned you',
  vote: 'upvoted',
  follow: 'followed you',
  reblog: 'reblogged',
  transfer: 'sent you',
  delegate_vests: 'delegated HP to you',
  receive_vesting: 'sent you HP',
  powerdown: 'started a power down',
  subscribe: 'subscribed',
  pin_post: 'pinned your post',
  unpin_post: 'unpinned your post',
};

function stripKnownFrontendUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const knownHosts = ['peakd.com', 'hive.blog', 'ecency.com', '3speak.tv', 'www.3speak.tv'];
    if (!knownHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return rawUrl;
    }

    const path = url.pathname.replace(/^\/+/, '');
    if (url.hostname.includes('3speak.tv') && url.searchParams.get('v')) {
      return url.searchParams.get('v') || rawUrl;
    }

    return path || rawUrl;
  } catch {
    return rawUrl;
  }
}

export function getNotificationPostKey(notification: Notifications): string | null {
  if (!notification?.url) return null;
  const raw = stripKnownFrontendUrl(notification.url);
  if (raw.startsWith('trx:')) return null;
  if (raw.startsWith('@') && !raw.includes('/')) return null;

  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
  const parts = normalized.split('/').filter(Boolean);
  const postParts = parts.length >= 3 && parts[1]?.startsWith('@') ? parts.slice(1) : parts;
  const author = postParts[0]?.replace(/^@/, '');
  const permlink = postParts[1];

  return author && permlink ? `${author}/${permlink}` : null;
}

export function getNotificationRoute(notification: Notifications): string | null {
  if (!notification?.url) return null;

  const raw = stripKnownFrontendUrl(notification.url);
  if (raw.startsWith('trx:')) return null;

  const normalized = raw.replace(/^\/+/, '');
  if (normalized.startsWith('@') && !normalized.includes('/')) {
    return `/${normalized}`;
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[1]?.startsWith('@')) {
    return `/${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  const author = parts[0]?.replace(/^@/, '');
  const permlink = parts[1];
  if (author && permlink) return `/@${author}/${permlink}`;
  if (author) return `/@${author}`;

  return null;
}

export function getNotificationActor(notification: Notifications): string | null {
  if (!notification?.msg) return null;
  const match = notification.msg.match(/^@([a-z0-9.-]+)/i);
  return match ? match[1] : null;
}

export function getNotificationTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type || 'activity';
}

export function formatNotificationTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString + (dateString.endsWith('Z') ? '' : 'Z'));
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;

  return `${Math.floor(diffMonths / 12)}y`;
}

export function parseHiveDate(dateString?: string): Date {
  if (!dateString) return new Date(0);
  return new Date(dateString + (dateString.endsWith('Z') ? '' : 'Z'));
}
