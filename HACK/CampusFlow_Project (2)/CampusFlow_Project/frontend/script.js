// script.js — unified frontend logic for CampusFlow (assignments + alerts + sync)
// Put this file in your frontend folder and ensure your HTML loads socket.io BEFORE this script.

const BACKEND_BASE = "http://localhost:3000";

// --- Socket.IO connection ---
const socket = io(BACKEND_BASE, { transports: ["websocket"] });

// Sync functionality
async function syncData() {
    try {
        const syncButton = document.querySelector('[data-action="sync"]');
        const syncHeaderButton = document.querySelector('#sync-header-button');
        
        // Show syncing state
        if (syncButton) {
            syncButton.innerHTML = `<i class="ri-loader-4-line animate-spin"></i><span>Syncing...</span>`;
            syncButton.disabled = true;
        }
        if (syncHeaderButton) {
            syncHeaderButton.innerHTML = `<i class="ri-loader-4-line animate-spin"></i><span>Syncing...</span>`;
            syncHeaderButton.disabled = true;
        }

        // Reload all data
        await Promise.all([
            loadAlerts(),
            loadAssignments(),
            loadAnnouncements()
        ]);
      // Update dashboard stat cards
      try { await updateStats(); } catch (e) { /* ignore */ }

        // Show success state
        if (syncButton) {
            syncButton.innerHTML = `<i class="ri-check-line"></i><span>Synced!</span>`;
            syncButton.classList.add('text-green-600', 'bg-green-50');
        }
        if (syncHeaderButton) {
            syncHeaderButton.innerHTML = `<i class="ri-check-line"></i><span>Synced!</span>`;
            syncHeaderButton.classList.add('bg-green-600');
        }

        // Show success toast
        displayAlertToast('Successfully synced all data!', 'success');

        // Reset buttons after 2 seconds
        setTimeout(() => {
            if (syncButton) {
                syncButton.innerHTML = `<i class="ri-refresh-line"></i><span>Sync</span>`;
                syncButton.disabled = false;
                syncButton.classList.remove('text-green-600', 'bg-green-50');
            }
            if (syncHeaderButton) {
                syncHeaderButton.innerHTML = `<i class="ri-refresh-line"></i><span>Sync Now</span>`;
                syncHeaderButton.disabled = false;
                syncHeaderButton.classList.remove('bg-green-600');
                syncHeaderButton.classList.add('bg-indigo-600');
            }
        }, 2000);

    } catch (error) {
        console.error('Sync failed:', error);
        displayAlertToast('Failed to sync data. Please try again.', 'error');
        
        // Reset buttons to error state
        if (syncButton) {
            syncButton.innerHTML = `<i class="ri-error-warning-line"></i><span>Sync Failed</span>`;
            syncButton.disabled = false;
            syncButton.classList.add('text-red-600', 'bg-red-50');
        }
        if (syncHeaderButton) {
            syncHeaderButton.innerHTML = `<i class="ri-error-warning-line"></i><span>Sync Failed</span>`;
            syncHeaderButton.disabled = false;
            syncHeaderButton.classList.add('bg-red-600');
        }
    }
}

// Add event listeners for sync buttons when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const syncButton = document.querySelector('[data-action="sync"]');
    const syncHeaderButton = document.querySelector('#sync-header-button');
    
    if (syncButton) {
        syncButton.addEventListener('click', (e) => {
            e.preventDefault();
            syncData();
        });
    }
    
    if (syncHeaderButton) {
        syncHeaderButton.addEventListener('click', (e) => {
            e.preventDefault();
            syncData();
        });
    }
});

socket.on("connect", () => {
    console.log("✅ Connected to backend socket:", socket.id);
});
socket.on("disconnect", () => {
    console.warn("⚠️ Socket disconnected");
});

// When backend notifies assignments changed
socket.on('assignments-updated', () => {
  try { loadAssignments(); updateStats(); } catch (e) { }
});
socket.on('update', (payload) => {
  if (payload && payload.type === 'assignments') {
    try { loadAssignments(); updateStats(); } catch (e) {}
  }
});

// When backend emits a real-time alert
socket.on("alert", (alert) => {
  console.log("📢 Received alert:", alert);
  displayAlertToast(alert.message);
  prependAlertToList(alert);
    // update dashboard numbers
    try { updateStats(); } catch (e) {}
});

// When backend emits a new announcement
socket.on("announcement", (announcement) => {
  console.log("📢 Received announcement:", announcement);
  if (announcement.type === "assignment") {
    displayAlertToast("📝 New Assignment Deadline: " + announcement.title);
  }
  loadAnnouncements(); // Refresh announcements list
    // update dashboard numbers
    try { updateStats(); } catch (e) {}
});

// --- DOM Helpers ---
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

// --- Load Assignments from backend and render ---
async function loadAssignments() {
  try {
    const res = await fetch(`${BACKEND_BASE}/assignments`);
    const assignments = await res.json();

    const container = $("#assignments-container");
    if (!container) return; // Not on assignments page

    container.innerHTML = "";
    if (!assignments || assignments.length === 0) {
      container.innerHTML = `<div class="empty p-3 text-muted">No assignments yet.</div>`;
      return;
    }

    assignments.forEach((a, idx) => {
      const item = document.createElement("div");
      item.className = "dashboard-card assignment-item";

      const aid = a.id || a.externalId || `idx-${idx}`;
      const resolvedAttachment = (url => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('/uploads')) return `${BACKEND_BASE}${url}`;
        return url;
      })(a.attachmentUrl || a.fileUrl || a.attachment || null);

      // Normalize submission URL (support both old `submissionUrl` and `submission.url`)
      const resolvedSubmission = (url => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('/uploads')) return `${BACKEND_BASE}${url}`;
        return url;
      })((a.submissionUrl || (a.submission && a.submission.url) || null));

      const isCompleted = (a.status || '').toLowerCase() === 'completed' || (a.status || '').toLowerCase() === 'done';

      let viewButtonHtml = '';
      let deleteButtonHtml = '';
      if (resolvedAttachment) {
        // Only allow delete UI for files served from our backend uploads
        const isLocalUpload = resolvedAttachment.startsWith(`${BACKEND_BASE}/uploads`) || resolvedAttachment.includes('/uploads/');
        const filename = (function(){ try { const url = new URL(resolvedAttachment); return url.pathname.split('/').pop(); } catch(e){ return resolvedAttachment.split('/').pop(); } })();
        viewButtonHtml = `<button class="view-btn" data-url="${escapeHtml(resolvedAttachment)}"><i class="ri-eye-line"></i> View</button>`;
        if (isLocalUpload) {
          deleteButtonHtml = `<button class="delete-btn" data-filename="${escapeHtml(filename)}"><i class="ri-delete-bin-line"></i> Delete</button>`;
        }
      }

      const submissionHtml = isCompleted ?
        resolvedSubmission ? 
          `<a href="${escapeHtml(resolvedSubmission)}" target="_blank" class="view-btn"><i class="ri-file-text-line"></i> View Submission</a>` 
          : ''
        :
        `<div class="upload-area">
          <input type="file" id="submit-file-${aid}" accept="application/pdf,image/*" class="file-input" />
          <button class="submit-btn" data-id="${escapeHtml(aid)}"><i class="ri-upload-2-line"></i> Submit</button>
        </div>`;

      item.className = 'dashboard-card assignment-item';
      const deadlineDate = new Date(a.deadline || a.dueDate);
      const isLate = deadlineDate < new Date();
      const statusClass = isCompleted ? 'status-completed' : (isLate ? 'status-late' : 'status-pending');
      
      item.innerHTML = `
        <div class="assignment-header">
          <h3>${escapeHtml(a.title)}</h3>
          <span class="status-badge ${statusClass}">${escapeHtml(a.status || "Pending")}</span>
        </div>
        <div class="assignment-details">
          <div class="deadline">
            <i class="ri-time-line"></i> Due ${deadlineDate.toLocaleDateString()} ${deadlineDate.toLocaleTimeString()}
          </div>
          <div class="assignment-actions">
            ${viewButtonHtml}
            ${deleteButtonHtml}
            ${submissionHtml}
          </div>
        </div>
      `;

      container.appendChild(item);

      // Attach view handler
      if (resolvedAttachment) {
        const vb = item.querySelector('.view-btn');
        if (vb) vb.addEventListener('click', (e) => {
          const url = vb.getAttribute('data-url');
          window.open(url, '_blank');
        });
      }

      // Attach delete handler for attachments (if present)
      const db = item.querySelector('.delete-btn');
      if (db) {
        db.addEventListener('click', async (e) => {
          const filename = db.getAttribute('data-filename');
          if (!confirm('Delete this uploaded file? This cannot be undone.')) return;
          try {
            db.disabled = true;
            db.textContent = 'Deleting...';
            const delRes = await fetch(`${BACKEND_BASE}/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
            const result = await delRes.json();
            if (!delRes.ok) {
              alert('Delete failed: ' + (result && result.error ? result.error : JSON.stringify(result)));
              db.disabled = false;
              db.textContent = 'Delete file';
              return;
            }
            await loadAssignments();
            try { await updateStats(); } catch (e) {}
            displayAlertToast('File deleted');
          } catch (err) {
            console.error('Delete error', err);
            alert('Delete failed: ' + String(err && err.message ? err.message : err));
            db.disabled = false;
            db.textContent = 'Delete file';
          }
        });
      }

      // Attach submit handler
      const sb = item.querySelector('.submit-btn');
      if (sb) {
        sb.addEventListener('click', async (e) => {
          const id = sb.getAttribute('data-id');
          const input = document.getElementById(`submit-file-${id}`);
          if (!input || !input.files || input.files.length === 0) {
            alert('Please choose a PDF or image file to submit.');
            return;
          }
          const file = input.files[0];
          try {
            sb.disabled = true;
            sb.textContent = 'Submitting...';
            const form = new FormData();
            form.append('submission', file, file.name);
            const submitRes = await fetch(`${BACKEND_BASE}/assignments/${encodeURIComponent(id)}/submit`, {
              method: 'POST',
              body: form
            });
            const result = await submitRes.json();
            if (!submitRes.ok) {
              alert('Submission failed: ' + (result && result.error ? result.error : JSON.stringify(result)));
              sb.disabled = false;
              sb.textContent = 'Submit';
              return;
            }
            // refresh assignments and stats
            await loadAssignments();
            try { await updateStats(); } catch (e) {}
            displayAlertToast('Submission uploaded and marked completed');
          } catch (err) {
            console.error('Submission error', err);
            alert('Submission failed: ' + String(err && err.message ? err.message : err));
            sb.disabled = false;
            sb.textContent = 'Submit';
          }
        });
      }

    });

  } catch (err) {
    console.error("❌ Failed to load assignments:", err);
    const container = $("#assignments-container");
    if (container) container.innerHTML = `<div class="alert alert-danger">Failed to load assignments.</div>`;
  }
}

// --- Update dashboard stats (assignments / alerts / announcements) ---
async function updateStats() {
  try {
    // Fetch counts in parallel
    const [aRes, alertsRes, annsRes] = await Promise.all([
      fetch(`${BACKEND_BASE}/assignments`),
      fetch(`${BACKEND_BASE}/alerts`),
      fetch(`${BACKEND_BASE}/api/announcements`)
    ]);

    const assignments = await aRes.json();
    const alerts = await alertsRes.json();
    const announcements = await annsRes.json();

    const cards = Array.from(document.querySelectorAll('.dashboard-card'));
    // Expect first card = assignments, second = alerts, third = announcements
    if (cards.length >= 3) {
      const assignH3 = cards[0].querySelector('h3');
      const alertsH3 = cards[1].querySelector('h3');
      const annsH3 = cards[2].querySelector('h3');

      if (assignH3) assignH3.textContent = String(Array.isArray(assignments) ? assignments.length : 0);
      if (alertsH3) alertsH3.textContent = String(Array.isArray(alerts) ? alerts.length : 0);
      if (annsH3) annsH3.textContent = String(Array.isArray(announcements) ? announcements.length : 0);
    }
  } catch (err) {
    console.warn('Could not update dashboard stats:', err);
  }
}

// --- Load Alerts from backend and render into alerts-list ---
async function loadAlerts() {
  try {
    const res = await fetch(`${BACKEND_BASE}/alerts`);
    const alerts = await res.json();

    const list = $("#alerts-list");
    if (!list) return;

    list.innerHTML = "";
    if (!alerts || alerts.length === 0) {
      list.innerHTML = `<div class="empty p-3 text-muted">No alerts yet.</div>`;
      return;
    }

    alerts.forEach(prependAlertToList); // prepend in order
  } catch (err) {
    console.error("❌ Failed to load alerts:", err);
    const list = $("#alerts-list");
    if (list) list.innerHTML = `<div class="alert alert-danger">Failed to load alerts.</div>`;
  }
}

// --- Prepend a single alert to the alerts list DOM ---
function prependAlertToList(alert) {
  const list = $("#alerts-list");
  if (!list) return;
  const el = document.createElement("div");
  el.className = "alert-card p-3 mb-2";
  el.innerHTML = `
    <div><strong>🔔 ${escapeHtml(alert.message || "")}</strong></div>
    <div class="text-muted" style="font-size:12px;">${new Date(alert.timestamp || Date.now()).toLocaleString()}</div>
  `;
  list.prepend(el);
}

// --- Display Bootstrap-like toast (simple) ---
function displayAlertToast(message) {
  const container = document.getElementById("toastContainer") || createToastContainer();
  const t = document.createElement("div");
  t.className = "toast-simple";
  t.innerHTML = `<div class="toast-body">🔔 ${escapeHtml(message)}</div>`;
  container.appendChild(t);
  // animate in
  t.style.opacity = 0;
  t.style.transform = "translateY(-10px)";
  requestAnimationFrame(()=> {
    t.style.transition = "all 240ms ease";
    t.style.opacity = 1;
    t.style.transform = "translateY(0)";
  });
  // remove after 4s
  setTimeout(()=> {
    t.style.opacity = 0;
    t.style.transform = "translateY(-10px)";
    setTimeout(()=> t.remove(), 300);
  }, 4000);
}

function createToastContainer(){
  const container = document.createElement("div");
  container.id = "toastContainer";
  container.style.position = "fixed";
  container.style.top = "12px";
  container.style.right = "12px";
  container.style.zIndex = 2000;
  document.body.appendChild(container);
  return container;
}

// --- Load Alerts from backend and render ---
async function loadAlerts() {
  try {
    const res = await fetch(`${BACKEND_BASE}/alerts`);
    const alerts = await res.json();
    
    const container = $("#alerts-list");
    if (!container) return; // Not on alerts page
    
    container.innerHTML = "";
    if (!alerts || alerts.length === 0) {
      container.innerHTML = `<div class="empty p-3 text-muted">No alerts yet.</div>`;
      return;
    }

    alerts.forEach(alert => {
      const alertElement = document.createElement("div");
      alertElement.className = "bg-white p-4 rounded-lg shadow-md border-l-4 border-red-500";
      alertElement.innerHTML = `
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <p class="text-gray-800">${escapeHtml(alert.message)}</p>
            <p class="text-sm text-gray-500 mt-1">${new Date(alert.timestamp).toLocaleString()}</p>
          </div>
        </div>
      `;
      container.appendChild(alertElement);
    });
  } catch (err) {
    console.error("❌ Error loading alerts:", err);
  }
}

// --- Send manual alert (POST to /alerts) ---
async function sendManualAlert(message) {
  try {
    const res = await fetch(`${BACKEND_BASE}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    console.log("POST /alerts ->", data);
    await loadAlerts(); // Reload alerts after sending
    return data;
  } catch (err) {
    console.error("❌ Error sending manual alert:", err);
  }
}

// --- Sync external assignments route ---
async function syncExternal() {
  try {
    const res = await fetch(`${BACKEND_BASE}/sync-external`);
    const data = await res.json();
    console.log("Sync result:", data);
    // refresh UI
    await loadAssignments();
    await loadAlerts();
    displayAlertToast("Sync complete");
  } catch (err) {
    console.error("❌ Sync failed:", err);
    displayAlertToast("Sync failed");
  }
}

// --- UI wiring (nav links / buttons) ---
function attachUiHandlers() {
  // Alerts nav link
  const alertsNav = document.querySelector('[data-action="nav-alerts"]');
  if (alertsNav) {
    alertsNav.addEventListener("click", (e)=> {
      e.preventDefault();
      // show main content area and focus alerts (if you have multiple views adapt accordingly)
      const alertsList = document.getElementById("alerts-list");
      if (alertsList) {
        window.scrollTo({ top: alertsList.offsetTop - 80, behavior: "smooth" });
      }
    });
  }

  // Sync nav link/button
  const syncBtn = document.querySelector('[data-action="sync"]');
  if (syncBtn) {
    syncBtn.addEventListener("click", (e)=> {
      e.preventDefault();
      syncExternal();
    });
  }

  // Optional: test manual alert button
  const testBtn = document.getElementById("cf-test-alert");
  if (testBtn) {
    testBtn.addEventListener("click", ()=> {
      sendManualAlert("Manual test alert from UI");
    });
  }
}

// --- Utility ---
function escapeHtml(s){ return String(s||"")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// --- Load and render announcements ---
async function loadAnnouncements() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/announcements`);
    const announcements = await res.json();

    const container = $("#announcements-container");
    if (!container) return; // Not on announcements page

    container.innerHTML = "";
    if (!announcements || announcements.length === 0) {
      container.innerHTML = `<div class="empty p-3 text-muted">No announcements yet.</div>`;
      return;
    }

    // Sort announcements by timestamp, newest first
    announcements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    announcements.forEach(announcement => {
      const card = document.createElement("div");
      card.className = "bg-white shadow-sm rounded-lg mb-4 p-4 border-l-4 border-indigo-500";
      
      // Use different icons based on announcement type
      let icon = "📢"; // default
      if (announcement.type === "assignment") {
        icon = "📝"; // assignment deadline
      } else if (announcement.type === "exam") {
        icon = "📚"; // exam
      }
      
      card.innerHTML = `
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-800">${icon} ${escapeHtml(announcement.title)}</h3>
            <p class="text-gray-600 mt-1">${escapeHtml(announcement.message)}</p>
            <p class="text-sm text-gray-500 mt-2">${new Date(announcement.timestamp).toLocaleString()}</p>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("❌ Error loading announcements:", err);
  }
}

// --- Initialize when DOM ready ---
document.addEventListener("DOMContentLoaded", async ()=> {
  attachUiHandlers();
  // load initial data and stats
  await loadAssignments();
  await loadAlerts();
  await loadAnnouncements();
  try { await updateStats(); } catch (e) {}
});
