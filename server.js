/**
 * FULL Google Meet–like signaling server
 * Works with:
 *  - Socket.IO
 *  - Lobby (waiting room)
 *  - Rooms
 *  - Vite frontend build (client/dist)
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

/* =========================
   SOCKET.IO
========================= */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* =========================
   ROOMS STATE
========================= */
/*
rooms = {
  roomId: {
    host: socketId,
    users: Set(socketId),
    lobby: Set(socketId)
  }
}
*/
const rooms = {};

/* =========================
   SOCKET LOGIC
========================= */
io.on("connection", socket => {
  console.log("🔌 Connected:", socket.id);

  socket.on("join-room", ({ roomId, host }) => {
    socket.roomId = roomId;
    socket.isHost = !!host;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: null,
        users: new Set(),
        lobby: new Set()
      };
    }

    // HOST
    if (socket.isHost) {
      rooms[roomId].host = socket.id;
      rooms[roomId].users.add(socket.id);
      socket.join(roomId);

      console.log("👑 Host joined:", roomId);
      return;
    }

    // USER -> LOBBY
    rooms[roomId].lobby.add(socket.id);
    console.log("⏳ User waiting:", socket.id);

    io.to(rooms[roomId].host).emit("lobby-update", {
      waiting: Array.from(rooms[roomId].lobby)
    });
  });

  /* ===== HOST APPROVES USER ===== */
  socket.on("approve-user", userId => {
    const room = rooms[socket.roomId];
    if (!room || socket.id !== room.host) return;

    if (room.lobby.has(userId)) {
      room.lobby.delete(userId);
      room.users.add(userId);

      io.to(userId).emit("approved");
      io.sockets.sockets.get(userId)?.join(socket.roomId);

      socket.to(socket.roomId).emit("user-joined", userId);
      console.log("✅ Approved:", userId);
    }
  });

  /* ===== WEBRTC SIGNALING ===== */
  socket.on("signal", ({ to, desc, candidate }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      desc,
      candidate
    });
  });

  /* ===== REACTIONS ===== */
  socket.on("reaction", emoji => {
    socket.to(socket.roomId).emit("reaction", {
      from: socket.id,
      emoji
    });
  });

  /* ===== DISCONNECT ===== */
  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].users.delete(socket.id);
    rooms[roomId].lobby.delete(socket.id);

    if (rooms[roomId].host === socket.id) {
      console.log("❌ Host left, closing room:", roomId);
      delete rooms[roomId];
      socket.to(roomId).emit("room-closed");
      return;
    }

    socket.to(roomId).emit("user-left", socket.id);
    console.log("🔴 Disconnected:", socket.id);
  });
});

/* =========================
   FRONTEND (VITE BUILD)
========================= */
const CLIENT_DIST = path.join(__dirname, "client", "dist");

app.use(express.static(CLIENT_DIST));

app.get("*", (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

/* =========================
   START SERVER (RAILWAY)
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
