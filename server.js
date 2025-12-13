const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

class VideoMeetServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.meetings = new Map();
        this.users = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
    }
    
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // ОБЯЗАТЕЛЬНО правильный путь к папке public
        const publicPath = path.join(__dirname, 'public');
        console.log('Путь к public папке:', publicPath);
        
        // Раздаем статические файлы
        this.app.use(express.static(publicPath));
        
        // Дополнительно для скриптов Socket.io
        this.app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));
    }
    
    setupRoutes() {
        // API для создания встречи
        this.app.post('/api/meetings', (req, res) => {
            try {
                const { hostId, hostName } = req.body;
                const meetingId = this.generateMeetingId();
                
                const meeting = {
                    id: meetingId,
                    hostId: hostId,
                    hostName: hostName,
                    participants: new Map(),
                    createdAt: new Date(),
                    settings: {
                        allowVideo: true,
                        allowAudio: true,
                        allowScreenShare: true,
                        allowChat: true,
                        maxParticipants: 100
                    }
                };
                
                this.meetings.set(meetingId, meeting);
                
                console.log(`✅ Создана новая встреча: ${meetingId} хостом ${hostName}`);
                
                res.json({
                    success: true,
                    meetingId: meetingId,
                    message: 'Встреча создана'
                });
            } catch (error) {
                console.error('❌ Ошибка создания встречи:', error);
                res.status(500).json({
                    success: false,
                    message: 'Внутренняя ошибка сервера'
                });
            }
        });
        
        // API для получения информации о встрече
        this.app.get('/api/meetings/:meetingId', (req, res) => {
            try {
                const meetingId = req.params.meetingId.toUpperCase();
                const meeting = this.meetings.get(meetingId);
                
                if (meeting) {
                    res.json({
                        success: true,
                        meetingId: meeting.id,
                        hostName: meeting.hostName,
                        participantCount: meeting.participants.size,
                        createdAt: meeting.createdAt,
                        settings: meeting.settings
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Встреча не найдена'
                    });
                }
            } catch (error) {
                console.error('❌ Ошибка получения встречи:', error);
                res.status(500).json({
                    success: false,
                    message: 'Внутренняя ошибка сервера'
                });
            }
        });
        
        // API для получения списка участников
        this.app.get('/api/meetings/:meetingId/participants', (req, res) => {
            try {
                const meetingId = req.params.meetingId.toUpperCase();
                const meeting = this.meetings.get(meetingId);
                
                if (meeting) {
                    const participants = Array.from(meeting.participants.values()).map(p => ({
                        id: p.id,
                        name: p.name,
                        isHost: p.isHost,
                        joinedAt: p.joinedAt
                    }));
                    
                    res.json({
                        success: true,
                        participants: participants
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Встреча не найдена'
                    });
                }
            } catch (error) {
                console.error('❌ Ошибка получения участников:', error);
                res.status(500).json({
                    success: false,
                    message: 'Внутренняя ошибка сервера'
                });
            }
        });
        
        // API для завершения встречи
        this.app.delete('/api/meetings/:meetingId', (req, res) => {
            try {
                const meetingId = req.params.meetingId.toUpperCase();
                const meeting = this.meetings.get(meetingId);
                
                if (meeting) {
                    // Уведомляем всех участников
                    meeting.participants.forEach((user, socketId) => {
                        const socket = this.io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('meeting-ended', {
                                meetingId: meetingId,
                                reason: 'Владелец завершил встречу'
                            });
                            socket.leave(meetingId);
                        }
                    });
                    
                    this.meetings.delete(meetingId);
                    console.log(`✅ Встреча завершена: ${meetingId}`);
                    
                    res.json({
                        success: true,
                        message: 'Встреча завершена'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Встреча не найдена'
                    });
                }
            } catch (error) {
                console.error('❌ Ошибка завершения встречи:', error);
                res.status(500).json({
                    success: false,
                    message: 'Внутренняя ошибка сервера'
                });
            }
        });
        
        // ВСЕ остальные маршруты отдают index.html (для SPA)
        this.app.get('*', (req, res) => {
            const indexPath = path.join(__dirname, 'public', 'index.html');
            console.log('Запрос к:', req.url, '→ отдаем:', indexPath);
            res.sendFile(indexPath);
        });
    }
    
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('🔌 Новое подключение:', socket.id);
            
            // Создание встречи
            socket.on('create-meeting', (data) => {
                const { meetingId, user } = data;
                
                let meeting = this.meetings.get(meetingId);
                
                if (!meeting) {
                    meeting = {
                        id: meetingId,
                        hostId: user.id,
                        hostName: user.name,
                        participants: new Map(),
                        createdAt: new Date(),
                        settings: {
                            allowVideo: true,
                            allowAudio: true,
                            allowScreenShare: true,
                            allowChat: true,
                            maxParticipants: 100
                        }
                    };
                    this.meetings.set(meetingId, meeting);
                }
                
                // Добавляем пользователя
                const userData = {
                    ...user,
                    socketId: socket.id,
                    joinedAt: new Date()
                };
                
                meeting.participants.set(socket.id, userData);
                this.users.set(socket.id, {
                    userId: user.id,
                    meetingId: meetingId,
                    userData: userData
                });
                
                socket.join(meetingId);
                
                // Отправляем подтверждение
                socket.emit('meeting-created', {
                    meetingId: meetingId,
                    user: userData
                });
                
                console.log(`✅ Пользователь ${user.name} создал встречу ${meetingId}`);
            });
            
            // Присоединение к встрече
            socket.on('join-meeting', (data) => {
                const { meetingId, user } = data;
                const meeting = this.meetings.get(meetingId);
                
                if (!meeting) {
                    socket.emit('error', { message: 'Встреча не найдена' });
                    return;
                }
                
                // Проверяем лимит участников
                if (meeting.participants.size >= meeting.settings.maxParticipants) {
                    socket.emit('error', { message: 'Встреча переполнена' });
                    return;
                }
                
                // Добавляем пользователя
                const userData = {
                    ...user,
                    socketId: socket.id,
                    joinedAt: new Date()
                };
                
                meeting.participants.set(socket.id, userData);
                this.users.set(socket.id, {
                    userId: user.id,
                    meetingId: meetingId,
                    userData: userData
                });
                
                socket.join(meetingId);
                
                // Уведомляем всех участников о новом пользователе
                socket.to(meetingId).emit('user-joined', {
                    user: userData
                });
                
                // Отправляем новому пользователю список участников
                const participants = Array.from(meeting.participants.values())
                    .filter(p => p.socketId !== socket.id)
                    .map(p => ({
                        id: p.id,
                        name: p.name,
                        isHost: p.isHost
                    }));
                
                socket.emit('participants-list', participants);
                
                console.log(`✅ Пользователь ${user.name} присоединился к ${meetingId}`);
            });
            
            // Сообщения чата
            socket.on('chat-message', (data) => {
                const { meetingId, message, timestamp } = data;
                const userInfo = this.users.get(socket.id);
                
                if (userInfo && userInfo.userData) {
                    socket.to(meetingId).emit('chat-message', {
                        user: userInfo.userData.name,
                        message: message,
                        timestamp: timestamp || new Date().toLocaleTimeString()
                    });
                }
            });
            
            // WebRTC сигналы
            socket.on('offer', (data) => {
                const { meetingId, targetUserId, offer } = data;
                const targetUser = this.findUserByUserId(targetUserId, meetingId);
                
                if (targetUser) {
                    socket.to(targetUser.socketId).emit('offer', {
                        senderId: this.users.get(socket.id)?.userId,
                        offer: offer
                    });
                }
            });
            
            socket.on('answer', (data) => {
                const { meetingId, targetUserId, answer } = data;
                const targetUser = this.findUserByUserId(targetUserId, meetingId);
                
                if (targetUser) {
                    socket.to(targetUser.socketId).emit('answer', {
                        senderId: this.users.get(socket.id)?.userId,
                        answer: answer
                    });
                }
            });
            
            socket.on('ice-candidate', (data) => {
                const { meetingId, targetUserId, candidate } = data;
                const targetUser = this.findUserByUserId(targetUserId, meetingId);
                
                if (targetUser) {
                    socket.to(targetUser.socketId).emit('ice-candidate', {
                        senderId: this.users.get(socket.id)?.userId,
                        candidate: candidate
                    });
                }
            });
            
            // Пользователь готов к медиа
            socket.on('media-ready', (data) => {
                const { meetingId } = data;
                socket.to(meetingId).emit('user-media-ready', {
                    userId: this.users.get(socket.id)?.userId
                });
            });
            
            // Выход из встречи
            socket.on('leave-meeting', (data) => {
                this.handleUserLeave(socket, data);
            });
            
            // Отключение
            socket.on('disconnect', () => {
                this.handleUserLeave(socket);
                console.log('🔌 Пользователь отключился:', socket.id);
            });
        });
    }
    
    findUserByUserId(userId, meetingId) {
        for (const [socketId, userInfo] of this.users.entries()) {
            if (userInfo.userId === userId && userInfo.meetingId === meetingId) {
                const meeting = this.meetings.get(meetingId);
                if (meeting) {
                    return meeting.participants.get(socketId);
                }
            }
        }
        return null;
    }
    
    handleUserLeave(socket, data = {}) {
        const userInfo = this.users.get(socket.id);
        
        if (userInfo) {
            const { meetingId, userId } = userInfo;
            const meeting = this.meetings.get(meetingId);
            
            if (meeting) {
                // Удаляем пользователя из встречи
                meeting.participants.delete(socket.id);
                
                // Если хост вышел, завершаем встречу
                if (meeting.hostId === userId) {
                    // Уведомляем всех участников
                    meeting.participants.forEach((user, socketId) => {
                        const userSocket = this.io.sockets.sockets.get(socketId);
                        if (userSocket) {
                            userSocket.emit('meeting-ended', {
                                meetingId: meetingId,
                                reason: 'Владелец покинул встречу'
                            });
                            userSocket.leave(meetingId);
                        }
                    });
                    
                    this.meetings.delete(meetingId);
                    console.log(`✅ Встреча завершена хостом: ${meetingId}`);
                } else {
                    // Уведомляем остальных участников
                    socket.to(meetingId).emit('user-left', {
                        userId: userId
                    });
                    
                    console.log(`✅ Пользователь ${userId} покинул встречу ${meetingId}`);
                }
            }
            
            // Удаляем пользователя из общей карты
            this.users.delete(socket.id);
        }
    }
    
    generateMeetingId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        
        for (let i = 0; i < 8; i++) {
            if (i === 4) result += '-';
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return result;
    }
    
    start(port = process.env.PORT || 3000) {
        this.server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`🌐 Откройте http://localhost:${port}`);
            console.log(`📁 Путь к public: ${path.join(__dirname, 'public')}`);
        });
    }
}

// Запуск сервера
const server = new VideoMeetServer();
server.start();
