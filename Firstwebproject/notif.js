// StudySync Main.js - Notifications Enhancements
// This file contains only the notification-related code to add to your main.js

// Initialize notification system
const NotificationSystem = {
  // Check if the browser supports notifications
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  },
  
  // Request notification permission
  async requestPermission() {
    if (!this.isSupported()) return false;
    
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  },
  
  // Register service worker
  async registerServiceWorker() {
    if (!this.isSupported()) return null;
    
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none' // Don't use cache for service worker
      });
      
      console.log('ServiceWorker registered successfully');
      return registration;
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
      return null;
    }
  },
  
  // Initialize the notification system
  async init() {
    // Check if notifications are supported
    if (!this.isSupported()) {
      console.log('Notifications not supported');
      return false;
    }
    
    try {
      // Request permission
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.log('Notification permission denied');
        return false;
      }
      
      // Register service worker
      const registration = await this.registerServiceWorker();
      if (!registration) return false;
      
      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
      
      // Initialize heartbeat for when the page is visible
      this.initHeartbeat();
      
      console.log('Notification system initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize notification system:', error);
      return false;
    }
  },
  
  // Send heartbeat to service worker
  initHeartbeat() {
    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Notify the service worker that the page is hidden
        this.sendMessageToSW({ type: 'PAGE_HIDDEN' });
      }
    });
    
    // Every 5 minutes when the page is open, trigger a check
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.sendMessageToSW({ type: 'CHECK_NOTIFICATIONS' });
      }
    }, 300000); // 5 minutes
  },
  
  // Send message to service worker
  async sendMessageToSW(message) {
    if (!navigator.serviceWorker.controller) return;
    
    try {
      await navigator.serviceWorker.controller.postMessage(message);
    } catch (error) {
      console.error('Failed to send message to service worker:', error);
    }
  },
  
  // Schedule a notification for a task
  async scheduleNotification(task) {
    if (!navigator.serviceWorker.controller) {
      console.log('Service worker not active');
      return false;
    }
    
    try {
      // Create a unique ID for the task if it doesn't have one
      if (!task.id) {
        task.id = Date.now();
      }
      
      // Send message to service worker
      this.sendMessageToSW({
        type: 'SCHEDULE_NOTIFICATION',
        task: {
          id: task.id,
          title: task.title,
          deadline: task.deadline,
          priority: task.priority
        }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return false;
    }
  }
};

// Listen for messages from service worker
navigator.serviceWorker.addEventListener('message', (event) => {
  const message = event.data;
  
  if (message.type === 'NOTIFICATION_SCHEDULED') {
    console.log('Notification scheduled:', message.success);
  } else if (message.type === 'NAVIGATE_TO_TASK') {
    // Handle navigation to task (from notification click)
    switchTab('viewTasks');
    document.getElementById('search').value = ''; // Clear search
    renderTasks();
    
    // Highlight the task if found
    setTimeout(() => {
      const taskElements = document.querySelectorAll('.task');
      for (let i = 0; i < taskElements.length; i++) {
        if (taskElements[i].dataset.taskId === message.taskId) {
          taskElements[i].classList.add('highlighted');
          taskElements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            taskElements[i].classList.remove('highlighted');
          }, 3000);
          break;
        }
      }
    }, 500);
  }
});

// Initialize notification system when the page loads
window.addEventListener('load', async () => {
  await NotificationSystem.init();
  
  // Check for pending tasks
  if (localStorage.getItem("loggedUser")) {
    const tasks = getUserTasks();
    
    // Schedule notifications for all incomplete tasks
    tasks.forEach(task => {
      if (!task.completed && !task.notificationScheduled) {
        task.notificationScheduled = NotificationSystem.scheduleNotification(task);
      }
    });
    
    setUserTasks(tasks);
  }
});

// Replace old scheduleNotification function
function scheduleNotification(task) {
  return NotificationSystem.scheduleNotification(task);
}

// Update addTask function to include task ID
function addTask() {
  const title = document.getElementById("title").value;
  const date = document.getElementById("deadline").value;
  const time = document.getElementById("time").value;
  const priority = document.getElementById("priority").value;

  if (!title || !date || !time || !priority) return alert("Please fill all fields.");

  const deadline = new Date(date + "T" + time);
  const tasks = getUserTasks();

  if (editingTaskIndex >= 0) {
    // Update existing task
    tasks[editingTaskIndex].title = title;
    tasks[editingTaskIndex].deadline = deadline;
    tasks[editingTaskIndex].priority = parseInt(priority);
    tasks[editingTaskIndex].notificationScheduled = scheduleNotification(tasks[editingTaskIndex]);
    editingTaskIndex = -1;
    document.getElementById("addTaskBtn").textContent = "Add Task";
  } else {
    const newTask = {
      id: Date.now(),
      title: title,
      deadline: deadline,
      priority: parseInt(priority),
      completed: false,
      reminderSent: false,
      notificationScheduled: false
    };
    newTask.notificationScheduled = scheduleNotification(newTask);
    tasks.push(newTask);
  }

  tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  setUserTasks(tasks);
  clearFields();
  
  switchTab('viewTasks');
  document.querySelectorAll('.tab-button')[1].classList.add('active');
  document.querySelectorAll('.tab-button')[0].classList.remove('active');
  
  renderTasks();
}

// Update renderTasks to include task ID in the DOM
function renderTasks() {
  const list = document.getElementById("taskList");
  const search = document.getElementById("search").value.toLowerCase();
  const tasks = getUserTasks().filter(t => t.title.toLowerCase().includes(search));
  list.innerHTML = "";

  if (tasks.length === 0) {
    list.innerHTML = "<p style='text-align: center; color: var(--gray-500);'>No tasks found. Add some tasks to get started!</p>";
    return;
  }

  // Sort tasks by completion status, then by deadline
  tasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  
  tasks.forEach((task, index) => {
    if (!task.notificationScheduled && !task.completed) {
      task.notificationScheduled = scheduleNotification(task);
    }
    const div = document.createElement("div");
    div.className = "task" + (task.completed ? " completed" : "");
    div.dataset.taskId = task.id; // Add task ID as a data attribute

    const now = new Date();
    const deadline = new Date(task.deadline);
    const isOverdue = !task.completed && deadline < now;
    
    if (isOverdue) {
      div.style.borderLeft = "4px solid var(--danger)";
    }

    const deadlineString = deadline.toLocaleDateString() + " at " + 
      deadline.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const priorityLabels = ["", "Low", "Medium-Low", "Medium", "Medium-High", "High"];

    div.innerHTML = `
      <div class="task-header">
        <span class="task-title">${task.title}</span>
        <span class="task-priority priority-${task.priority}">${priorityLabels[task.priority]}</span>
      </div>
      <div class="task-details">
        <div>${isOverdue ? '⚠️ Overdue' : '⏰'} Deadline: ${deadlineString}</div>
      </div>
      <div class="task-actions">
        <button class="btn-sm ${task.completed ? 'btn-secondary' : 'btn-success'}" onclick="toggleComplete(${index})">
          ${task.completed ? "Mark Incomplete" : "Complete"}
        </button>
        <button class="btn-sm btn-secondary" onclick="editTask(${index})">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteTask(${index})">Delete</button>
      </div>
    `;
    list.appendChild(div);
  });
}