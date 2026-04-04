const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: { origin: "*" },
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

// Serve frontend (IMPORTANT for single deploy)
app.use(express.static(path.join(__dirname, "client", "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

// Render dynamic port
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
