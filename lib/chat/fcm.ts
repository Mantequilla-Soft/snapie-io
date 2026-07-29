export interface FCMData {
  messageId: string;
  channelId: string;
  sender: string;
  content: string;
}

let firebaseApp: unknown = null;

function getFirebaseAdmin(): unknown {
  if (firebaseApp) return firebaseApp;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!encoded) return null;

  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    if (getApps().length > 0) {
      firebaseApp = getApps()[0];
      return firebaseApp;
    }
    const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    firebaseApp = initializeApp({ credential: cert(serviceAccount) });
    return firebaseApp;
  } catch {
    return null;
  }
}

export async function sendChannelMessage(channelId: string, data: FCMData): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    const title = `#${data.channelId}`;
    const body = `${data.sender}: ${data.content.slice(0, 200)}`;
    const id = await getMessaging(app).send({
      topic: `channel-${channelId}`,
      notification: {
        title,
        body,
      },
      data: {
        messageId: data.messageId,
        channelId: data.channelId,
        sender: data.sender,
        content: data.content.slice(0, 200),
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `chat-${data.channelId}`,
          renotify: true,
        },
        fcmOptions: {
          link: '/',
        },
      },
    });
    void id;
  } catch {
    // FCM delivery failure is non-fatal
  }
}

export async function sendDirectMessage(token: string, data: FCMData): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    const title = `@${data.sender}`;
    const body = data.content.slice(0, 200);
    await getMessaging(app).send({
      token,
      notification: { title, body },
      data: {
        messageId: data.messageId,
        channelId: data.channelId,
        sender: data.sender,
        content: data.content.slice(0, 200),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `chat-${data.channelId}`,
          renotify: true,
        },
        fcmOptions: { link: '/' },
      },
    });
  } catch {}
}

export async function sendDirectMessageToTokens(tokens: string[], data: FCMData): Promise<void> {
  if (!tokens.length) return;
  await Promise.all(tokens.map(token => sendDirectMessage(token, data)));
}

/** A channel message pushed to specific devices instead of the channel topic.
 *  A topic reaches every subscriber, which is right for a private group but not
 *  for a public channel — there, only the people a message actually mentions or
 *  replies to should be interrupted, matching what the unread badge counts. */
export async function sendChannelMessageToToken(token: string, data: FCMData): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    const title = `#${data.channelId}`;
    const body = `${data.sender}: ${data.content.slice(0, 200)}`;
    await getMessaging(app).send({
      token,
      notification: { title, body },
      data: {
        messageId: data.messageId,
        channelId: data.channelId,
        sender: data.sender,
        content: data.content.slice(0, 200),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `chat-${data.channelId}`,
          renotify: true,
        },
        fcmOptions: { link: '/' },
      },
    });
  } catch {
    // FCM delivery failure is non-fatal
  }
}

export async function sendChannelMessageToTokens(tokens: string[], data: FCMData): Promise<void> {
  if (!tokens.length) return;
  await Promise.all(tokens.map(token => sendChannelMessageToToken(token, data)));
}

export interface GenericNotification {
  title: string;
  body: string;
  tag: string;
  /** Path to open on click, e.g. '/settings/points'. */
  link?: string;
}

/** Non-chat push, same FCM plumbing as the chat sends above (reused rather
 *  than duplicated) — for platform-side notices like an admin points grant.
 *  Best-effort: a user with no registered fcmTokens (push never enabled)
 *  just doesn't get one, same graceful-degradation as chat DMs. */
export async function sendGenericNotification(token: string, data: GenericNotification): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    await getMessaging(app).send({
      token,
      notification: { title: data.title, body: data.body },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title: data.title,
          body: data.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: data.tag,
          renotify: true,
        },
        fcmOptions: { link: data.link || '/' },
      },
    });
  } catch {}
}

export async function sendGenericNotificationToTokens(tokens: string[], data: GenericNotification): Promise<void> {
  if (!tokens.length) return;
  await Promise.all(tokens.map(token => sendGenericNotification(token, data)));
}

export async function subscribeToChannels(fcmToken: string, channelIds: string[]): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    const messaging = getMessaging(app);
    const responses = await Promise.all(
      channelIds.map(id => messaging.subscribeToTopic([fcmToken], `channel-${id}`))
    );
    void responses;
  } catch {}
}

export async function unsubscribeFromChannel(fcmToken: string, channelId: string): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    const res = await getMessaging(app).unsubscribeFromTopic([fcmToken], `channel-${channelId}`);
    void res;
  } catch {}
}
