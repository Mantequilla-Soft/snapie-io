export interface FCMData {
  messageId: string;
  channelId: string;
  sender: string;
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseApp: any = null;

function getFirebaseAdmin(): any {
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
    await getMessaging(app).send({
      topic: `channel-${channelId}`,
      data: {
        messageId: data.messageId,
        channelId: data.channelId,
        sender: data.sender,
        content: data.content.slice(0, 200),
      },
    });
  } catch {
    // FCM delivery failure is non-fatal
  }
}

export async function sendDirectMessage(token: string, data: FCMData): Promise<void> {
  const app = getFirebaseAdmin();
  if (!app) return;

  try {
    const { getMessaging } = require('firebase-admin/messaging');
    await getMessaging(app).send({ token, data });
  } catch {}
}
