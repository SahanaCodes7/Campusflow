// ===== CampusFlow Backend with Alerts + Socket.IO (Robust & Dev-friendly) =====

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require('crypto');

const app = express();

// Helper function to deduplicate alerts
function cleanupAlerts(alerts) {
  if (!Array.isArray(alerts)) {
    return [];
  }
  
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Remove duplicates and old alerts
  const seen = new Set();
  return alerts.filter(alert => {
    if (!alert || !alert.timestamp) return false;
    const alertTime = new Date(alert.timestamp);
    
    // Remove alerts older than 24 hours
    if (alertTime < dayAgo) return false;
    
    // Deduplicate based on message and type
    const key = `${alert.type || 'general'}-${alert.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    
    return true;
  });
};

// ------------- Dev CORS (allow all origins for local testing) -------------
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false
}));

app.use(express.json());

// Serve frontend static files (so you can open pages via http://localhost:3000)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  console.log('✅ Serving frontend from', FRONTEND_DIR);
}

// Serve uploaded attachments from backend (so CampusFlow can host files centrally)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer for handling submission uploads
const multer = require('multer');
const submissionStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.pdf';
    const base = `submission-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    cb(null, base);
  }
});

// multer instance for submission uploads (defined before route usage)
const submissionUpload = multer({
  storage: submissionStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only PDF or image files allowed'));
  }
});

// ✅ Submit assignment (upload file) and mark as completed
app.post('/assignments/:id/submit', submissionUpload.single('submission'), (req, res) => {
  try {
    const id = req.params.id;
    const data = loadData();
    const assignment = (data.assignments || []).find(a => a.id === id || a.externalId === id);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No submission file provided' });
    }

    const publicUrl = `/uploads/${req.file.filename}`;
    assignment.submission = assignment.submission || {};
    assignment.submission.url = publicUrl;
    assignment.submission.filename = req.file.filename;
    assignment.submission.size = req.file.size;
    assignment.submission.submittedAt = new Date().toISOString();
    assignment.status = 'Completed';

    if (!saveData(data)) {
      return res.status(500).json({ error: 'Failed to save submission' });
    }

    // Notify clients
    io.emit('assignments-updated');
    io.emit('alert', { id: crypto.randomUUID(), type: 'info', message: `Assignment submitted: ${assignment.title}`, timestamp: new Date().toISOString() });

    return res.json({ message: 'Submission received', submissionUrl: publicUrl, assignment });
  } catch (err) {
    console.error('❌ Error handling submission:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Server error', details: String(err && err.message ? err.message : err) });
  }
});

// ------------- Global error logging for development -------------
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason);
});

// ---------- HTTP + SOCKET.IO SERVER ----------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ---------- Data file location and config ----------
const DATA_FILE = path.join(__dirname, "data.json");
const COLLEGE_CONNECT_URL = "http://127.0.0.1:7000";  // CollegeConnect base URL

// ---------- Helper Functions ----------
function cleanupAlerts(alerts) {
  if (!Array.isArray(alerts)) {
    return [];
  }
  
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Remove duplicates and old alerts
  const seen = new Set();
  return alerts.filter(alert => {
    if (!alert || !alert.timestamp) return false;
    const alertTime = new Date(alert.timestamp);
    
    // Remove alerts older than 24 hours
    if (alertTime < dayAgo) return false;
    
    // Deduplicate based on message and type
    const key = `${alert.type}-${alert.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    
    return true;
  });
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { assignments: [], alerts: [], announcements: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const obj = JSON.parse(raw);
  // Ensure expected arrays exist to avoid runtime errors when writing
  obj.assignments = obj.assignments || [];
  obj.alerts = obj.alerts || [];
    obj.announcements = obj.announcements || [];
  return obj;
  } catch (err) {
    console.error("❌ loadData() failed:", err);
      return { assignments: [], alerts: [], announcements: [] };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("❌ saveData() failed:", err);
    return false;
  }
}

async function syncWithCollegeConnect(data) {
  if (!data) return false;
  
  try {
    console.log("🔄 Starting sync with CollegeConnect...");
    
    // Initialize arrays if they don't exist
    data.alerts = data.alerts || [];
    data.announcements = data.announcements || [];
    
    // Configure axios defaults for this function
    const axiosInstance = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // First, get updates from CollegeConnect
    const getResponse = await axiosInstance.get(`${COLLEGE_CONNECT_URL}/updates`);
    console.log("📥 Received updates from CollegeConnect:", getResponse.data);
    
    const updates = Array.isArray(getResponse.data) ? getResponse.data : [];
    let newUpdatesCount = 0;
    
    // Clean up old alerts first
    data.alerts = cleanupAlerts(data.alerts || []);
      
    // Track seen updates to prevent duplicates within this sync
    const seenUpdates = new Set();
    
    for (const update of updates) {
      const updateKey = `${update.type}-${update.title}-${update.content}`.toLowerCase();
      
      // Skip if we've seen this update in this sync batch
      if (seenUpdates.has(updateKey)) continue;
      seenUpdates.add(updateKey);
      
      const timestamp = new Date(update.datetime).toISOString();
        
        // Create alert object
      const alert = {
        id: `cc-${update.id}`, // Add source identifier
        title: update.type,
        message: `${update.title}: ${update.content}`,
        timestamp: timestamp,
        type: update.type.toLowerCase(),
        source: 'collegeconnect'
      };

      // Check for duplicate announcements using exact content match
      const announcementKey = `${update.title.toLowerCase()}-${update.content.toLowerCase()}`;
      const isDuplicateAnnouncement = data.announcements.some(ann => 
        `${ann.title.toLowerCase()}-${ann.message.toLowerCase()}` === announcementKey
      );

      // Create announcement object if it's not a duplicate
      const announcement = !isDuplicateAnnouncement ? {
        id: `cc-${update.id}`,
        title: update.title,
        message: update.content,
        timestamp: timestamp,
        type: update.type.toLowerCase(),
        source: 'collegeconnect'
      } : null;
        if (!data.announcements) data.announcements = [];

      // Check if we already have this alert
      const alertKey = `${alert.type}-${alert.message}`.toLowerCase();
      const alertExists = data.alerts.some(a => 
        `${a.type}-${a.message}`.toLowerCase() === alertKey
      );

      // Add new alert if it's unique
      if (!alertExists) {
        console.log("➕ Adding new alert:", alert.title);
        data.alerts.push(alert);
        // Clean up alerts after adding new one
        data.alerts = cleanupAlerts(data.alerts);
        io.emit("alert", alert);
        newUpdatesCount++;
      }

      // Add new announcement if it's not a duplicate
      if (announcement) {
        console.log("➕ Adding new announcement:", announcement.title);
        data.announcements.push(announcement);
        io.emit("announcement", announcement);
        newUpdatesCount++;
      }
      }

      // Save only if we have new updates
      if (newUpdatesCount > 0) {
        console.log(`💾 Saving ${newUpdatesCount} new updates`);
        const saved = saveData(data);
        if (!saved) {
          console.error("❌ Failed to save data");
          return false;
        }
      }

    // Save changes if we have any new updates
    if (newUpdatesCount > 0) {
      console.log(`💾 Saving ${newUpdatesCount} new updates`);
      if (!saveData(data)) {
        console.error("❌ Failed to save sync data");
        return false;
      }
    }

    // Prepare outgoing updates
    const outgoingUpdates = data.announcements
      .filter(a => !a.source || a.source !== 'collegeconnect')
      .map(a => ({
        title: a.title,
        type: a.type || "General",
        datetime: a.timestamp,
        content: a.message || ""
      }));

    // Send updates back to CollegeConnect if we have any
    if (outgoingUpdates.length > 0) {
      console.log("📤 Sending updates to CollegeConnect:", outgoingUpdates);
      await axiosInstance.post(
        `${COLLEGE_CONNECT_URL}/add-update`,
        { updates: outgoingUpdates }
      );
    }

    console.log("✅ Sync completed successfully");
    return true;
    
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    }
    return false;
  }

}

/* Consolidated loadData/saveData are defined earlier to avoid duplication. */

// ---------- ROUTES ----------

// Health-check (optional)
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Get all data (alerts and announcements)
app.get("/api/data", (req, res) => {
  try {
    const data = loadData();
    return res.json({
      alerts: data.alerts || [],
      announcements: data.announcements || []
    });
  } catch (err) {
    console.error("❌ GET /api/data error:", err);
    return res.status(500).json({ error: "Failed to read data" });
  }
});

// Sync endpoint
app.post("/sync", async (req, res) => {
  try {
    const data = loadData();
    
    // Sync with CollegeConnect
    await syncWithCollegeConnect(data);
    
    // Broadcast a sync event to all connected clients
    io.emit("sync-complete", { timestamp: new Date().toISOString() });
    
    return res.json({
      status: "success",
      message: "Sync completed successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ POST /sync error:", err);
    return res.status(500).json({
      error: "Failed to sync",
      details: err.message
    });
  }
});

// ✅ Get all assignments
app.get("/assignments", (req, res) => {
  try {
    const data = loadData();
    return res.json(data.assignments || []);
  } catch (err) {
    console.error("❌ GET /assignments error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Failed to read assignments", details: String(err && err.message ? err.message : err) });
  }
});

// ✅ Add a new assignment (and send alert)
app.post("/assignments", async (req, res) => {
  try {
    const { title, description, deadline } = req.body;
    if (!title || !deadline) {
      return res.status(400).json({ error: "Title and deadline are required." });
    }

    const data = loadData();
    const newAssignment = { 
      id: crypto.randomUUID(),
      title, 
      description: description || "",
      deadline: deadline,
      status: "Pending",
      createdAt: new Date().toISOString()
    };

    // ensure assignments array exists
    data.assignments = data.assignments || [];
    data.assignments.push(newAssignment);

    // Create announcement for the new assignment
    const announcement = {
      title: `Assignment Due: ${title}`,
      message: `Assignment \"${title}\" is due on ${new Date(deadline).toLocaleString()}. ${description || ''}`.trim(),
      timestamp: new Date().toISOString(),
      type: "assignment",
      deadline: deadline // Store the actual deadline for sorting/filtering
    };
    
    if (!data.announcements) {
      data.announcements = [];
    }
    data.announcements.push(announcement);

      // Create and add alert for the new assignment
      if (!data.alerts) {
        data.alerts = [];
      }
      
      // Clean up existing alerts
      data.alerts = cleanupAlerts(data.alerts);
      
      const alertMessage = `📝 New Assignment Added: ${title} (due ${new Date(deadline).toLocaleString()})`;
      const alert = {
        id: crypto.randomUUID(),
        title: "New Assignment",
        message: alertMessage,
        timestamp: new Date().toISOString(),
        type: "assignment"
      };
      
      if (!data.alerts) {
        data.alerts = [];
      }
      
      // Check for existing similar alerts
      const existingAlert = data.alerts.find(a => 
        a.type === "assignment" && 
        a.message === alertMessage
      );
      
      // Add the alert to the list
      data.alerts.push(alert);
      data.alerts = cleanupAlerts(data.alerts);    // Save all changes
    const ok = saveData(data);
    if (!ok) {
      return res.status(500).json({ 
        error: "Failed to persist data", 
        assignment: newAssignment
      });
    }

    // Sync with CollegeConnect
    await syncWithCollegeConnect(data);

    // Broadcast notifications
    io.emit("announcement", announcement);
    io.emit("alert", alert);

    return res.json({
      status: "success",
      message: "Assignment added successfully",
      assignment: newAssignment,
      alert
    });
  } catch (err) {
    console.error("❌ POST /assignments error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", details: String(err && err.message ? err.message : err) });
  }
});

// (Duplicate submission route removed - consolidated earlier in file)

// ✅ Get all alerts
app.get("/alerts", (req, res) => {
  try {
    const data = loadData();
    return res.json(data.alerts || []);
  } catch (err) {
    console.error("❌ GET /alerts error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Failed to read alerts", details: String(err && err.message ? err.message : err) });
  }
});

// Securely delete a file from uploads and remove references in data.json
app.delete('/uploads/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Remove file
    fs.unlinkSync(filePath);

    // Remove references from assignments (attachmentUrl, submission.url or submissionUrl)
    const data = loadData();
    let changed = false;
    (data.assignments || []).forEach(a => {
      if (a.attachmentUrl && a.attachmentUrl.includes(`/uploads/${filename}`)) {
        delete a.attachmentUrl;
        changed = true;
      }
      if (a.submission && a.submission.url && a.submission.url.includes(`/uploads/${filename}`)) {
        delete a.submission;
        a.status = a.status || 'Pending';
        changed = true;
      }
      if (a.submissionUrl && a.submissionUrl.includes(`/uploads/${filename}`)) {
        delete a.submissionUrl;
        a.status = a.status || 'Pending';
        changed = true;
      }
    });
    if (changed) saveData(data);

    // Notify clients
    io.emit('assignments-updated');
    io.emit('alert', { id: crypto.randomUUID(), type: 'info', message: `File deleted: ${filename}`, timestamp: new Date().toISOString() });

    return res.json({ message: 'File deleted' });
  } catch (err) {
    console.error('❌ Error deleting file:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Failed to delete file', details: String(err && err.message ? err.message : err) });
  }
});

// ✅ Get all announcements
app.get("/api/announcements", (req, res) => {
  try {
    const data = loadData();
    let announcements = data.announcements || [];

    // Remove any duplicate announcements
    const uniqueAnnouncements = new Map();
    announcements.forEach(ann => {
      const key = `${ann.type || 'general'}::${ann.title}::${ann.message}`;
      const existing = uniqueAnnouncements.get(key);
      if (!existing || new Date(ann.timestamp) > new Date(existing.timestamp)) {
        uniqueAnnouncements.set(key, ann);
      }
    });

    // Convert back to array and sort by timestamp
    announcements = Array.from(uniqueAnnouncements.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Save the deduplicated announcements back
    data.announcements = announcements;
    saveData(data);

    return res.json(announcements);
  } catch (err) {
    console.error("❌ GET /api/announcements error:", err);
    return res.status(500).json({ error: "Failed to read announcements" });
  }
});

// ✅ Add a new alert manually (robust with detailed logs)
app.post("/alerts", async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message required." });
    }

    const data = loadData();
    const alert = { 
      title: title || "General Alert",
      message, 
      timestamp: new Date().toISOString() 
    };

    data.alerts.push(alert);
    const ok = saveData(data);
    if (!ok) {
      io.emit("alert", alert); // best-effort broadcast
      return res.status(500).json({ 
        error: "Failed to persist alert", 
        alert 
      });
    }

    // Sync with CollegeConnect
    await syncWithCollegeConnect(data);

    // Broadcast live
    io.emit("alert", alert);

    return res.json({ 
      status: "success",
      message: "Alert sent successfully!", 
      alert 
    });
  } catch (err) {
    console.error("❌ Error inside POST /alerts:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", details: String(err && err.message ? err.message : err) });
  }
});

// ✅ Sync assignments from ExternalApp (port 4000)
app.get("/sync-external", async (req, res) => {
  try {
    console.log('🔄 Starting sync with ExternalApp...');
    const response = await axios.get("http://localhost:4000/external-assignments");
    const externalAssignments = response.data;

    if (!Array.isArray(externalAssignments)) {
      console.error("❌ /sync-external: externalAssignments is not an array", externalAssignments);
      return res.status(502).json({ error: "Invalid data from external app", details: "expected array" });
    }

    console.log(`📥 Received ${externalAssignments.length} assignments from ExternalApp`);
    const data = loadData();
    let added = 0;
    let updated = 0;

    // First, mark all existing external assignments for cleanup
    data.assignments.forEach(a => {
      if (a.source === 'external') {
        a._shouldRemove = true;
      }
    });

    // Process all external assignments
    for (const ext of externalAssignments) {
      // Ensure required fields
      ext.source = 'external';
      ext.externalId = ext.externalId || crypto.randomUUID();
      ext.id = ext.id || crypto.randomUUID();

      // Look for existing assignment
      const existing = data.assignments.find(a => 
        (ext.externalId && a.externalId === ext.externalId) || 
        (!ext.externalId && a.title === ext.title)
      );

      if (existing) {
        // Update existing assignment
        Object.assign(existing, ext);
        existing._shouldRemove = false; // Keep this one
        updated++;
      } else {
        // Add new assignment
        data.assignments.push(ext);
        added++;

        // Check if we already have an alert for this assignment
        const existingAlert = (data.alerts || []).find(a => 
          a.type === 'info' && 
          a.message.includes(ext.title) && 
          a.message.includes('New assignment synced')
        );

        if (!existingAlert) {
          // Create alert for new assignment
          const alert = {
            id: crypto.randomUUID(),
            type: 'sync',
            message: `📢 New assignment synced: ${ext.title}`,
            timestamp: new Date().toISOString()
          };
          if (!data.alerts) data.alerts = [];
          // Clean up alerts before adding new one
          data.alerts = cleanupAlerts([...data.alerts, alert]);
          io.emit("alert", alert);
        }

        // Create announcement for new assignment
        const due = ext.deadline || ext.dueDate || null;
        const ann = {
          id: crypto.randomUUID(),
          title: `New External Assignment`,
          message: due ? `Assignment "${ext.title}" is due on ${new Date(due).toLocaleString()}.` : `Assignment "${ext.title}" was added via sync.`,
          timestamp: new Date().toISOString()
        };
        if (!data.announcements) data.announcements = [];
        data.announcements.push(ann);
        io.emit("announcement", ann);
      }

      // If external assignment includes an attachmentUrl, try to fetch it
      if (ext.attachmentUrl) {
        try {
          // Build source URL (ExternalApp serves uploads at http://localhost:4000)
          const sourceUrl = ext.attachmentUrl.startsWith('http') ? ext.attachmentUrl : `http://localhost:4000${ext.attachmentUrl}`;
          const fileRes = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
          const extName = path.extname(ext.attachmentUrl) || '.bin';
          const baseName = `ext-${Date.now()}-${Math.random().toString(36).slice(2,8)}${extName}`;
          const savePath = path.join(UPLOADS_DIR, baseName);
          fs.writeFileSync(savePath, fileRes.data);
          // Update the attachmentUrl to point to CampusFlow-hosted file
          ext.attachmentUrl = `/uploads/${baseName}`;
          console.log(`🔁 Copied external attachment to ${savePath}`);
        } catch (e) {
          console.warn('⚠️ Failed to copy external attachment', ext.attachmentUrl, e && e.message ? e.message : e);
          // leave ext.attachmentUrl as-is (will be external link)
        }
      }
    }

    // Remove any external assignments that weren't updated
    data.assignments = data.assignments.filter(a => !a._shouldRemove);

    // Save changes
    const ok = saveData(data);
    if (!ok) {
      return res.status(500).json({ error: "Failed to save data" });
    }

    console.log(`✅ Sync complete: Added ${added}, Updated ${updated}, Total: ${data.assignments.length}`);
    io.emit('assignments-updated');
    
    return res.json({ 
      success: true,
      added,
      updated,
      total: data.assignments.length
    });
  } catch (err) {
    console.error("❌ Error syncing with ExternalApp:", err && err.stack ? err.stack : err);
    const details = err.response ? { status: err.response.status, data: err.response.data } : err.message || String(err);
    return res.status(500).json({ error: "Failed to sync with ExternalApp", details });
  }
});


// ✅ Handle individual assignment sync from ExternalApp
app.post("/sync-external-assignment", async (req, res) => {
  try {
    const ext = req.body;

    if (!ext || !ext.title || !ext.deadline) {
      return res.status(400).json({ error: "Missing required fields: title and deadline" });
    }

    const data = loadData();

    // Check by externalId first, then fallback to title
    const existing = ext.externalId 
      ? data.assignments.find(a => a.externalId === ext.externalId)
      : data.assignments.find(a => a.title === ext.title);

    if (!existing) {
      ext.source = 'external'; // Mark as from ExternalApp

      // If external assignment includes an attachmentUrl, try to fetch it
      if (ext.attachmentUrl) {
        try {
          // Build source URL (ExternalApp serves uploads at http://localhost:4000)
          const sourceUrl = ext.attachmentUrl.startsWith('http') ? ext.attachmentUrl : `http://localhost:4000${ext.attachmentUrl}`;
          const fileRes = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
          const extName = path.extname(ext.attachmentUrl) || '.bin';
          const baseName = `ext-${Date.now()}-${Math.random().toString(36).slice(2,8)}${extName}`;
          const savePath = path.join(UPLOADS_DIR, baseName);
          fs.writeFileSync(savePath, fileRes.data);
          // Update the attachmentUrl to point to CampusFlow-hosted file
          ext.attachmentUrl = `/uploads/${baseName}`;
          console.log(`🔁 Copied external attachment to ${savePath}`);
        } catch (e) {
          console.warn('⚠️ Failed to copy external attachment', ext.attachmentUrl, e && e.message ? e.message : e);
          // leave ext.attachmentUrl as-is (will be external link)
        }
      }

      data.assignments.push(ext);

      // Create alert for new assignment
      const alert = {
        id: crypto.randomUUID(),
        type: 'info',
        message: `📢 New external assignment: ${ext.title}`,
        timestamp: new Date().toISOString()
      };
      
      if (!data.alerts.some(a => a.message === alert.message)) {
        data.alerts.push(alert);
        io.emit("alert", alert);
      }

      // Create announcement
      const ann = {
        id: crypto.randomUUID(),
        title: 'New External Assignment',
        message: `Assignment "${ext.title}" is due on ${new Date(ext.deadline).toLocaleString()}.`,
        timestamp: new Date().toISOString(),
        type: 'new_assignment'
      };
      
      if (!data.announcements) data.announcements = [];
      
      // Check for duplicates before adding
      if (!data.announcements.some(a => 
        a.type === 'new_assignment' && 
        a.message.includes(ext.title)
      )) {
        data.announcements.push(ann);
        io.emit("announcement", ann);
      }

      if (!saveData(data)) {
        return res.status(500).json({ error: "Failed to save assignment" });
      }

      io.emit("update", { type: "assignments" });
      console.log("✅ External assignment synced:", ext.title);
      return res.json({ message: "Assignment synced successfully", assignment: ext });
    } else {
      return res.json({ message: "Assignment already exists", assignment: existing });
    }
  } catch (err) {
    console.error("❌ Error syncing external assignment:", err && err.stack ? err.stack : err);
    const details = err.response ? { status: err.response.status, data: err.response.data } : err.message || String(err);
    return res.status(500).json({ error: "Failed to sync assignment", details });
  }
});

// ---------- SOCKET.IO EVENTS ----------
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("frontend_event", (data) => {
    console.log("💬 Received frontend_event:", data);
    // echo as 'note' to all clients (include socket id)
    io.emit("note", { from: socket.id, ...data });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ✅ Get all announcements
app.get("/api/announcements", (req, res) => {
  try {
    const data = loadData();
    if (!data.announcements) data.announcements = [];

    // Group announcements by type and content to eliminate duplicates
    const uniqueAnnouncements = new Map();
    
    data.announcements.forEach(ann => {
      // Create a signature that uniquely identifies similar announcements
      const key = ann.type === 'reminder' 
        ? `reminder::${ann.message.match(/"([^"]+)"/)?.[1] || ann.message}`
        : `${ann.type || 'general'}::${ann.title}::${ann.message}`;
        
      const existing = uniqueAnnouncements.get(key);
      // Keep only the most recent version of each announcement
      if (!existing || new Date(ann.timestamp) > new Date(existing.timestamp)) {
        uniqueAnnouncements.set(key, ann);
      }
    });
    
    // Convert to array and sort by timestamp
    const deduplicated = Array.from(uniqueAnnouncements.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json(deduplicated);
  } catch (err) {
    console.error("❌ GET /api/announcements error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Failed to read announcements", details: String(err && err.message ? err.message : err) });
  }
});

// ✅ Add a new announcement
app.post("/api/announcements", async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required." });
    }

    const data = loadData();
    const announcement = {
      id: crypto.randomUUID(),
      title,
      message,
      type: 'manual',
      timestamp: new Date().toISOString()
    };

    if (!data.announcements) {
      data.announcements = [];
    }

    // Check for duplicate announcements
    const isDuplicate = data.announcements.some(ann => 
      ann.title.toLowerCase() === title.toLowerCase() && 
      ann.message.toLowerCase() === message.toLowerCase()
    );

    if (isDuplicate) {
      return res.status(400).json({ 
        error: "Duplicate announcement", 
        message: "This announcement already exists" 
      });
    }

    data.announcements.push(announcement);

    const ok = saveData(data);
    if (!ok) {
      return res.status(500).json({ error: "Failed to save announcement" });
    }

    io.emit("announcement", announcement);
    return res.json({ success: true, announcement });
  } catch (err) {
    console.error("❌ Error in POST /api/announcements:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", details: String(err && err.message ? err.message : err) });
  }
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3000;
// Express error handler to catch Multer and other upload errors and keep server alive
app.use((err, req, res, next) => {
  if (!err) return next();
  // Multer errors (file too large, invalid file, etc.)
  if (err && err.name === 'MulterError') {
    console.error('Multer error:', err.message);
    // 413 Payload Too Large for size-related errors
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
    return res.status(400).json({ error: err.message || 'File upload error' });
  }
  console.error('Unhandled error in request:', err && err.stack ? err.stack : err);
  return res.status(500).json({ error: 'Server error', details: String(err && err.message ? err.message : err) });
});
server.listen(PORT, () => {
  console.log(`✅ CampusFlow Backend running on http://localhost:${PORT}`);
});

// ---------- Reminder Scheduler (runs in background) ----------
// Creates announcement reminders for assignments due within configurable windows (default: 24h and 1h).
// Configure via environment variable REMINDER_MINUTES (comma-separated minutes). E.g. REMINDER_MINUTES=1440,60
const REMINDER_MINUTES = [1440]; // Just one reminder at 24 hours before due date

function parseDateFlexible(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (!isNaN(dt.getTime())) return dt;
  // Try common ISO fallback
  try {
    return new Date(Date.parse(d));
  } catch (e) {
    return null;
  }
}

function runReminderSweep() {
  try {
    const data = loadData();
    const now = new Date();

    let changed = false;
    (data.assignments || []).forEach((a, idx) => {
      const dueStr = a.dueDate || a.deadline || a.deadlineDate || a.deadline;
      const due = parseDateFlexible(dueStr);
      if (!due) return;

      // Only send a reminder if the assignment is due within the next 24 hours
      const minutes = REMINDER_MINUTES[0]; // 1440 minutes (24 hours)
      const flag = '_reminderSent';
      if (!a[flag]) { // Haven't sent a reminder yet
        const windowEnd = new Date(now.getTime() + minutes * 60 * 1000);
        // if due is within next 24 hours (and after now)
        if (due > now && due <= windowEnd) {
          const dueDate = new Date(due);
          const ann = {
            id: crypto.randomUUID(),
            title: `24-Hour Reminder: ${a.title}`,
            message: `Assignment "${a.title}" is due on ${dueDate.toLocaleDateString()} at ${dueDate.toLocaleTimeString()}`,
            timestamp: new Date().toISOString(),
            type: 'reminder',
            assignmentId: a.id || a.title
          };
          data.announcements = data.announcements || [];
          // Remove any existing reminders for this assignment
          data.announcements = data.announcements.filter(x => 
            !(x.type === 'reminder' && x.assignmentId === ann.assignmentId)
          );
          // Add the new reminder
          data.announcements.push(ann);
          io.emit('announcement', ann);
          // Mark as reminded
          data.assignments[idx][flag] = true;
          changed = true;
        }
      }
    });

    if (changed) saveData(data);
  } catch (err) {
    console.error('❌ Reminder sweep failed:', err && err.stack ? err.stack : err);
  }
}

// Run every 1 minute to check for upcoming deadlines so short windows (e.g., 60m) are handled promptly.
setInterval(runReminderSweep, 60000);
// Run once at startup
setTimeout(runReminderSweep, 5000);

// ✅ Get all alerts
app.get("/alerts", (req, res) => {
  try {
    const data = loadData();
    return res.json(data.alerts || []);
  } catch (err) {
    console.error("❌ GET /alerts error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Failed to read alerts", details: String(err && err.message ? err.message : err) });
  }
});

// ✅ Create a new alert
app.post("/alerts", (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message required." });
    }

    const data = loadData();
    const alert = {
      message,
      timestamp: new Date().toISOString()
    };

    // Save
    data.alerts.push(alert);
    const ok = saveData(data);
    if (!ok) {
      io.emit("alert", alert); // best-effort broadcast
      return res.status(500).json({ error: "Failed to persist alert", alert });
    }

    // Broadcast live
    io.emit("alert", alert);

    // Return success JSON
    return res.json({ message: "Alert sent!", alert });
  } catch (err) {
    console.error("❌ Error inside POST /alerts:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Internal server error", details: String(err && err.message ? err.message : err) });
  }
});
