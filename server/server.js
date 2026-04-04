// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

const app = express();

// Allow all origins for testing (update in prod)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// Serve React frontend
app.use(express.static(path.join(__dirname, "../client/build")));

const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
});

// In-memory storage
let text = "";
let users = 0;

// Socket connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Update user count
  users++;
  io.emit("users", users);

  // Send existing document to the new user
  socket.emit("load-document", text);

  // Text sync
  socket.on("text-change", (data) => {
    text = data;
    socket.broadcast.emit("text-change", data);
  });

  // Cursor sync
  socket.on("cursor-change", (cursor) => {
    socket.broadcast.emit("cursor-change", {
      id: socket.id,
      position: cursor,
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    users--;
    io.emit("users", users);
    socket.broadcast.emit("cursor-remove", socket.id);
  });
});

// SPA fallback route (Express 5 safe)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

// Use Render’s dynamic port or fallback
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
