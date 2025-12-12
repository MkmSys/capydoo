import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);

// ==== CORS ====
const io = new Server(server, {
  cors: {
    origin: "*", // <-- можно заменить на URL фронтенда
    methods: ["GET", "POST"]
  }
});

// ==== Комнаты ====
const rooms = {}; // { roomId: [socketId1, socketId2, ...] }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Пользователь пытается войти или создать комнату
  socket.on('join-room', ({ roomId, user, create }) => {
    if (!rooms[roomId] && !create) {
      socket.emit('room-error', { message: 'Комната не существует' });
      return;
    }

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);

    // Подтверждение входа и список существующих пользователей
    socket.emit('join-confirmed', {
      existingUsers: rooms[roomId].filter(id => id !== socket.id),
      userId: socket.id
    });

    // Уведомляем остальных участников
    socket.to(roomId).emit('user-joined', { userId: socket.id });

    // Отключение пользователя
    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id });
      if (rooms[roomId].length === 0) delete rooms[roomId];
      console.log('User disconnected:', socket.id);
    });
  });

  // Сигналы WebRTC
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Простой чат (если нужен)
  socket.on('chat-message', ({ roomId, text }) => {
    io.to(roomId).emit('chat-message', { text, from: socket.id });
  });
});

// Простая проверка сервера
app.get('/', (req, res) => {
  res.send('Meet-clone backend is running');
});

// ==== Запуск сервера ====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
