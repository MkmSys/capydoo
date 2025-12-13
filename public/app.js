class VideoMeetApp {
    constructor() {
        console.log('🎬 Инициализация VideoMeet');
        
        this.socket = io();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        this.userName = 'Участник';
        this.meetingId = null;
        this.isHost = false;
        
        // WebRTC
        this.localStream = null;
        this.peerConnections = new Map();
        this.remoteStreams = new Map();
        
        // Элементы
        this.videoGrid = document.getElementById('videoGrid');
        this.participantsList = document.getElementById('participantsList');
        this.chatMessages = document.getElementById('chatMessages');
        
        this.init();
    }
    
    init() {
        console.log('🔧 Настройка приложения');
        this.bindEvents();
        this.setupSocketListeners();
        
        // Проверка поддержки WebRTC
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Ваш браузер не поддерживает видеозвонки. Пожалуйста, используйте Chrome, Firefox или Edge.');
            return;
        }
    }
    
    bindEvents() {
        console.log('🔗 Привязка событий');
        
        // Кнопки авторизации
        document.getElementById('createMeetingBtn').addEventListener('click', () => {
            this.userName = document.getElementById('hostName').value || 'Ведущий';
            this.createMeeting();
        });
        
        document.getElementById('joinMeetingBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value || 'Участник';
            const code = document.getElementById('meetingCode').value.trim();
            if (code) {
                this.joinMeeting(code);
            } else {
                alert('Введите код встречи');
            }
        });
        
        // Кнопки управления
        document.getElementById('toggleMicBtn').addEventListener('click', () => this.toggleMic());
        document.getElementById('toggleCamBtn').addEventListener('click', () => this.toggleCam());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveMeeting());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Кнопка закрытия модального окна
        document.getElementById('closeInviteModal').addEventListener('click', () => {
            document.getElementById('inviteModal').classList.remove('show');
        });
        
        // Закрытие по клику вне модального окна
        document.getElementById('inviteModal').addEventListener('click', (e) => {
            if (e.target.id === 'inviteModal') {
                document.getElementById('inviteModal').classList.remove('show');
            }
        });
    }
    
    setupSocketListeners() {
        console.log('📡 Настройка сокетов');
        
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу:', this.socket.id);
        });
        
        this.socket.on('meeting-created', (data) => {
            console.log('✅ Встреча создана:', data.meetingId);
            this.meetingId = data.meetingId;
            this.isHost = true;
            this.showMeetingRoom();
            this.requestMediaAccess();
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('👤 Присоединился:', data.user.name);
            this.addParticipant(data.user);
            this.addSystemMessage(`${data.user.name} присоединился`);
            
            // Если у нас уже есть поток, инициируем соединение
            if (this.localStream) {
                this.createPeerConnection(data.user.id);
            }
        });
        
        this.socket.on('user-left', (data) => {
            console.log('👤 Вышел:', data.userId);
            this.removeParticipant(data.userId);
        });
        
        this.socket.on('participants-list', (participants) => {
            console.log('📋 Участники:', participants);
            participants.forEach(p => {
                this.addParticipant(p);
                // Создаем соединение с каждым существующим участником
                if (this.localStream && p.id !== this.userId) {
                    this.createPeerConnection(p.id);
                }
            });
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.user, data.message, data.timestamp);
        });
        
        // WebRTC события
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
    }
    
    async createMeeting() {
        try {
            console.log('📝 Создание встречи...');
            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostId: this.userId,
                    hostName: this.userName
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.meetingId = data.meetingId;
                this.socket.emit('create-meeting', {
                    meetingId: this.meetingId,
                    user: {
                        id: this.userId,
                        name: this.userName,
                        isHost: true
                    }
                });
            }
        } catch (error) {
            console.error('❌ Ошибка создания:', error);
            alert('Не удалось создать встречу');
        }
    }
    
    async joinMeeting(code) {
        try {
            const cleanCode = code.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase();
            console.log('🔗 Присоединение к:', cleanCode);
            
            const response = await fetch(`/api/meetings/${cleanCode}`);
            
            if (response.ok) {
                this.meetingId = cleanCode;
                this.socket.emit('join-meeting', {
                    meetingId: this.meetingId,
                    user: {
                        id: this.userId,
                        name: this.userName,
                        isHost: false
                    }
                });
                
                this.showMeetingRoom();
                this.requestMediaAccess();
            } else {
                alert('Встреча не найдена');
            }
        } catch (error) {
            console.error('❌ Ошибка присоединения:', error);
            alert('Не удалось присоединиться');
        }
    }
    
    async requestMediaAccess() {
        console.log('🎥 Запрос доступа к медиа...');
        
        try {
            // Пробуем получить камеру и микрофон
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            console.log('✅ Медиа получено');
            this.addLocalVideo();
            this.setupMediaControls();
            
            // Уведомляем сервер
            this.socket.emit('media-ready', {
                meetingId: this.meetingId,
                userId: this.userId
            });
            
        } catch (error) {
            console.error('❌ Ошибка доступа к медиа:', error);
            
            // Пробуем только микрофон
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true
                });
                console.log('✅ Аудио получено');
                this.addLocalVideo();
            } catch (audioError) {
                console.error('❌ Аудио тоже не доступно:', audioError);
                this.addSystemMessage('Камера/микрофон недоступны. Проверьте разрешения браузера.');
                this.addVideoPlaceholder();
            }
        }
    }
    
    addLocalVideo() {
        console.log('➕ Добавление локального видео');
        
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) emptyState.style.display = 'none';
        
        // Удаляем старый элемент если есть
        const oldVideo = document.getElementById('local-video-container');
        if (oldVideo) oldVideo.remove();
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-item';
        videoContainer.id = 'local-video-container';
        
        const video = document.createElement('video');
        video.id = 'local-video';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        if (this.localStream) {
            video.srcObject = this.localStream;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="video-info">
                <div class="participant-avatar">${this.userName.charAt(0)}</div>
                <span>${this.userName} (Вы)</span>
                <span class="video-status" id="local-audio-status">🎤✓</span>
            </div>
        `;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        videoGrid.appendChild(videoContainer);
    }
    
    createPeerConnection(targetUserId) {
        console.log(`🔗 Создание соединения с ${targetUserId}`);
        
        // Если соединение уже есть, пропускаем
        if (this.peerConnections.has(targetUserId)) {
            console.log(`⚠️ Соединение с ${targetUserId} уже существует`);
            return;
        }
        
        // Настройки ICE серверов (ОЧЕНЬ ВАЖНО!)
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Публичные STUN серверы
                { urls: 'stun:stun.voipbuster.com:3478' },
                { urls: 'stun:stun.voipstunt.com:3478' }
            ],
            iceCandidatePoolSize: 10
        };
        
        const peerConnection = new RTCPeerConnection(configuration);
        
        // Добавляем локальные треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Обработка удаленного потока
        peerConnection.ontrack = (event) => {
            console.log(`📹 Получен поток от ${targetUserId}`);
            
            const stream = event.streams[0];
            this.remoteStreams.set(targetUserId, stream);
            this.addRemoteVideo(targetUserId, stream);
        };
        
        // ICE кандидаты
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`🧊 ICE кандидат для ${targetUserId}`);
                this.socket.emit('ice-candidate', {
                    meetingId: this.meetingId,
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Состояние соединения
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`📶 Состояние ICE с ${targetUserId}:`, peerConnection.iceConnectionState);
        };
        
        // Сохраняем соединение
        this.peerConnections.set(targetUserId, peerConnection);
        
        // Создаем предложение (offer)
        if (this.isHost) {
            this.createOffer(peerConnection, targetUserId);
        }
        
        return peerConnection;
    }
    
    async createOffer(peerConnection, targetUserId) {
        try {
            console.log(`📤 Создание оффера для ${targetUserId}`);
            
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await peerConnection.setLocalDescription(offer);
            
            console.log(`📤 Отправка оффера для ${targetUserId}`);
            this.socket.emit('offer', {
                meetingId: this.meetingId,
                targetUserId: targetUserId,
                offer: peerConnection.localDescription
            });
            
        } catch (error) {
            console.error(`❌ Ошибка создания оффера для ${targetUserId}:`, error);
        }
    }
    
    async handleOffer(data) {
        console.log(`📥 Получен оффер от ${data.senderId}`);
        
        const peerConnection = this.createPeerConnection(data.senderId);
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log(`📤 Отправка ответа для ${data.senderId}`);
            this.socket.emit('answer', {
                meetingId: this.meetingId,
                targetUserId: data.senderId,
                answer: peerConnection.localDescription
            });
            
        } catch (error) {
            console.error(`❌ Ошибка обработки оффера от ${data.senderId}:`, error);
        }
    }
    
    async handleAnswer(data) {
        console.log(`📥 Получен ответ от ${data.senderId}`);
        
        const peerConnection = this.peerConnections.get(data.senderId);
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (error) {
                console.error(`❌ Ошибка установки ответа от ${data.senderId}:`, error);
            }
        }
    }
    
    async handleIceCandidate(data) {
        console.log(`🧊 Получен ICE кандидат от ${data.senderId}`);
        
        const peerConnection = this.peerConnections.get(data.senderId);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error(`❌ Ошибка добавления ICE кандидата от ${data.senderId}:`, error);
            }
        }
    }
    
    addRemoteVideo(userId, stream) {
        console.log(`➕ Добавление видео для ${userId}`);
        
        // Удаляем старый элемент если есть
        const oldVideo = document.getElementById(`remote-video-${userId}`);
        if (oldVideo) oldVideo.remove();
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-item';
        videoContainer.id = `remote-video-${userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        // Получаем имя пользователя
        let userName = 'Участник';
        const participantsList = document.getElementById('participantsList');
        if (participantsList) {
            const participant = Array.from(participantsList.children).find(
                li => li.id === `participant-${userId}`
            );
            if (participant) {
                userName = participant.querySelector('span').textContent || 'Участник';
            }
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="video-info">
                <div class="participant-avatar">${userName.charAt(0)}</div>
                <span>${userName}</span>
                <span class="video-status">🔊</span>
            </div>
        `;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) emptyState.style.display = 'none';
        videoGrid.appendChild(videoContainer);
    }
    
    async toggleScreenShare() {
        console.log('🖥️ Переключение демонстрации экрана');
        
        try {
            if (!this.screenStream) {
                // Начинаем демонстрацию
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        displaySurface: 'monitor'
                    },
                    audio: false
                });
                
                console.log('✅ Демонстрация экрана начата');
                
                // Обновляем кнопку
                const btn = document.getElementById('screenShareBtn');
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-stop';
                btn.querySelector('span').textContent = 'Стоп';
                
                // Заменяем видеотрек в локальном потоке
                const videoTrack = this.screenStream.getVideoTracks()[0];
                
                // Обновляем локальное видео
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    // Создаем новый поток с экраном и старым аудио
                    const newStream = new MediaStream();
                    newStream.addTrack(videoTrack);
                    
                    // Добавляем аудио из локального потока если есть
                    if (this.localStream) {
                        const audioTracks = this.localStream.getAudioTracks();
                        audioTracks.forEach(track => newStream.addTrack(track));
                    }
                    
                    localVideo.srcObject = newStream;
                }
                
                // Заменяем треки во всех соединениях
                this.peerConnections.forEach((peerConnection, userId) => {
                    const senders = peerConnection.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    
                    if (videoSender && videoTrack) {
                        videoSender.replaceTrack(videoTrack);
                    }
                });
                
                // Обработка остановки демонстрации
                videoTrack.onended = () => {
                    console.log('🖥️ Демонстрация экрана остановлена');
                    this.stopScreenShare();
                };
                
            } else {
                // Останавливаем демонстрацию
                this.stopScreenShare();
            }
            
        } catch (error) {
            console.error('❌ Ошибка демонстрации экрана:', error);
            if (error.name !== 'NotAllowedError') {
                alert('Не удалось начать демонстрацию экрана');
            }
        }
    }
    
    stopScreenShare() {
        console.log('🖥️ Остановка демонстрации экрана');
        
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
        const localVideo = document.getElementById('local-video');
        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
            
            // Возвращаем камеру во всех соединениях
            this.peerConnections.forEach((peerConnection, userId) => {
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (videoSender && this.localStream) {
                    const cameraTrack = this.localStream.getVideoTracks()[0];
                    if (cameraTrack) {
                        videoSender.replaceTrack(cameraTrack);
                    }
                }
            });
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
                    text.textContent = 'Выкл. звук';
                    btn.classList.add('active');
                    
                    // Обновляем статус
                    const status = document.getElementById('local-audio-status');
                    if (status) status.textContent = '🎤✓';
                } else {
                    icon.className = 'fas fa-microphone-slash';
                    text.textContent = 'Вкл. звук';
                    btn.classList.remove('active');
                    
                    const status = document.getElementById('local-audio-status');
                    if (status) status.textContent = '🎤✗';
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
                    text.textContent = 'Выкл. видео';
                    btn.classList.add('active');
                } else {
                    icon.className = 'fas fa-video-slash';
                    text.textContent = 'Вкл. видео';
                    btn.classList.remove('active');
                }
            }
        }
    }
    
    addParticipant(user) {
        console.log(`➕ Добавление участника ${user.name}`);
        
        // Добавляем в список
        const li = document.createElement('li');
        li.className = 'participant';
        li.id = `participant-${user.id}`;
        li.innerHTML = `
            <div class="participant-info">
                <div class="participant-avatar">${user.name.charAt(0)}</div>
                <span>${user.name}</span>
            </div>
            <div class="participant-status">
                <i class="fas fa-circle"></i>
            </div>
        `;
        
        if (this.participantsList) {
            this.participantsList.appendChild(li);
        }
        
        // Обновляем счетчик
        this.updateParticipantCount();
    }
    
    removeParticipant(userId) {
        console.log(`➖ Удаление участника ${userId}`);
        
        // Удаляем из списка
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) participant.remove();
        
        // Удаляем видео
        const video = document.getElementById(`remote-video-${userId}`);
        if (video) video.remove();
        
        // Закрываем соединение
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
        
        // Удаляем поток
        this.remoteStreams.delete(userId);
        
        this.updateParticipantCount();
    }
    
    updateParticipantCount() {
        const countElement = document.getElementById('participantCount');
        if (countElement && this.participantsList) {
            const count = this.participantsList.children.length + 1; // +1 для себя
            countElement.textContent = count;
        }
    }
    
    showMeetingRoom() {
        console.log('🚪 Показ комнаты встречи');
        
        document.getElementById('joinModal').classList.remove('show');
        document.getElementById('meetingRoom').classList.remove('hidden');
        
        // Обновляем информацию
        const currentMeetingId = document.getElementById('currentMeetingId');
        const meetingCodeDisplay = document.getElementById('meetingCodeDisplay');
        const meetingLink = document.getElementById('meetingLink');
        
        if (currentMeetingId) currentMeetingId.textContent = this.meetingId;
        if (meetingCodeDisplay) meetingCodeDisplay.textContent = this.meetingId;
        if (meetingLink) {
            meetingLink.value = `${window.location.origin}/join/${this.meetingId}`;
        }
        
        // Добавляем себя в список
        this.addParticipant({ id: this.userId, name: this.userName, isHost: this.isHost });
        
        this.addSystemMessage(`Вы присоединились к встрече ${this.meetingId}`);
    }
    
    showInviteModal() {
        console.log('📨 Показ модального окна приглашения');
        document.getElementById('inviteModal').classList.add('show');
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input ? input.value.trim() : '';
        
        if (message && this.meetingId) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            this.socket.emit('chat-message', {
                meetingId: this.meetingId,
                message: message,
                timestamp: timestamp
            });
            
            this.addChatMessage(this.userName, message, timestamp, true);
            
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    }
    
    addChatMessage(userName, message, timestamp, isOwn = false) {
        if (!this.chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `
            <div class="message-header">
                <strong>${userName}</strong>
                <span>${timestamp}</span>
            </div>
            <div class="message-body">${message}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    addSystemMessage(message) {
        if (!this.chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-system';
        messageDiv.textContent = message;
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    leaveMeeting() {
        if (confirm('Покинуть встречу?')) {
            console.log('👋 Выход из встречи');
            
            // Останавливаем медиа
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Закрываем все соединения
            this.peerConnections.forEach(peer => peer.close());
            this.peerConnections.clear();
            
            // Уведомляем сервер
            if (this.socket && this.meetingId) {
                this.socket.emit('leave-meeting', {
                    meetingId: this.meetingId,
                    userId: this.userId
                });
            }
            
            // Перезагружаем страницу
            setTimeout(() => location.reload(), 100);
        }
    }
    
    setupMediaControls() {
        // Настройка контролов медиа
        console.log('🎛️ Настройка контролов медиа');
    }
    
    addVideoPlaceholder() {
        console.log('🖼️ Добавление заглушки для видео');
        
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;
        
        const placeholder = document.createElement('div');
        placeholder.className = 'video-item placeholder';
        placeholder.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1a73e8; border-radius: 10px;">
                <div style="text-align: center; color: white;">
                    <i class="fas fa-user" style="font-size: 48px; margin-bottom: 10px;"></i>
                    <div style="font-weight: bold;">${this.userName}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Камера недоступна</div>
                </div>
            </div>
        `;
        
        videoGrid.appendChild(placeholder);
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен');
    window.app = new VideoMeetApp();
});
