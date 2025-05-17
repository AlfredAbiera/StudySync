// Firebase Cloud Messaging Service for StudySync
import { 
  initializeApp 
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js';
import { 
  getMessaging, 
  getToken, 
  onMessage, 
  isSupported 
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-messaging.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  serverTimestamp, 
  getDoc 
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js';
import { 
  getAuth 
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js';

class FCMService {
  constructor(firebaseConfig) {
    this.app = initializeApp(firebaseConfig, 'messaging');
    this.messaging = null;
    this.vapidKey = 'BDlj7_zxY9TzLvPGKVikgGbJ8RzKi-z7rgMCAzrr45DcDLTY8tJVDPK70YZpnYch4XWzhqtK6SqWobYzwLMNEM8';
    this.notificationTimeframe = 2; // Notification sent 2 hours before deadline
    this.db = getFirestore(this.app);
    this.auth = getAuth(this.app);
    this.isInitialized = false; // Track initialization state
    this.initializationPromise = null; // Store the initialization promise
    this.init();
  }

  async init() {
    // Only initialize once
    if (this.initializationPromise) {
      console.log('FCM initialization already in progress, returning existing promise');
      return this.initializationPromise;
    }

    // Create a promise that resolves when initialization is complete
    this.initializationPromise = new Promise(async (resolve, reject) => {
      try {
        console.log('Starting FCM service initialization for StudySync');
        // Check if browser supports FCM
        const isMessagingSupported = await isSupported();
        
        if (!isMessagingSupported) {
          console.log('Firebase Cloud Messaging is not supported in this browser');
          this.isInitialized = false;
          resolve(false);
          return;
        }
        
        // Initialize messaging
        this.messaging = getMessaging(this.app);
        console.log('Firebase messaging initialized');
        
        // Check if service worker is registered
        if ('serviceWorker' in navigator) {
          try {
            // Determine service worker path and scope based on deployment environment
            const swScope = this.getServiceWorkerScope();
            const swPath = this.getServiceWorkerPath();
            
            const registrations = await navigator.serviceWorker.getRegistrations();
            const hasSWRegistered = registrations.some(reg => 
              reg.scope.includes(swScope.replace('*', '')));
            
            if (!hasSWRegistered) {
              console.log('Service worker not found, registering now...');
              await this.registerServiceWorker();
            } else {
              console.log('Service worker already registered for StudySync');
            }
            
            // Set up message handler for foreground notifications
            this.setupMessageHandler();
            
            // Setup token refresh listener
            this.setupTokenRefreshListener();
            
            // Mark as initialized
            this.isInitialized = true;
            console.log('FCM service initialized successfully for StudySync');
            
            // Setup auth state change listener
            this.auth.onAuthStateChanged(async (user) => {
              if (user) {
                try {
                  console.log('User logged in, saving FCM token');
                  // Get and save token for logged in user
                  const token = await this.getToken();
                  if (token) {
                    await this.saveUserToken(token);
                  }
                } catch (error) {
                  console.error('Error saving token on auth state change:', error);
                }
              } else {
                console.log('User logged out, FCM token not saved');
              }
            });
            
            resolve(true);
          } catch (error) {
            console.error('Error during service worker registration:', error);
            this.isInitialized = false;
            reject(error);
          }
        } else {
          console.warn('Service workers are not supported in this browser');
          this.isInitialized = false;
          resolve(false);
        }
      } catch (error) {
        console.error('FCM initialization error:', error);
        this.isInitialized = false;
        reject(error);
      }
    });
    
    return this.initializationPromise;
  }

  // Wait for initialization to complete
  async waitForInitialization() {
    if (this.isInitialized) {
      return true;
    }
    
    try {
      return await this.initializationPromise;
    } catch (error) {
      console.error('Error waiting for FCM initialization:', error);
      return false;
    }
  }

  // Get the correct service worker scope based on environment
  getServiceWorkerScope() {
    // Check if we're on GitHub Pages or custom domain
    const hostname = window.location.hostname;
    const isCustomDeployment = hostname !== 'localhost' && hostname !== '127.0.0.1';
    
    // For custom deployment, we need /
    // For local development, just / is fine
    return isCustomDeployment ? '/' : '/';
  }

  // Get the correct service worker path based on environment
  getServiceWorkerPath() {
    return '/firebase-messaging-sw.js';
  }

  async registerServiceWorker() {
    try {
      const swPath = this.getServiceWorkerPath();
      const swScope = this.getServiceWorkerScope();
      
      console.log(`Registering service worker at ${swPath} with scope ${swScope}`);
      
      const registration = await navigator.serviceWorker.register(swPath, {
        scope: swScope
      });
      
      console.log('Service Worker registered successfully for StudySync:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  setupMessageHandler() {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('StudySync notification received in foreground:', payload);
      
      // Handle case where notification might be undefined
      if (!payload.notification) {
        console.error('Received message without notification data');
        return;
      }
      
      // Get notification details
      const notificationTitle = payload.notification.title || 'StudySync Reminder';
      
      // Create base notification options without actions for direct Notification API
      const directOptions = {
        body: payload.notification.body || '',
        icon: this.getIconPath(),
        badge: this.getIconPath(),
        data: payload.data || {},
        tag: payload.data?.taskId || 'deadline-notification', // Group similar notifications
        vibrate: [200, 100, 200],  // Vibration pattern for mobile devices
        requireInteraction: true,  // Make notification persistent until user interaction
        silent: false // Ensure notification makes sound
      };
      
      // Add extended options (including actions) for service worker notifications
      const serviceWorkerOptions = {
        ...directOptions,
        requireInteraction: true,  // Makes notification stay until user interacts with it
        actions: [
          {
            action: 'view',
            title: 'View Assignment'
          }
        ]
      };
      
      // First try using the Notification API directly if available
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          // Only use the direct options (without actions) for the direct constructor
          const notification = new Notification(notificationTitle, directOptions);
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
          console.log('Direct StudySync notification created successfully');
          return;
        } catch (error) {
          console.log('Direct notification failed, falling back to service worker:', error);
          this.showNotificationViaServiceWorker(notificationTitle, serviceWorkerOptions);
        }
      } else if (Notification.permission !== 'denied') {
        // If permission not granted yet, request it
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            this.showNotificationViaServiceWorker(notificationTitle, serviceWorkerOptions);
            console.log('Showing notification via service worker after obtaining permission');
          } else {
            console.log('Notification permission denied by user');
          }
        });
      }
    });
  }
  
  // Helper method to get the correct icon path based on environment
  getIconPath() {
    return '/logo.png'; // Make sure you have a logo.png in your root directory
  }
  
  // Helper method to show notification using service worker
  async showNotificationViaServiceWorker(title, options) {
    try {
      // Ensure a service worker is active
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      if (registrations.length === 0) {
        console.log('No service workers registered, registering now...');
        const reg = await this.registerServiceWorker();
        await reg.showNotification(title, options);
        console.log('StudySync notification shown via newly registered service worker');
      } else {
        // Use the first active service worker registration
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
        console.log('StudySync notification shown via service worker');
      }
    } catch (error) {
      console.error('Failed to show StudySync notification:', error);
      
      // Final fallback - try to use a basic alert if all else fails
      alert(`${title}: ${options.body}`);
    }
  }

  async requestPermission() {
    try {
      // Wait for initialization before proceeding
      const isInitialized = await this.waitForInitialization();
      if (!isInitialized) {
        throw new Error('FCM initialization failed');
      }
      
      if (!this.messaging) {
        throw new Error('Messaging not initialized');
      }
      
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        console.log('StudySync notification permission granted.');
        return this.getToken();
      } else {
        console.log('Unable to get permission to notify for StudySync.');
        throw new Error('Permission denied');
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      throw error;
    }
  }

  async getToken() {
    try {
      // Wait for initialization before proceeding
      const isInitialized = await this.waitForInitialization();
      if (!isInitialized) {
        throw new Error('FCM initialization failed');
      }
      
      if (!this.messaging) {
        throw new Error('Messaging not initialized');
      }
      
      // Make sure we have a registered service worker
      const registrations = await navigator.serviceWorker.getRegistrations();
      let serviceWorkerRegistration = null;
      
      // Find our service worker registration
      for (const reg of registrations) {
        if (reg.scope.includes('/')) {
          serviceWorkerRegistration = reg;
          break;
        }
      }
      
      if (!serviceWorkerRegistration) {
        console.log('No appropriate service worker found, registering now');
        serviceWorkerRegistration = await this.registerServiceWorker();
      }
      
      // Get FCM token
      console.log('Getting FCM token with VAPID key for StudySync');
      const currentToken = await getToken(this.messaging, { 
        vapidKey: this.vapidKey,
        serviceWorkerRegistration
      });
      
      if (currentToken) {
        console.log('StudySync FCM token obtained successfully');
        return currentToken;
      } else {
        console.log('No registration token available. Request permission to generate one.');
        throw new Error('No FCM token available');
      }
    } catch (error) {
      console.error('An error occurred while getting FCM token for StudySync:', error);
      throw error;
    }
  }

  // Set up token refresh listener to keep tokens up to date
  setupTokenRefreshListener() {
    if (!this.messaging) return;
    
    // Listen for token refresh events
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data && event.data.type === 'TOKEN_REFRESH') {
        console.log('StudySync FCM token refresh detected');
        try {
          const newToken = await this.getToken();
          if (newToken) {
            await this.saveUserToken(newToken);
          }
        } catch (error) {
          console.error('Error handling token refresh for StudySync:', error);
        }
      }
    });
  }

  // Detect device platform for better tracking
  detectPlatform() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // iOS detection
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      console.log('iOS device detected');
      return 'ios';
    }
    
    // Android detection
    if (/android/i.test(userAgent)) {
      console.log('Android device detected');
      return 'android';
    }
    
    // PWA detection
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('PWA mode detected');
      return 'pwa';
    }
    
    // Default to web
    console.log('Web platform detected');
    return 'web';
  }

  // Save user FCM token to Firestore
  async saveUserToken(token) {
    try {
      if (!this.auth.currentUser) {
        console.warn('No authenticated user found, cannot save token');
        return false;
      }
      
      const user = this.auth.currentUser;
      const platform = this.detectPlatform();
      
      // Get the complete user data to include with token
      const userDoc = await getDoc(doc(this.db, 'users', user.uid));
      let userData = {};
      
      if (userDoc.exists()) {
        userData = userDoc.data();
      }
      
      // Create a unique token ID using uid and platform
      const tokenId = `${user.uid}_${platform}`;
      
      // Save to user_tokens collection with complete user information
      await setDoc(doc(this.db, 'user_tokens', tokenId), {
        uid: user.uid,
        token: token,
        platform: platform,
        // Include user profile information
        email: userData.email || user.email,
        displayName: userData.displayName || user.displayName,
        lastLogin: new Date().toISOString(),
        lastActive: serverTimestamp(),
        createdAt: serverTimestamp(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          screenSize: `${window.screen.width}x${window.screen.height}`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      }, { merge: true });
      
      console.log(`StudySync FCM token saved to Firestore for user: ${user.email} on platform: ${platform}`);
      return true;
    } catch (error) {
      console.error('Error saving user token to Firestore for StudySync:', error);
      return false;
    }
  }
  
  // Schedule notifications for task deadlines
  async scheduleTaskNotifications(task) {
    if (!task || !task.deadline || !task.time) {
      console.error('Invalid task data for notifications');
      return false;
    }
    
    try {
      // Get the task datetime
      const [year, month, day] = task.deadline.split('-').map(Number);
      const [hours, minutes] = task.time.split(':').map(Number);
      
      // Create task deadline time
      const deadlineTime = new Date(year, month - 1, day, hours, minutes);
      const now = new Date();
      
      // Calculate notification time (2 hours before deadline)
      const notificationTime = new Date(deadlineTime.getTime() - (this.notificationTimeframe * 60 * 60 * 1000));
      
      // Skip if notification time is in the past
      if (notificationTime <= now) {
        console.log('Skipping notification as deadline is less than 2 hours away or in the past');
        return false;
      }
      
      const payload = {
        task_id: task.id || `task-${task.deadline}-${task.time}`,
        title: `Upcoming Deadline: ${task.title || 'Assignment'}`,
        body: `Your assignment "${task.title}" is due in ${this.notificationTimeframe} hours.`,
        timestamp: notificationTime.getTime(),
        hours_before: this.notificationTimeframe,
        scheduled: true,
        user_id: this.auth.currentUser?.uid,
        task_deadline: task.deadline,
        task_time: task.time,
        priority: task.priority,
        created_at: now.getTime(),
        sent: false
      };
      
      await this.saveNotificationToDatabase(payload);
      console.log(`Notification scheduled for task "${task.title}" at ${notificationTime.toLocaleString()}`);
      
      return true;
    } catch (error) {
      console.error('Error scheduling task notifications for StudySync:', error);
      return false;
    }
  }
  
  async saveNotificationToDatabase(notificationData) {
    try {
      if (!this.auth.currentUser) {
        console.warn('No authenticated user found, cannot save notification');
        return false;
      }
      
      // Create a unique ID for the notification
      const notificationId = `${notificationData.task_id}_${notificationData.hours_before}`;
      
      // Save to Firestore notifications collection
      await setDoc(doc(this.db, 'notifications', notificationId), {
        ...notificationData,
        user_id: this.auth.currentUser.uid,
        created_at: serverTimestamp(),
        sent: false
      });
      
      console.log(`StudySync notification saved to database for ${new Date(notificationData.timestamp).toLocaleString()}`);
      return true;
    } catch (error) {
      console.error('Error saving notification to database for StudySync:', error);
      return false;
    }
  }
  
  async cancelTaskNotifications(taskId) {
    try {
      if (!this.auth.currentUser) {
        console.warn('No authenticated user found, cannot cancel notifications');
        return false;
      }
      
      // Query for notifications for this task and user
      const q = query(
        collection(this.db, 'notifications'), 
        where('task_id', '==', taskId),
        where('user_id', '==', this.auth.currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Delete each notification
      const batch = [];
      querySnapshot.forEach((doc) => {
        batch.push(deleteDoc(doc.ref));
      });
      
      await Promise.all(batch);
      
      console.log(`StudySync notifications cancelled for task: ${taskId}`);
      return true;
    } catch (error) {
      console.error('Error cancelling notifications for StudySync:', error);
      return false;
    }
  }
}

export default FCMService;