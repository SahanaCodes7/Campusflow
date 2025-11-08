const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // frontend files

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, "public", "uploads"))
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function(req, file, cb) {
    // Accept only PDFs and common image formats
    if (file.mimetype === 'application/pdf' || 
        file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files and images are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const DATA_FILE = path.join(__dirname, "externalData.json");

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 🗂 Ensure file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ assignments: [] }, null, 2));
}

// 🟢 Get all assignments (used by your frontend and CampusFlow)
app.get("/assignments", (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  res.json(data.assignments);
});

// 🟢 Get assignments for CampusFlow sync
app.get("/external-assignments", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    // Add source field to identify assignments from ExternalApp
    const assignmentsWithSource = data.assignments.map(assignment => ({
      ...assignment,
      source: 'external',
      externalId: assignment.id || crypto.randomUUID(),
      status: assignment.status || "Pending"
    }));
    console.log('📤 Sending assignments to CampusFlow:', assignmentsWithSource.length);
    res.json(assignmentsWithSource);
  } catch (err) {
    console.error('❌ Error reading assignments:', err);
    res.status(500).json({ error: 'Failed to read assignments' });
  }
});

// 🟡 Add new assignment
app.post("/add", async (req, res) => {
  try {
    const { title, deadline, description, attachmentUrl } = req.body;
    if (!title || !deadline) {
      return res.status(400).json({ error: "Missing required fields", details: "Title and deadline are required" });
    }

    // Parse data file
    let data;
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch (err) {
      console.error('❌ Error reading data file:', err);
      return res.status(500).json({ error: "Failed to read assignments data" });
    }
    
    // Validate file URL if provided
    if (attachmentUrl && !attachmentUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: "Invalid attachment URL" });
    }

    const newItem = {
      title: title.trim(),
      deadline: new Date(deadline).toISOString(),
      status: "Pending",
      description: description ? description.trim() : "",
      attachmentUrl: attachmentUrl || null
    };

    // Add metadata
    const assignmentWithMeta = {
      ...newItem,
      id: crypto.randomUUID(),
      source: 'external',
      externalId: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };

    // Update data file
    try {
      data.assignments.push(assignmentWithMeta);
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('❌ Error saving data:', err);
      return res.status(500).json({ error: "Failed to save assignment" });
    }

    // Notify CampusFlow
    try {
      const syncResponse = await axios.post('http://localhost:3000/sync-external-assignment', assignmentWithMeta, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000 // 5 second timeout
      });
      console.log('✅ Successfully synced with CampusFlow:', syncResponse.data);
    } catch (err) {
      console.error('❌ Failed to sync with CampusFlow:', err.message);
      // Don't fail the request, but include sync status in response
      return res.json({ 
        message: "Assignment added but sync failed",
        syncError: err.message,
        assignment: assignmentWithMeta 
      });
    }

    return res.json({
      message: "✅ Assignment added and synced successfully!",
      assignment: assignmentWithMeta
    });
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return res.status(500).json({
      error: "Server error while processing assignment",
      details: err.message
    });
  }

  // Notify CampusFlow about the new assignment
  try {
    await axios.post('http://localhost:3000/sync-external-assignment', assignmentWithMeta, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Successfully notified CampusFlow about new assignment');
  } catch (err) {
    console.error('❌ Failed to notify CampusFlow:', err.message);
    // Don't fail the request if sync fails, just log it
  }

  res.json({ message: "✅ Assignment added successfully!", assignment: assignmentWithMeta });
});

// 🏠 Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// POST /upload - handle file uploads using multer
app.post('/upload', upload.single('pdf'), (req, res) => {
  try {
    // Check if file was provided
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please select a PDF or image file to upload'
      });
    }

    // Validate file size (redundant with multer but good for clarity)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      // Clean up the oversized file
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Failed to delete oversized file:', e);
      }
      return res.status(400).json({
        error: 'File too large',
        details: 'Maximum file size is 10MB'
      });
    }

    // Validate file type again (redundant with multer but good for clarity)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Clean up the invalid file
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Failed to delete invalid file:', e);
      }
      return res.status(400).json({
        error: 'Invalid file type',
        details: 'Only PDF files and common image formats (JPEG, PNG, GIF) are allowed'
      });
    }

    console.log('📥 File uploaded successfully:', {
      filename: req.file.filename,
      size: `${(req.file.size / 1024).toFixed(2)}KB`,
      type: req.file.mimetype
    });

    // Return the public URL and file info
    const publicUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      type: req.file.mimetype
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    // Clean up any partially uploaded file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Failed to delete failed upload:', e);
      }
    }
    res.status(500).json({ 
      error: 'Upload failed', 
      details: err.message 
    });
  }
});

// 🚀 Start server
app.listen(4000, () => {
  console.log("🌐 ExternalApp running on http://localhost:4000");
});
