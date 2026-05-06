import { Notifications } from '@hiveio/dhive';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export type NotificationGroup =
  | {
      id: number | string;
      type: 'single';
      notifType: string;
      items: Notifications[];
      date: string;
      notification: Notifications;
      actors: string[];
      totalValue?: number;
    }
  | {
      id: number | string;
      type: 'group';
      notifType: string;
      items: Notifications[];
      date: string;
      actors: string[];
      totalValue?: number;
    };

function extractVoteValue(message?: string): number {
  if (!message) return 0;
  const match = message.match(/\(\$([0-9]+(?:\.[0-9]+)?)\)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractActor(message?: string): string | null {
  if (!message) return null;
  const match = message.match(/@([a-z0-9._-]+)/i);
  return match ? match[1] : null;
}

function makeSingle(notification: Notifications): NotificationGroup {
  const actor = extractActor(notification.msg);
  const group: NotificationGroup = {
    id: notification.id,
    type: 'single',
    notifType: notification.type,
    items: [notification],
    date: notification.date,
    notification,
    actors: actor ? [actor] : [],
  };

  if (notification.type === 'vote') {
    group.totalValue = extractVoteValue(notification.msg);
  }

  return group;
}

function makeGroup(items: Notifications[], notifType: string): NotificationGroup {
  const sorted = [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const seen = new Set<string>();
  const actors: string[] = [];

  for (const notification of sorted) {
    const actor = extractActor(notification.msg);
    if (actor && !seen.has(actor)) {
      seen.add(actor);
      actors.push(actor);
    }
  }

  const group: NotificationGroup = {
    id: sorted[0].id,
    type: 'group',
    notifType,
    items: sorted,
    date: sorted[0].date,
    actors,
  };

  if (notifType === 'vote') {
    group.totalValue = Math.round(
      sorted.reduce((sum, notification) => sum + extractVoteValue(notification.msg), 0) * 1000,
    ) / 1000;
  }

  return group;
}

export function groupNotifications(notifications: Notifications[]): NotificationGroup[] {
  if (!notifications.length) return [];

  const result: NotificationGroup[] = [];
  const votesByUrl = new Map<string, Notifications[]>();
  const followBucket: Notifications[] = [];
  const others: Notifications[] = [];

  for (const notification of notifications) {
    if (notification.type === 'vote') {
      const key = notification.url || '__no_url__';
      votesByUrl.set(key, [...(votesByUrl.get(key) || []), notification]);
    } else if (notification.type === 'follow') {
      followBucket.push(notification);
    } else {
      others.push(notification);
    }
  }

  for (const votes of votesByUrl.values()) {
    const sorted = [...votes].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    let windowStart = new Date(sorted[0].date).getTime();
    let currentWindow = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const timestamp = new Date(sorted[i].date).getTime();
      if (timestamp - windowStart <= TWENTY_FOUR_HOURS) {
        currentWindow.push(sorted[i]);
      } else {
        result.push(currentWindow.length === 1 ? makeSingle(currentWindow[0]) : makeGroup(currentWindow, 'vote'));
        currentWindow = [sorted[i]];
        windowStart = timestamp;
      }
    }

    result.push(currentWindow.length === 1 ? makeSingle(currentWindow[0]) : makeGroup(currentWindow, 'vote'));
  }

  if (followBucket.length === 1) {
    result.push(makeSingle(followBucket[0]));
  } else if (followBucket.length > 1) {
    result.push(makeGroup(followBucket, 'follow'));
  }

  for (const notification of others) {
    result.push(makeSingle(notification));
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
