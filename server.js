const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist/index.html"));
});

// Rooms storage
const rooms = {};

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("join-room", roomId => {
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);

    // Отправляем текущих пользователей
    const otherUsers = rooms[roomId].filter(id => id !== socket.id);
    socket.emit("all-users", otherUsers);

    // Сообщаем другим, что новый пользователь подключился
    socket.to(roomId).emit("user-joined", socket.id);

    // Сохраняем roomId у сокета
    socket.roomId = roomId;
  });

  socket.on("offer", payload => {
    io.to(payload.to).emit("offer", { from: socket.id, offer: payload.offer });
  });

  socket.on("answer", payload => {
    io.to(payload.to).emit("answer", { from: socket.id, answer: payload.answer });
  });

  socket.on("ice-candidate", payload => {
    io.to(payload.to).emit("ice-candidate", { from: socket.id, candidate: payload.candidate });
  });

  // Чат
  socket.on("chat-message", message => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit("chat-message", message);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit("user-left", socket.id);
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));
