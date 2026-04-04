// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();

// CORS - allow your frontend URL
app.use(cors({
  origin: "https://real-time-text-editor-2.onrender.com", // <-- replace with your Render frontend URL
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "https://real-time-text-editor-2.onrender.com", // frontend URL
    methods: ["GET", "POST"]
  },
});

// In-memory storage
let text = "";
let users = 0;

// Socket connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  users++;
  io.emit("users", users);

  // Send existing text
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

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    users--;
    io.emit("users", users);
    socket.broadcast.emit("cursor-remove", socket.id);
  });
});

// Serve frontend build
app.use(express.static(path.join(__dirname, "../client/build")));

// Single-page app route
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

// Use Render’s dynamic port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
