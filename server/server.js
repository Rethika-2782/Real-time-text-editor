const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

let text = ""; // shared text
let users = 0; // online users

io.on("connection", (socket) => {
  console.log("User connected");

  users++;
  io.emit("users", users);

  socket.emit("load-document", text);

  // Listen for text changes
  socket.on("text-change", (data) => {
    text = data;
    socket.broadcast.emit("text-change", data);
  });

  // Listen for cursor movements
  socket.on("cursor-change", (cursor) => {
    socket.broadcast.emit("cursor-change", { id: socket.id, position: cursor });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
    users--;
    io.emit("users", users);
    socket.broadcast.emit("cursor-remove", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on port " + PORT));
