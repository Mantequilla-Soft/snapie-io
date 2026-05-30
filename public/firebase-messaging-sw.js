// Firebase Messaging Service Worker
// Handles background push notifications from FCM

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

let messaging = null;
let initialized = false;

function decodeConfigFromQuery() {
  try {
    const url = new URL(self.location.href);
    const encoded = url.searchParams.get('firebaseConfig');
    if (!encoded) return null;
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function ensureMessaging(config) {
  try {
    if (!initialized && config) {
      firebase.initializeApp(config);
      initialized = true;
      messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        // If payload already contains a notification, browser may auto-display it.
        // Keep our manual fallback only for data-only payloads.
        if (payload && payload.notification) return;
        const { channelId, sender, content } = payload.data || {};
        self.registration.showNotification(`#${channelId}`, {
          body: `${sender}: ${content}`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `chat-${channelId}`,
          renotify: true,
          data: { channelId },
        });
      });
    }
  } catch {}
}

// Attempt startup init from querystring for first-load registrations.
ensureMessaging(decodeConfigFromQuery());

// Fallback init path via postMessage from the app.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    ensureMessaging(event.data.config);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const channelId = event.notification.data?.channelId;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
