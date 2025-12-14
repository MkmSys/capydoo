
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Раздача статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// API для создания комнаты
app.get('/create-room', (req, res) => {
    const roomId = generateRoomId();
    res.json({ roomId: roomId });
});

// Все запросы на главную
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище комнат
const rooms = new Map();

// Socket.io
io.on('connection', (socket) => {
    console.log('👤 Новое подключение:', socket.id);

    // Присоединение к комнате
    socket.on('join-room', (data) => {
        const { roomId, userName } = data;
        
        console.log(`🔗 ${userName} присоединяется к ${roomId}`);
        
        // Создаем комнату если ее нет
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        const room = rooms.get(roomId);
        
        // Сохраняем пользователя
        room.set(socket.id, {
            id: socket.id,
            name: userName,
            joinedAt: new Date()
        });
        
        // Присоединяем сокет к комнате
        socket.join(roomId);
        
        // Отправляем подтверждение
        socket.emit('room-joined', {
            roomId: roomId,
            users: Array.from(room.values()).filter(u => u.id !== socket.id)
        });
        
        // Уведомляем других участников
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            userName: userName
        });
        
        console.log(`✅ ${userName} в комнате ${roomId}`);
    });

    // WebRTC сигналы
    socket.on('offer', (data) => {
        const { targetUserId, offer } = data;
        socket.to(targetUserId).emit('offer', {
            from: socket.id,
            offer: offer
        });
    });

    socket.on('answer', (data) => {
        const { targetUserId, answer } = data;
        socket.to(targetUserId).emit('answer', {
            from: socket.id,
            answer: answer
        });
    });

    socket.on('ice-candidate', (data) => {
        const { targetUserId, candidate } = data;
        socket.to(targetUserId).emit('ice-candidate', {
            from: socket.id,
            candidate: candidate
        });
    });

    // Отключение
    socket.on('disconnect', () => {
        console.log('👋 Отключение:', socket.id);
        
        // Удаляем из всех комнат
        for (const [roomId, room] of rooms.entries()) {
            if (room.has(socket.id)) {
                // Удаляем пользователя
                room.delete(socket.id);
                
                // Уведомляем других
                socket.to(roomId).emit('user-left', {
                    userId: socket.id
                });
                
                // Если комната пустая, удаляем ее
                if (room.size === 0) {
                    rooms.delete(roomId);
                    console.log(`🗑️ Комната ${roomId} удалена`);
                }
                
                console.log(`👤 Пользователь удален из ${roomId}`);
                break;
            }
        }
    });
});

// Генератор ID комнаты
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        if (i === 4) id += '-';
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Откройте http://localhost:${PORT}`);
});
