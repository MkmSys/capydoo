// 🎬 Простой видеозвонок - РАБОЧАЯ ВЕРСИЯ

class SimpleVideoChat {
    constructor() {
        console.log('🚀 Инициализация SimpleVideoChat');
        
        this.socket = io();
        this.userId = this.generateUserId();
        this.userName = 'Участник';
        this.roomId = null;
        this.startTime = null;
        this.timerInterval = null;
        
        // WebRTC
        this.localStream = null;
        this.peers = new Map(); // userId -> peer connection
        this.remoteStreams = new Map();
        
        this.init();
    }
    
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    
    init() {
        console.log('🔧 Настройка приложения');
        this.setupEventListeners();
        this.setupSocketListeners();
    }
    
    setupEventListeners() {
        // Создание комнаты
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value || 'Участник';
            this.createRoom();
        });
        
        // Показать форму присоединения
        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            document.getElementById('joinForm').style.display = 'block';
        });
        
        // Присоединение к комнате
        document.getElementById('confirmJoinBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value || 'Участник';
            const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
            if (roomCode) {
                this.joinRoom(roomCode);
            } else {
                alert('Введите код комнаты');
            }
        });
        
        // Копирование ссылки
        document.getElementById('copyLinkBtn').addEventListener('click', () => {
            this.copyRoomLink();
        });
        
        // Управление медиа
        document.getElementById('toggleMicBtn').addEventListener('click', () => this.toggleMic());
        document.getElementById('toggleCamBtn').addEventListener('click', () => this.toggleCam());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        
        // Чат
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу:', this.socket.id);
        });
        
        this.socket.on('room-joined', (data) => {
            console.log('✅ Присоединились к комнате:', data.roomId);
            this.roomId = data.roomId;
            this.showRoomScreen();
            this.startMedia();
            
            // Подключаемся к существующим пользователям
            data.users.forEach(user => {
                this.createPeerConnection(user.id, true);
            });
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('👤 Новый участник:', data.userId);
            this.addChatMessage('Система', `Участник присоединился`);
            
            // Создаем соединение с новым пользователем
            this.createPeerConnection(data.userId, true);
        });
        
        this.socket.on('user-left', (data) => {
            console.log('👤 Участник вышел:', data.userId);
            this.removePeer(data.userId);
            this.addChatMessage('Система', `Участник вышел`);
        });
        
        // WebRTC сигналы
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
    }
    
    async createRoom() {
        try {
            console.log('📝 Создание комнаты...');
            
            const response = await fetch('/create-room');
            const data = await response.json();
            
            this.roomId = data.roomId;
            console.log('✅ Комната создана:', this.roomId);
            
            // Присоединяемся к комнате
            this.socket.emit('join-room', {
                roomId: this.roomId,
                userName: this.userName
            });
            
        } catch (error) {
            console.error('❌ Ошибка создания комнаты:', error);
            alert('Не удалось создать комнату');
        }
    }
    
    joinRoom(roomId) {
        console.log('🔗 Присоединение к комнате:', roomId);
        
        this.roomId = roomId;
        this.socket.emit('join-room', {
            roomId: roomId,
            userName: this.userName
        });
    }
    
    async startMedia() {
        console.log('🎥 Запрос доступа к медиа...');
        
        try {
            // Простой запрос - только самое необходимое
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: true
            });
            
            console.log('✅ Медиа получено');
            this.displayLocalVideo();
            
        } catch (error) {
            console.error('❌ Ошибка доступа к медиа:', error);
            this.addChatMessage('Система', 'Камера/микрофон недоступны');
            this.displayLocalPlaceholder();
        }
    }
    
    displayLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = 'local-video-container';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = this.localStream;
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.textContent = `${this.userName} (Вы)`;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        videoGrid.appendChild(videoContainer);
    }
    
    displayLocalPlaceholder() {
        const videoGrid = document.getElementById('videoGrid');
        
        const placeholder = document.createElement('div');
        placeholder.className = 'video-container';
        placeholder.style.background = '#1a73e8';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        
        placeholder.innerHTML = `
            <div style="text-align: center; color: white;">
                <div style="font-size: 48px; margin-bottom: 16px;">👤</div>
                <div style="font-weight: bold;">${this.userName}</div>
                <div style="font-size: 12px; opacity: 0.8;">Камера недоступна</div>
            </div>
        `;
        
        videoGrid.appendChild(placeholder);
    }
    
    createPeerConnection(targetUserId, isInitiator) {
        console.log(`🔗 Создание соединения с ${targetUserId}, инициатор: ${isInitiator}`);
        
        // Если соединение уже существует - пропускаем
        if (this.peers.has(targetUserId)) {
            console.log('⚠️ Соединение уже существует');
            return;
        }
        
        // Простая конфигурация STUN
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        const pc = new RTCPeerConnection(config);
        this.peers.set(targetUserId, pc);
        
        // Добавляем наши треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Получаем удаленный поток
        pc.ontrack = (event) => {
            console.log(`📹 Получен поток от ${targetUserId}`);
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                this.remoteStreams.set(targetUserId, stream);
                this.displayRemoteVideo(targetUserId, stream);
            }
        };
        
        // ICE кандидаты
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Создаем оффер если мы инициаторы
        if (isInitiator) {
            this.createOffer(pc, targetUserId);
        }
    }
    
    async createOffer(pc, targetUserId) {
        try {
            console.log(`📤 Создание оффера для ${targetUserId}`);
            
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                targetUserId: targetUserId,
                offer: pc.localDescription
            });
            
        } catch (error) {
            console.error(`❌ Ошибка создания оффера:`, error);
        }
    }
    
    async handleOffer(data) {
        console.log(`📥 Получен оффер от ${data.from}`);
        
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        this.peers.set(data.from, pc);
        
        // Добавляем наши треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Получаем удаленный поток
        pc.ontrack = (event) => {
            console.log(`📹 Получен поток от ${data.from}`);
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                this.remoteStreams.set(data.from, stream);
                this.displayRemoteVideo(data.from, stream);
            }
        };
        
        // ICE кандидаты
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetUserId: data.from,
                    candidate: event.candidate
                });
            }
        };
        
        try {
            // Устанавливаем удаленное описание
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // Создаем ответ
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Отправляем ответ
            this.socket.emit('answer', {
                targetUserId: data.from,
                answer: pc.localDescription
            });
            
        } catch (error) {
            console.error(`❌ Ошибка обработки оффера:`, error);
        }
    }
    
    async handleAnswer(data) {
        console.log(`📥 Получен ответ от ${data.from}`);
        
        const pc = this.peers.get(data.from);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (error) {
                console.error(`❌ Ошибка установки ответа:`, error);
            }
        }
    }
    
    async handleIceCandidate(data) {
        console.log(`🧊 Получен ICE кандидат от ${data.from}`);
        
        const pc = this.peers.get(data.from);
        if (pc && data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error(`❌ Ошибка добавления ICE:`, error);
            }
        }
    }
    
    displayRemoteVideo(userId, stream) {
        console.log(`➕ Отображение видео для ${userId}`);
        
        // Удаляем старый элемент
        const oldVideo = document.getElementById(`remote-${userId}`);
        if (oldVideo) oldVideo.remove();
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `remote-${userId}`;
        
        // Проверяем есть ли видео
        const hasVideo = stream.getVideoTracks().length > 0;
        
        if (hasVideo) {
            // Показываем видео
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.srcObject = stream;
            
            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            overlay.textContent = 'Участник';
            
            videoContainer.appendChild(video);
            videoContainer.appendChild(overlay);
            
        } else {
            // Заглушка если нет видео
            videoContainer.style.background = '#34a853';
            videoContainer.style.display = 'flex';
            videoContainer.style.alignItems = 'center';
            videoContainer.style.justifyContent = 'center';
            
            videoContainer.innerHTML = `
                <div style="text-align: center; color: white;">
                    <div style="font-size: 48px; margin-bottom: 16px;">👤</div>
                    <div style="font-weight: bold;">Участник</div>
                    <div style="font-size: 12px; opacity: 0.8;">
                        ${stream.getAudioTracks().length > 0 ? 'Только аудио' : 'Нет медиа'}
                    </div>
                </div>
            `;
        }
        
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.appendChild(videoContainer);
        }
    }
    
    removePeer(userId) {
        console.log(`➖ Удаление пира ${userId}`);
        
        // Закрываем соединение
        const pc = this.peers.get(userId);
        if (pc) {
            pc.close();
            this.peers.delete(userId);
        }
        
        // Удаляем поток
        this.remoteStreams.delete(userId);
        
        // Удаляем видео элемент
        const videoElement = document.getElementById(`remote-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }
    }
    
    showRoomScreen() {
        // Переключаем экраны
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('roomScreen').classList.add('active');
        
        // Обновляем информацию о комнате
        document.getElementById('currentRoomId').textContent = this.roomId;
        
        // Запускаем таймер
        this.startTimer();
        
        // Добавляем приветственное сообщение
        this.addChatMessage('Система', `Добро пожаловать в комнату ${this.roomId}`);
    }
    
    startTimer() {
        this.startTime = new Date();
        
        this.timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - this.startTime;
            
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // Обновляем счетчик участников
            this.updateParticipantCount();
            
        }, 1000);
    }
    
    updateParticipantCount() {
        const countElement = document.getElementById('participantCount');
        if (countElement) {
            // Считаем локальное видео + все удаленные видео
            const remoteCount = document.querySelectorAll('.video-container:not(#local-video-container)').length;
            const totalCount = 1 + remoteCount; // 1 для себя
            countElement.textContent = totalCount;
        }
    }
    
    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('toggleMicBtn');
                const icon = btn.querySelector('i');
                const text = btn.querySelector('span');
                
                if (audioTrack.enabled) {
                    icon.className = 'fas fa-microphone';
                    text.textContent = 'Выкл';
                    btn.classList.add('active');
                } else {
                    icon.className = 'fas fa-microphone-slash';
                    text.textContent = 'Вкл';
                    btn.classList.remove('active');
                }
            }
        }
    }
    
    toggleCam() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.getElementById('toggleCamBtn');
                const icon = btn.querySelector('i');
                const text = btn.querySelector('span');
                
                if (videoTrack.enabled) {
                    icon.className = 'fas fa-video';
                    text.textContent = 'Выкл';
                    btn.classList.add('active');
                } else {
                    icon.className = 'fas fa-video-slash';
                    text.textContent = 'Вкл';
                    btn.classList.remove('active');
                }
            }
        }
    }
    
    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                console.log('🖥️ Начало демонстрации экрана...');
                
                // Простой запрос на демонстрацию экрана
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true
                });
                
                console.log('✅ Демонстрация экрана начата');
                
                // Получаем видеотрек с экрана
                const screenTrack = this.screenStream.getVideoTracks()[0];
                
                // Обновляем локальное видео
                const localVideo = document.querySelector('#local-video-container video');
                if (localVideo && this.localStream) {
                    // Создаем новый поток с экраном
                    const newStream = new MediaStream();
                    newStream.addTrack(screenTrack);
                    
                    // Добавляем аудио если есть
                    const audioTrack = this.localStream.getAudioTracks()[0];
                    if (audioTrack) {
                        newStream.addTrack(audioTrack);
                    }
                    
                    localVideo.srcObject = newStream;
                }
                
                // Заменяем видеотреки во всех соединениях
                this.peers.forEach((pc, userId) => {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    
                    if (videoSender && screenTrack) {
                        videoSender.replaceTrack(screenTrack);
                    }
                });
                
                // Обработка остановки демонстрации
                screenTrack.onended = () => {
                    console.log('🖥️ Демонстрация экрана остановлена');
                    this.stopScreenShare();
                };
                
                // Обновляем кнопку
                const btn = document.getElementById('screenShareBtn');
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-stop';
                btn.querySelector('span').textContent = 'Стоп';
                
            } else {
                this.stopScreenShare();
            }
            
        } catch (error) {
            console.error('❌ Ошибка демонстрации экрана:', error);
        }
    }
    
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        
        // Обновляем кнопку
        const btn = document.getElementById('screenShareBtn');
        btn.classList.remove('active');
        btn.querySelector('i').className = 'fas fa-desktop';
        btn.querySelector('span').textContent = 'Экран';
        
        // Возвращаем камеру
        const localVideo = document.querySelector('#local-video-container video');
        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
            
            // Возвращаем камеру во всех соединениях
            this.peers.forEach((pc, userId) => {
                if (this.localStream) {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    const cameraTrack = this.localStream.getVideoTracks()[0];
                    
                    if (videoSender && cameraTrack) {
                        videoSender.replaceTrack(cameraTrack);
                    }
                }
            });
        }
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message) {
            this.addChatMessage(this.userName, message, true);
            input.value = '';
            
            // В реальном приложении здесь была бы отправка на сервер
            // this.socket.emit('chat-message', { message: message });
        }
    }
    
    addChatMessage(userName, message, isOwn = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `<strong>${userName}:</strong> ${message}`;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    copyRoomLink() {
        const link = `${window.location.origin}/?room=${this.roomId}`;
        navigator.clipboard.writeText(link).then(() => {
            alert(`Ссылка скопирована: ${link}`);
        });
    }
    
    leaveRoom() {
        if (confirm('Покинуть комнату?')) {
            console.log('🚪 Выход из комнаты');
            
            // Останавливаем медиа
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Закрываем все соединения
            this.peers.forEach(pc => pc.close());
            this.peers.clear();
            this.remoteStreams.clear();
            
            // Останавливаем таймер
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // Перезагружаем страницу
            location.reload();
        }
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, запуск приложения');
    window.videoChat = new SimpleVideoChat();
    
    // Для отладки
    console.log('ℹ️ Для отладки используйте window.videoChat');
});