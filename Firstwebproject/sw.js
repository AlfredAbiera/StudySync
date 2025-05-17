// StudySync Service Worker - v2
const CACHE_NAME = 'studysync-v2';
const DB_NAME = 'NotificationsDB';
const STORE_NAME = 'notifications';
const CHECK_INTERVAL = 30000; // 30 seconds - better for battery life

// Global state
let db = null;
let notificationCheckInterval = null;

// Initialize the IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Increment version to trigger upgrade
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB connected successfully');
      
      // Handle connection losses
      db.onversionchange = () => {
        db.close();
        db = null;
        console.log('DB version changed');
      };
      
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Drop existing store if it exists
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      // Create new store with proper indexes
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('deadline', 'deadline');
      store.createIndex('shown', 'shown');
      store.createIndex('deadline_shown', ['deadline', 'shown']);
    };
  });
}

// Get DB connection (create if doesn't exist)
async function getDB() {
  if (db) return db;
  return initDB();
}

// Store a notification in IndexedDB
async function storeNotification(notification) {
  try {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      const request = store.put(notification);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to store notification:', error);
    throw error;
  }
}

// Get all pending notifications
async function getPendingNotifications() {
  try {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        const notifications = request.result.filter(n => !n.shown);
        resolve(notifications);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending notifications:', error);
    return [];
  }
}

// Mark notification as shown
async function markNotificationAsShown(id) {
  try {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const notification = getRequest.result;
        if (notification) {
          notification.shown = true;
          const updateRequest = store.put(notification);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve(false);
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('Failed to mark notification as shown:', error);
    return false;
  }
}

// Display notification
async function showNotification(notification) {
  try {
    await self.registration.showNotification('Task Due Soon!', {
      body: `Task "${notification.title}" is due in 2 hours!`,
      icon: './assets/favicon.ico',
      badge: './assets/favicon.ico',
      requireInteraction: true,
      tag: `task-${notification.id}`,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: 'View Task' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: notification
    });
    
    console.log('Notification shown:', notification.title);
    return await markNotificationAsShown(notification.id);
  } catch (error) {
    console.error('Failed to show notification:', error);
    return false;
  }
}

// Ensure notification check runs even when page is closed
async function checkNotifications() {
  try {
    const database = await getDB();
    if (!database) return;

    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const now = Date.now();
      const updates = [];

      const request = store.getAll();
      
      request.onsuccess = () => {
        const notifications = request.result.filter(n => !n.shown);
        
        notifications.forEach(notification => {
          const timeUntilDeadline = notification.deadline - now;
          
          if (timeUntilDeadline <= 7200000 && timeUntilDeadline > 0) {
            self.registration.showNotification('Task Due Soon!', {
              body: `Task "${notification.title}" is due in 2 hours!`,
              icon: './assets/favicon.ico',
              badge: './assets/favicon.ico',
              requireInteraction: true,
              tag: notification.id,
              renotify: true,
              data: notification
            });

            notification.shown = true;
            updates.push(store.put(notification));
          }
        });

        Promise.all(updates)
          .then(() => resolve())
          .catch(reject);
      };

      request.onerror = () => reject(request.error);
      
      tx.oncomplete = () => {
        console.log('Notification check transaction completed');
        resolve();
      };
      
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
}

// Run periodic checks
setInterval(checkNotifications, 30000);

// Start periodic notification check
function startNotificationCheck() {
  // Clear any existing interval
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
  }
  
  // Start new interval
  notificationCheckInterval = setInterval(checkNotifications, CHECK_INTERVAL);
  console.log('Notification check started with interval:', CHECK_INTERVAL);
}

// Service Worker install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  // Skip waiting to activate immediately
  event.waitUntil(self.skipWaiting());
});

// Service Worker activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Claim clients so the service worker takes control immediately
      clients.claim(),
      
      // Initialize database and start notification check
      initDB().then(() => {
        startNotificationCheck();
      })
    ])
  );
});

// Handle messages from the main thread
self.addEventListener('message', async (event) => {
  console.log('Service Worker received message:', event.data.type);
  
  if (event.data.type === 'SCHEDULE_NOTIFICATION') {
    try {
      const { task } = event.data;
      const now = Date.now();
      const deadline = new Date(task.deadline).getTime();
      const notifyTime = deadline - (2 * 60 * 60 * 1000); // 2 hours before
      
      const notification = {
        id: task.id || Date.now(), // Use provided ID or generate one
        title: task.title,
        deadline: deadline,
        scheduledTime: notifyTime,
        shown: false
      };
      
      await storeNotification(notification);
      console.log('Notification scheduled for:', new Date(notifyTime).toLocaleString());
      
      // Respond to the client
      if (event.source) {
        event.source.postMessage({
          type: 'NOTIFICATION_SCHEDULED',
          success: true,
          taskId: notification.id
        });
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
      
      // Respond with error
      if (event.source) {
        event.source.postMessage({
          type: 'NOTIFICATION_SCHEDULED',
          success: false,
          error: error.message
        });
      }
    }
  } else if (event.data.type === 'CHECK_NOTIFICATIONS') {
    // Force check notifications
    checkNotifications();
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notification = event.notification.data;
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) {
          // Focus existing window
          clientList[0].focus();
          // Navigate to the task view
          clientList[0].postMessage({
            type: 'NAVIGATE_TO_TASK',
            taskId: notification.id
          });
        } else {
          // Open new window
          clients.openWindow('/');
        }
      })
    );
  }
});

// Handle push messages (from a push service)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: './assets/favicon.ico',
        badge: './assets/favicon.ico',
        data: data.data
      })
    );
  } else {
    // If no data, trigger notification check
    event.waitUntil(checkNotifications());
  }
});

// Handle sync events (for background sync)
self.addEventListener('sync', (event) => {
  if (event.tag === 'notifications-sync') {
    event.waitUntil(checkNotifications());
  }
});

// Handle periodic sync events (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'notifications-check') {
    event.waitUntil(checkNotifications());
  }
});

// Start notification check immediately
startNotificationCheck();