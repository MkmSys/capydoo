const rooms = {}; // { roomId: [socketId1, socketId2, ...] }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, user }) => {
    // Если комнаты нет — создаем
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // Добавляем пользователя
    rooms[roomId].push(socket.id);
    socket.join(roomId);

    // Подтверждаем пользователю
    socket.emit('join-confirmed', { roomId, userId: socket.id, existingUsers: rooms[roomId].filter(id => id !== socket.id) });

    // Уведомляем других участников
    socket.to(roomId).emit('user-joined', { user, userId: socket.id });

    // Убираем пользователя при disconnect
    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id });
      if (rooms[roomId].length === 0) delete rooms[roomId];
      console.log('User disconnected:', socket.id);
    });
  });

  socket.on('signal', ({ to, data }) => io.to(to).emit('signal', { from: socket.id, data }));
  socket.on('chat-message', ({ roomId, text }) => io.to(roomId).emit('chat-message', { text }));
});
