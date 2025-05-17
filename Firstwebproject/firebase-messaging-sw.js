// Service worker for Firebase Cloud Messaging
let messaging;

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    Promise.all([
      self.importScripts(
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js'
      ),
    ]).then(() => {
      firebase.initializeApp({
        apiKey: "AIzaSyCqise0SNeN4mFMzRwPTsMc8FxQdAd6oKQ",
        authDomain: "studysync-b222a.firebaseapp.com",
        projectId: "studysync-b222a",
        storageBucket: "studysync-b222a.firebasestorage.app",
        messagingSenderId: "578651429643",
        appId: "1:578651429643:web:466c8fcb3045c20bae600e",
        measurementId: "G-2PJ1J3Z4K2"
      });
      
      messaging = firebase.messaging();

      // Set up background message handler
      messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message:', payload);

        const notificationTitle = payload.notification.title || 'StudySync Reminder';
        const notificationOptions = {
          body: payload.notification.body || 'You have an assignment due soon',
          icon: '/logo.png',
          badge: '/logo.png',
          data: payload.data,
          tag: payload.data?.taskId || 'deadline-notification',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          actions: [
            {
              action: 'view',
              title: 'View Assignment'
            }
          ]
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
      });

      return messaging;
    }).catch(error => {
      console.error('Service worker activation or messaging setup failed:', error);
    })
  );
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click:', event);
  
  event.notification.close();
  
  // This will open the app and focus on it, if it's already open
  event.waitUntil(
    clients.matchAll({
      type: 'window'
    }).then(clientList => {
      // Check if there is already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window/tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handler for push notifications (if you implement web push)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  if (event && event.data) {
    try {
      const data = event.data.json();
      
      // Show notification based on push data
      const title = data.notification.title || 'StudySync Reminder';
      const options = {
        body: data.notification.body || 'You have an assignment due soon',
        icon: '/logo.png',
        badge: '/logo.png',
        data: data.data,
        tag: data.data?.taskId || 'deadline-notification',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        actions: [
          {
            action: 'view',
            title: 'View Assignment'
          }
        ]
      };
      
      event.waitUntil(
        self.registration.showNotification(title, options)
      );
    } catch (error) {
      console.error('[Service Worker] Error showing notification:', error);
    }
  }
});

// Listen for token refresh
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REFRESH_TOKEN') {
    // Notify clients about token refresh
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'TOKEN_REFRESH'
        });
      });
    });
  }
});