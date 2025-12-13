// ────────────── БАЗОВЫЕ ПОДКЛЮЧЕНИЯ ──────────────
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// ────────────── EXPRESS И HTTP ──────────────
const app = express();
const server = http.createServer(app);

// ────────────── SOCKET.IO ──────────────
const io = new Server(server, {
  cors: { origin: "*" } // разрешаем фронтенду соединяться
});

// ────────────── ROOMS ──────────────
/*
rooms = {
  roomId: {
    host: socketId,
    users: Set(socketId)
  }
}
*/
const rooms = {};

// ────────────── SOCKET EVENTS ──────────────
io.on("connection", socket => {
  console.log("🔌 Connected:", socket.id);

  socket.on("join-room", ({ roomId, host }) => {
    socket.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = { host: null, users: new Set() };
    }

    if (host) {
      rooms[roomId].host = socket.id;
    }

    rooms[roomId].users.add(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("signal", data => {
    io.to(data.to).emit("signal", { from: socket.id, ...data });
  });

  socket.on("reaction", emoji => {
    socket.to(socket.roomId).emit("reaction", {
      from: socket.id,
      emoji
    });
  });

  socket.on("disconnect", () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    room.users.delete(socket.id);
    socket.to(socket.roomId).emit("user-left", socket.id);

    if (room.users.size === 0) {
      delete rooms[socket.roomId];
    }
  });
});

// ────────────── SPA FRONTEND ──────────────
const CLIENT_DIST = path.join(__dirname, "client", "dist");
app.use(express.static(CLIENT_DIST));

app.get("*", (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

// ────────────── START SERVER ──────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
