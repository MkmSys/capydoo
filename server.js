const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, user }) => {
    socket.join(roomId);

    // Подтверждение пользователю
    socket.emit('join-confirmed', { roomId, userId: socket.id });

    // Уведомление остальных участников
    socket.to(roomId).emit('user-joined', { user, userId: socket.id });
  });

  socket.on('signal', ({ to, data }) => io.to(to).emit('signal', { from: socket.id, data }));
  socket.on('chat-message', ({ roomId, text }) => io.to(roomId).emit('chat-message', { text }));

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

server.listen(process.env.PORT || 4000, () => console.log('Server running'));
