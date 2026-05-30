'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configStr) return null;
  try {
    const config = JSON.parse(configStr);
    app = getApps().length > 0 ? getApp() : initializeApp(config);
    return app;
  } catch {
    return null;
  }
}

function getFirebaseMessaging(): Messaging | null {
  if (messaging) return messaging;
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    messaging = getMessaging(firebaseApp);
    return messaging;
  } catch {
    return null;
  }
}

export async function getFCMToken(): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return null;

  const m = getFirebaseMessaging();
  if (!m) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    // Register SW and send it the Firebase config. Include config in URL too so
    // first registration works even when there is no active worker yet.
    const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
    const configEncoded = configStr
      ? encodeURIComponent(toBase64Utf8(configStr))
      : '';
    const swUrl = configEncoded
      ? `/firebase-messaging-sw.js?firebaseConfig=${configEncoded}`
      : '/firebase-messaging-sw.js';
    const swReg = await navigator.serviceWorker.register(swUrl);
    const readyReg = await navigator.serviceWorker.ready;
    if (configStr) {
      const payload = { type: 'FIREBASE_CONFIG', config: JSON.parse(configStr) };
      readyReg.active?.postMessage(payload);
      readyReg.waiting?.postMessage(payload);
      readyReg.installing?.postMessage(payload);
    }

    const token = await getToken(m, { vapidKey, serviceWorkerRegistration: readyReg || swReg });
    return token || null;
  } catch {
    return null;
  }
}

export function onForegroundMessage(handler: (payload: unknown) => void): () => void {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, handler);
}
