require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Document, User, connectDB } = require('./db');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
});

// ─── In-memory fallback (no DB) ───────────────────────────────
const inMemoryDocs = {};
const inMemoryUsers = {};

// ─── OT Helper: apply delta ops ──────────────────────────────
// Simple last-write-wins with version tracking (upgrade to full OT if needed)
function applyOperation(doc, delta) {
  // For Quill deltas, the server merges by keeping full delta from client
  // A production system would use quill-delta compose/transform here
  return delta;
}

// ─── Auth Routes ──────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const hashed = await bcrypt.hash(password, 10);

    try {
      const user = new User({ username, password: hashed, color });
      await user.save();
      const token = jwt.sign({ id: user._id, username, color }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, username, color });
    } catch (dbErr) {
      // In-memory fallback
      if (inMemoryUsers[username])
        return res.status(409).json({ error: 'Username already taken' });
      const id = uuidv4();
      inMemoryUsers[username] = { id, username, password: hashed, color };
      const token = jwt.sign({ id, username, color }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, username, color });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = null;
    let color = '#3498db';

    try {
      user = await User.findOne({ username });
    } catch (_) {
      user = inMemoryUsers[username];
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    color = user.color || color;
    const token = jwt.sign(
      { id: user._id || user.id, username, color },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username, color });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Document REST Routes ─────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/documents', authMiddleware, async (req, res) => {
  try {
    let docs;
    try {
      docs = await Document.find({}, '_id title createdBy updatedAt').sort({ updatedAt: -1 });
    } catch (_) {
      docs = Object.values(inMemoryDocs).map(({ _id, title, createdBy, updatedAt }) => ({
        _id, title, createdBy, updatedAt,
      }));
    }
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', authMiddleware, async (req, res) => {
  const id = uuidv4();
  const doc = { _id: id, title: req.body.title || 'Untitled', content: { ops: [] }, revisions: [], createdBy: req.user.username, updatedAt: new Date() };
  try {
    await new Document(doc).save();
  } catch (_) {
    inMemoryDocs[id] = doc;
  }
  res.json(doc);
});

app.get('/api/documents/:id/revisions', authMiddleware, async (req, res) => {
  try {
    let doc;
    try {
      doc = await Document.findById(req.params.id, 'revisions title');
    } catch (_) {
      doc = inMemoryDocs[req.params.id];
    }
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc.revisions || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.io ────────────────────────────────────────────────
// rooms: { docId -> { content, version, users: { socketId -> { username, color, cursor } } } }
const rooms = {};

function getOrCreateRoom(docId) {
  if (!rooms[docId]) rooms[docId] = { content: { ops: [] }, version: 0, users: {} };
  return rooms[docId];
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 ${socket.user.username} connected`);
  let currentDocId = null;

  // ── Join document ──
  socket.on('join-document', async (docId) => {
    if (currentDocId) {
      socket.leave(currentDocId);
      const prevRoom = rooms[currentDocId];
      if (prevRoom) {
        delete prevRoom.users[socket.id];
        io.to(currentDocId).emit('user-list', Object.values(prevRoom.users));
      }
    }

    currentDocId = docId;
    socket.join(docId);
    const room = getOrCreateRoom(docId);
    room.users[socket.id] = {
      socketId: socket.id,
      username: socket.user.username,
      color: socket.user.color,
      cursor: null,
    };

    // Load doc content from DB
    let content = room.content;
    try {
      const doc = await Document.findById(docId);
      if (doc) {
        content = doc.content;
        room.content = content;
      }
    } catch (_) {
      if (inMemoryDocs[docId]) content = inMemoryDocs[docId].content;
    }

    socket.emit('load-document', { content, version: room.version });
    io.to(docId).emit('user-list', Object.values(room.users));
    console.log(`📄 ${socket.user.username} joined doc ${docId}`);
  });

  // ── Receive text delta (OT) ──
  socket.on('send-changes', ({ docId, delta, version }) => {
    const room = rooms[docId];
    if (!room) return;

    // Simple version-based conflict detection
    // If client version matches server, accept. Otherwise, transform (last-write-wins here).
    room.version += 1;
    room.content = applyOperation(room.content, delta);

    // Broadcast to all OTHER clients
    socket.to(docId).emit('receive-changes', { delta, version: room.version, author: socket.user.username });

    // Persist debounced (every 3s)
    clearTimeout(room.saveTimeout);
    room.saveTimeout = setTimeout(() => saveDocument(docId, room), 3000);
  });

  // ── Cursor position ──
  socket.on('cursor-move', ({ docId, range }) => {
    const room = rooms[docId];
    if (!room || !room.users[socket.id]) return;
    room.users[socket.id].cursor = range;
    socket.to(docId).emit('cursor-update', {
      socketId: socket.id,
      username: socket.user.username,
      color: socket.user.color,
      range,
    });
  });

  // ── Save revision manually ──
  socket.on('save-revision', async ({ docId }) => {
    const room = rooms[docId];
    if (!room) return;
    await saveDocument(docId, room, socket.user.username, true);
    socket.emit('revision-saved', { savedAt: new Date() });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    if (currentDocId && rooms[currentDocId]) {
      delete rooms[currentDocId].users[socket.id];
      io.to(currentDocId).emit('user-list', Object.values(rooms[currentDocId].users));
    }
    console.log(`🔌 ${socket.user.username} disconnected`);
  });
});

// ─── Save document to DB ──────────────────────────────────────
async function saveDocument(docId, room, savedBy = 'autosave', createRevision = false) {
  try {
    const update = {
      content: room.content,
      updatedAt: new Date(),
    };
    if (createRevision) {
      update.$push = { revisions: { content: room.content, savedBy, savedAt: new Date() } };
    }
    await Document.findByIdAndUpdate(docId, update, { upsert: true });
  } catch (_) {
    if (inMemoryDocs[docId]) {
      inMemoryDocs[docId].content = room.content;
      inMemoryDocs[docId].updatedAt = new Date();
    }
  }
}

// ─── Start ────────────────────────────────────────────────────
connectDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
