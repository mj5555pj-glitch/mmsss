// Firebase Cloud Messaging Service Worker for FutureX
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: "winged-antler-3n50x",
  appId: "1:293424127969:web:3f7bd7aaba16550772bca0",
  apiKey: "AIzaSyAIik7ugJKOJevFzR_Pv4KAlkOf0HD8Ldk",
  authDomain: "winged-antler-3n50x.firebaseapp.com",
  storageBucket: "winged-antler-3n50x.firebasestorage.app",
  messagingSenderId: "293424127969"
});

const messaging = firebase.messaging();

// Handle background messages when app is closed or in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || 'إشعار جديد من FutureX';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/manifest.json',
    badge: '/manifest.json',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Generic push listener fallback
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      const title = payload.notification?.title || payload.title || 'إشعار مهم - FutureX';
      const options = {
        body: payload.notification?.body || payload.body || '',
        icon: '/manifest.json',
        badge: '/manifest.json',
        dir: 'rtl',
        lang: 'ar',
        vibrate: [200, 100, 200],
        data: payload.data || payload
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.warn('[firebase-messaging-sw.js] Push parse warning:', e);
    }
  }
});

// Notification click behavior
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
