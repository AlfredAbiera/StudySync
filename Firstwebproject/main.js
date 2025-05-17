let isLogin = true;
let currentTab = 'addTask';
let editingTaskIndex = -1;

// Initialize EmailJS
(function(){
  emailjs.init({
    publicKey: "isEpl2t4rFKU9KIHX",
  });
})();

// Add after emailjs.init()
if ('Notification' in window) {
  Notification.requestPermission();
}

// Update service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Request persistent storage for better reliability
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('sw.js', {
        scope: './',
        updateViaCache: 'none'
      });

      // Wait for service worker to be active
      await navigator.serviceWorker.ready;

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Register background sync
        try {
          await registration.sync.register('check-notifications');
          await registration.periodicSync.register('notifications-check', {
            minInterval: 60000 // Check every minute
          });
        } catch (e) {
          console.log('Background sync not available, falling back to regular checks');
        }
      }

      // Keep service worker alive
      setInterval(() => {
        registration.active?.postMessage({ type: 'KEEP_ALIVE' });
      }, 20000);

    } catch (err) {
      console.error('ServiceWorker/Notification setup failed:', err);
    }
  });

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      navigator.serviceWorker.controller?.postMessage({ 
        type: 'PAGE_HIDDEN',
        timestamp: Date.now()
      });
    }
  });
}

// Replace the old NotificationManager with the enhanced version from notif.js
const NotificationManager = {
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  },
  
  async init() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        // Check for pending notifications on init
        this.checkPendingNotifications();
      }
    } catch (err) {
      console.error('Notification init failed:', err);
    }
  },

  async sendEmailNotification(task) {
    const user = localStorage.getItem("loggedUser");
    if (!user) return;

    try {
      await emailjs.send("service_0918gt9", "template_xpjxq2k", {
        to_email: user,
        task_title: task.title,
        deadline: new Date(task.deadline).toLocaleString()
      });
      console.log('Email notification sent');
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  },

  checkPendingNotifications() {
    const pending = JSON.parse(localStorage.getItem('pendingNotifications') || '[]');
    const now = Date.now();
    
    pending.forEach(notification => {
      if (notification.scheduledTime > now) {
        this.scheduleNotification(notification.task, notification.scheduledTime - now);
      }
    });
  },

  scheduleNotification(task, delay) {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        task: {
          id: task.id || Date.now(),
          title: task.title,
          deadline: task.deadline,
          priority: task.priority,
          timestamp: Date.now()
        }
      });
    }

    // Keep email notifications
    setTimeout(() => {
      this.sendEmailNotification(task);
    }, delay);

    return true;
  }
};

// Initialize notification manager after EmailJS
NotificationManager.init();

// Remove duplicate functions and use NotificationManager's versions
function scheduleNotification(task) {
  return NotificationManager.scheduleNotification(task);
}

// Update email notification handling
async function sendReminderEmail(to_email, task_title, deadline) {
  try {
    await emailjs.send("service_0918gt9", "template_xpjxq2k", {
      to_email: to_email,
      task_title: task_title,
      deadline: deadline.toLocaleString()
    });
    console.log('Email notification sent');
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// Check URL parameters on load
window.addEventListener('load', function() {
  const params = new URLSearchParams(window.location.search);
  const authMode = params.get('auth');
  if (authMode) {
    showAuth();
    if (authMode === 'signup' && isLogin) {
      toggleMode();
    }
  }
});

// Modified beforeunload to only trigger for logged in users
window.addEventListener('beforeunload', function(e) {
  if (document.getElementById('taskSection').classList.contains('hidden')) {
    return;
  }
  localStorage.removeItem("loggedUser");
});

function showAuth() {
    document.getElementById("aboutSection").classList.add("hidden");
    const authSection = document.getElementById("authSection");
    authSection.classList.remove("hidden");
    authSection.innerHTML = `
        <div class="logo">
            <span class="logo-icon">🔐</span>
            <span class="logo-text" id="formTitle">Login</span>
            <a href="#" onclick="showAbout()" class="back-link">← Go Back </a>
        </div>
        <input type="email" id="email" placeholder="Email" autocomplete="email">
        <input type="password" id="password" placeholder="Password" autocomplete="current-password" onkeydown="if(event.key === 'Enter') authAction()">
        <a href="#" onclick="showForgotPassword()" class="forgot-password-link">Forgot Password?</a>
        <button onclick="authAction()">Login</button>
        <div class="auth-toggle" id="switchPrompt">
            Don't have an account? <a href="#" onclick="toggleMode()">Sign up here</a>
        </div>
    `;
}

// Add new function to handle going back to about section
function showAbout() {
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("aboutSection").classList.remove("hidden");
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    if (tab === 'addTask') {
      document.getElementById('addTaskTab').classList.remove('hidden');
      document.getElementById('viewTasksTab').classList.add('hidden');
    } else {
      document.getElementById('addTaskTab').classList.add('hidden');
      document.getElementById('viewTasksTab').classList.remove('hidden');
    }
  }

  function toggleMode() {
    isLogin = !isLogin;
    document.getElementById('formTitle').innerText = isLogin ? "Login" : "Sign Up";
    document.querySelector("#authSection button").innerText = isLogin ? "Login" : "Register";
    document.getElementById("switchPrompt").innerHTML = isLogin ? 
      'Don\'t have an account? <a href="#" onclick="toggleMode()">Sign up here</a>' :
      'Already have an account? <a href="#" onclick="toggleMode()">Login here</a>';
  }

  function authAction() {
    const emailField = document.getElementById("email");
    const passwordField = document.getElementById("password");
    const email = emailField.value;
    const password = passwordField.value;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !password) return alert("Please fill in both fields.");
    if (!emailRegex.test(email)) return alert("Enter a valid email.");

    let users = JSON.parse(localStorage.getItem("users")) || {};
    if (isLogin) {
      if (users[email] === "hashed" + password) {
        localStorage.setItem("loggedUser", email);
        loadDashboard();
      } else {
        alert("Invalid login credentials.");
      }
    } else {
      if (users[email]) return alert("User already exists.");
      users[email] = "hashed" + password;
      localStorage.setItem("users", JSON.stringify(users));
      alert("Account created successfully!");
      toggleMode();
    }
  }

  function logout() {
    localStorage.removeItem("loggedUser");
    location.reload();
  }

  function loadDashboard() {
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("taskSection").classList.remove("hidden");
    const userEmail = localStorage.getItem("loggedUser");
    document.getElementById("userDisplay").innerText = "Welcome, " + userEmail.split('@')[0];
    document.getElementById("userAvatar").innerText = userEmail.charAt(0).toUpperCase();
    renderTasks();
  }

  class Task {
    constructor(title, deadline, priority) {
      this.title = title;
      this.deadline = new Date(deadline);
      this.priority = parseInt(priority);
      this.completed = false;
      this.reminderSent = false;
      this.notificationScheduled = false;
    }
  }

  function getUserTasks() {
    const user = localStorage.getItem("loggedUser");
    const rawTasks = JSON.parse(localStorage.getItem(user + "_tasks")) || [];
    return rawTasks.map(task => {
      task.deadline = new Date(task.deadline);
      return task;
    });
  }

  function setUserTasks(tasks) {
    const user = localStorage.getItem("loggedUser");
    localStorage.setItem(user + "_tasks", JSON.stringify(tasks));
  }

  function addTask() {
    const title = document.getElementById("title").value;
    const date = document.getElementById("deadline").value;
    const time = document.getElementById("time").value;
    const priority = document.getElementById("priority").value;

    if (!title || !date || !time || !priority) return alert("Please fill all fields.");

    const deadline = new Date(date + "T" + time);
    const tasks = getUserTasks();

    if (editingTaskIndex >= 0) {
      tasks[editingTaskIndex] = new Task(title, deadline, priority);
      const notificationSet = scheduleNotification(tasks[editingTaskIndex]);
      tasks[editingTaskIndex].notificationScheduled = notificationSet;
      editingTaskIndex = -1;
      document.getElementById("addTaskBtn").textContent = "Add Task";
    } else {
      const newTask = new Task(title, deadline, priority);
      const notificationSet = scheduleNotification(newTask);
      newTask.notificationScheduled = notificationSet;
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

  function clearFields() {
    document.getElementById("title").value = "";
    document.getElementById("deadline").value = "";
    document.getElementById("time").value = "";
    document.getElementById("priority").value = "";
    editingTaskIndex = -1;
    document.getElementById("addTaskBtn").textContent = "Add Task";
  }

  function deleteTask(index) {
    if (confirm("Are you sure you want to delete this task?")) {
      const tasks = getUserTasks();
      tasks.splice(index, 1);
      setUserTasks(tasks);
      renderTasks();
    }
  }

  function toggleComplete(index) {
    const tasks = getUserTasks();
    tasks[index].completed = !tasks[index].completed;
    setUserTasks(tasks);
    renderTasks();
  }

  function editTask(index) {
    const tasks = getUserTasks();
    const task = tasks[index];
    editingTaskIndex = index;
    
    document.getElementById("title").value = task.title;
    
    const dateStr = task.deadline.toISOString().split('T')[0];
    document.getElementById("deadline").value = dateStr;
    
    const hours = String(task.deadline.getHours()).padStart(2, "0");
    const minutes = String(task.deadline.getMinutes()).padStart(2, "0");
    document.getElementById("time").value = `${hours}:${minutes}`;
    
    document.getElementById("priority").value = task.priority;
    document.getElementById("addTaskBtn").textContent = "Update Task";
    
    switchTab('addTask');
    document.querySelectorAll('.tab-button')[0].classList.add('active');
    document.querySelectorAll('.tab-button')[1].classList.remove('active');
  }

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

  // Replace the old interval with NotificationManager
  setInterval(() => {
    const user = localStorage.getItem("loggedUser");
    if (!user) return;
    const tasks = getUserTasks();
    const now = new Date();
  
    tasks.forEach(async task => {
      const diff = new Date(task.deadline) - now;
      if (!task.completed && diff <= 7200000 && diff > 0 && !task.reminderSent) {
        if (await NotificationManager.sendEmailNotification(task)) {
          task.reminderSent = true;
          setUserTasks(tasks);
        }
      }
    });
  }, 60000); // check every minute

  if (localStorage.getItem("loggedUser")) {
    loadDashboard();
  }

// Forgot Password functionality
const PasswordRecovery = {
  resetCode: null,
  userEmail: null,

  generateResetCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

sendResetCode(email) {
  this.resetCode = this.generateResetCode();
  this.userEmail = email;

  return emailjs.send("service_0918gt9", "template_xh77za7", {
    to_email: email,
    subject: "Password Reset Code",
    message: `Your password reset code is: ${this.resetCode}`
  });
},

  verifyCode(code) {
    return code === this.resetCode;
  },

  resetPassword(newPassword) {
    if (!this.userEmail) return false;
    
    let users = JSON.parse(localStorage.getItem("users")) || {};
    users[this.userEmail] = "hashed" + newPassword;
    localStorage.setItem("users", JSON.stringify(users));
    
    // Clear recovery data
    this.resetCode = null;
    this.userEmail = null;
    return true;
  }
};

function showForgotPassword() {
  const authSection = document.getElementById("authSection");
  authSection.innerHTML = `
    <div class="logo">
      <span class="logo-icon">🔑</span>
      <span class="logo-text">Reset Password</span>
    </div>
    <div id="resetStep1">
      <input type="email" id="resetEmail" placeholder="Enter your email" autocomplete="email">
      <button onclick="sendResetCode()">Send Reset Code</button>
      <div class="auth-toggle">
        <a href="#" onclick="showAuth()">Back to Login</a>
      </div>
    </div>
    <div id="resetStep2" class="hidden">
      <input type="text" id="resetCode" placeholder="Enter 6-digit code">
      <input type="password" id="newPassword" placeholder="New password">
      <button onclick="verifyAndReset()">Reset Password</button>
    </div>
  `;
}

function sendResetCode() {
  const email = document.getElementById("resetEmail").value;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!email || !emailRegex.test(email)) {
    alert("Please enter a valid email address.");
    return;
  }

  const users = JSON.parse(localStorage.getItem("users")) || {};
  if (!users[email]) {
    alert("Email not found.");
    return;
  }

  PasswordRecovery.sendResetCode(email)
    .then(() => {
      document.getElementById("resetStep1").classList.add("hidden");
      document.getElementById("resetStep2").classList.remove("hidden");
    })
    .catch(() => alert("Failed to send reset code. Please try again."));
}

function verifyAndReset() {
  const code = document.getElementById("resetCode").value;
  const newPassword = document.getElementById("newPassword").value;

  if (!code || !newPassword) {
    alert("Please fill in all fields.");
    return;
  }

  if (PasswordRecovery.verifyCode(code)) {
    if (PasswordRecovery.resetPassword(newPassword)) {
      alert("Password reset successful!");
      showAuth(); // Show login screen
      document.getElementById("email").value = PasswordRecovery.userEmail; // Pre-fill email
      document.getElementById("password").value = ""; // Clear password field
    } else {
      alert("Password reset failed. Please try again.");
    }
  } else {
    alert("Invalid reset code.");
  }
}



