import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);

// Настраиваем Socket.IO с CORS
const io = new Server(server, {
  cors: {
    origin: "https://your-frontend-url.com", // <-- сюда URL фронтенда
    methods: ["GET", "POST"]
  }
});

// Логика комнат
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, user, create }) => {
    if (!rooms[roomId] && !create) {
      socket.emit('room-error', { message: 'Комната не существует' });
      return;
    }

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);

    socket.emit('join-confirmed', {
      existingUsers: rooms[roomId].filter(id => id !== socket.id),
      userId: socket.id
    });

    socket.to(roomId).emit('user-joined', { userId: socket.id });

    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id });
      if (rooms[roomId].length === 0) delete rooms[roomId];
    });
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
