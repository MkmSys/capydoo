class VideoMeetApp {
    constructor() {
        console.log('🎬 Инициализация VideoMeet');
        
        this.socket = io();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        this.userName = 'Участник';
        this.meetingId = null;
        
        // WebRTC
        this.localStream = null;
        this.screenStream = null;
        this.peers = new Map(); // userId -> { pc, stream }
        this.remoteStreams = new Map();
        
        this.init();
    }
    
    init() {
        console.log('🔧 Настройка приложения');
        this.bindEvents();
        this.setupSocketListeners();
    }
    
    bindEvents() {
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
        
        // Чат
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Модальное окно
        document.getElementById('closeInviteModal').addEventListener('click', () => {
            document.getElementById('inviteModal').classList.remove('show');
        });
        
        document.getElementById('inviteModal').addEventListener('click', (e) => {
            if (e.target.id === 'inviteModal') {
                document.getElementById('inviteModal').classList.remove('show');
            }
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу:', this.socket.id);
        });
        
        this.socket.on('meeting-created', (data) => {
            console.log('✅ Встреча создана:', data.meetingId);
            this.meetingId = data.meetingId;
            this.showMeetingRoom();
            this.initLocalMedia();
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('👤 Присоединился:', data.user.name);
            this.addParticipantToUI(data.user);
            
            // Если у нас уже есть медиа, создаем соединение
            if (this.localStream) {
                this.createPeerForUser(data.user.id);
            }
        });
        
        this.socket.on('user-left', (data) => {
            console.log('👤 Вышел:', data.userId);
            this.removeUser(data.userId);
        });
        
        this.socket.on('participants-list', (participants) => {
            console.log('📋 Участники:', participants);
            participants.forEach(user => {
                this.addParticipantToUI(user);
                if (this.localStream) {
                    this.createPeerForUser(user.id);
                }
            });
        });
        
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.user, data.message, data.timestamp);
        });
    }
    
    async createMeeting() {
        try {
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
                this.initLocalMedia();
            } else {
                alert('Встреча не найдена');
            }
        } catch (error) {
            console.error('❌ Ошибка присоединения:', error);
            alert('Не удалось присоединиться');
        }
    }
    
    async initLocalMedia() {
        try {
            console.log('🎥 Запрос доступа к медиа...');
            
            // Получаем камеру и микрофон
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            console.log('✅ Медиа получено');
            this.displayLocalVideo();
            
            // Уведомляем сервер что мы готовы
            this.socket.emit('media-ready', {
                meetingId: this.meetingId,
                userId: this.userId
            });
            
        } catch (error) {
            console.error('❌ Ошибка доступа к медиа:', error);
            this.addSystemMessage('Камера/микрофон недоступны. Вы можете продолжить без видео.');
            this.displayLocalVideo(true); // Показываем заглушку
        }
    }
    
    displayLocalVideo(isPlaceholder = false) {
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) emptyState.style.display = 'none';
        
        // Удаляем старый элемент если есть
        const oldVideo = document.getElementById('local-video-container');
        if (oldVideo) oldVideo.remove();
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-item';
        videoContainer.id = 'local-video-container';
        
        if (isPlaceholder || !this.localStream) {
            // Заглушка
            videoContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1a73e8;">
                    <div style="text-align: center; color: white;">
                        <div style="width: 80px; height: 80px; background: white; border-radius: 50%; 
                                    display: flex; align-items: center; justify-content: center; 
                                    margin: 0 auto 15px; font-size: 32px; color: #1a73e8; font-weight: bold;">
                            ${this.userName.charAt(0).toUpperCase()}
                        </div>
                        <div style="font-weight: bold;">${this.userName} (Вы)</div>
                        <div style="font-size: 12px; opacity: 0.8;">Камера выключена</div>
                    </div>
                </div>
            `;
        } else {
            // Реальное видео
            const video = document.createElement('video');
            video.id = 'local-video';
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true; // Для локального видео отключаем звук
            video.srcObject = this.localStream;
            
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
        }
        
        videoGrid.appendChild(videoContainer);
    }
    
    createPeerForUser(targetUserId) {
        console.log(`🔗 Создание соединения с ${targetUserId}`);
        
        // Проверяем, не существует ли уже соединение
        if (this.peers.has(targetUserId)) {
            console.log(`⚠️ Соединение с ${targetUserId} уже существует`);
            return;
        }
        
        // Создаем PeerConnection с публичными STUN серверами
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        });
        
        // Сохраняем соединение
        this.peers.set(targetUserId, { pc: peerConnection });
        
        // Добавляем локальные треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Обработка входящего потока
        peerConnection.ontrack = (event) => {
            console.log(`📹 Получен поток от ${targetUserId}`);
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                this.remoteStreams.set(targetUserId, stream);
                this.displayRemoteVideo(targetUserId, stream);
            }
        };
        
        // ICE кандидаты
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    meetingId: this.meetingId,
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Создаем и отправляем оффер
        this.createAndSendOffer(peerConnection, targetUserId);
    }
    
    async createAndSendOffer(pc, targetUserId) {
        try {
            console.log(`📤 Создание оффера для ${targetUserId}`);
            
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                meetingId: this.meetingId,
                targetUserId: targetUserId,
                offer: pc.localDescription
            });
            
            console.log(`✅ Оффер отправлен для ${targetUserId}`);
            
        } catch (error) {
            console.error(`❌ Ошибка создания оффера для ${targetUserId}:`, error);
        }
    }
    
    async handleOffer(data) {
        console.log(`📥 Получен оффер от ${data.senderId}`);
        
        // Создаем соединение для отправителя
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Добавляем локальные треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Обработка входящего потока
        peerConnection.ontrack = (event) => {
            console.log(`📹 Получен поток от ${data.senderId}`);
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                this.remoteStreams.set(data.senderId, stream);
                this.displayRemoteVideo(data.senderId, stream);
            }
        };
        
        // ICE кандидаты
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    meetingId: this.meetingId,
                    targetUserId: data.senderId,
                    candidate: event.candidate
                });
            }
        };
        
        // Сохраняем соединение
        this.peers.set(data.senderId, { pc: peerConnection });
        
        try {
            // Устанавливаем удаленное описание
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.offer)
            );
            
            // Создаем ответ
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Отправляем ответ
            this.socket.emit('answer', {
                meetingId: this.meetingId,
                targetUserId: data.senderId,
                answer: peerConnection.localDescription
            });
            
            console.log(`✅ Ответ отправлен для ${data.senderId}`);
            
        } catch (error) {
            console.error(`❌ Ошибка обработки оффера от ${data.senderId}:`, error);
        }
    }
    
    async handleAnswer(data) {
        console.log(`📥 Получен ответ от ${data.senderId}`);
        
        const peerData = this.peers.get(data.senderId);
        if (peerData && peerData.pc) {
            try {
                await peerData.pc.setRemoteDescription(
                    new RTCSessionDescription(data.answer)
                );
                console.log(`✅ Установлено удаленное описание от ${data.senderId}`);
            } catch (error) {
                console.error(`❌ Ошибка установки ответа от ${data.senderId}:`, error);
            }
        }
    }
    
    async handleIceCandidate(data) {
        console.log(`🧊 Получен ICE кандидат от ${data.senderId}`);
        
        const peerData = this.peers.get(data.senderId);
        if (peerData && peerData.pc && data.candidate) {
            try {
                await peerData.pc.addIceCandidate(
                    new RTCIceCandidate(data.candidate)
                );
            } catch (error) {
                console.error(`❌ Ошибка добавления ICE кандидата от ${data.senderId}:`, error);
            }
        }
    }
    
        displayRemoteVideo(userId, stream) {
        console.log(`➕ Отображение видео для ${userId}`, stream);
    
    // Удаляем старый элемент
        const oldVideo = document.getElementById(`remote-video-${userId}`);
        if (oldVideo) oldVideo.remove();
    
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `remote-video-${userId}`;
        videoContainer.style.width = '100%';
        videoContainer.style.height = '100%';
        videoContainer.style.minHeight = '200px';
    
    // Проверяем есть ли видео
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
    
        console.log(`📊 Поток ${userId}: видео=${hasVideo}, аудио=${hasAudio}`);
    
        if (hasVideo) {
        // Создаем видео элемент
            const video = document.createElement('video');
            video.id = `video-${userId}`;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = false;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            video.style.background = '#000';
            video.style.display = 'block';
        
        // Назначаем поток
            video.srcObject = stream;
        
        // Обработчики
            video.onloadedmetadata = () => {
                console.log(`✅ Видео загружено для ${userId}`);
                video.play().catch(e => {
                    console.log(`⚠️ Автовоспроизведение для ${userId}:`, e);
                });
            };
        
            video.onerror = (e) => {
                console.error(`❌ Ошибка видео ${userId}:`, e);
            };
        
        // Информация о пользователе
            const userName = this.getUserName(userId) || 'Участник';
            const info = document.createElement('div');
            info.className = 'video-info';
            info.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 24px; height: 24px; background: #1a73e8; 
                                border-radius: 50%; display: flex; align-items: center; 
                                justify-content: center; color: white; font-weight: bold;">
                        ${userName.charAt(0)}
                    </div>
                    <span>${userName}</span>
                    <span style="margin-left: auto; font-size: 12px;">
                        ${hasAudio ? '🔊' : '🔇'}
                    </span>
                </div>
            `;
        
            videoContainer.appendChild(video);
            videoContainer.appendChild(info);
        
        } else {
        // Заглушка если нет видео
            const userName = this.getUserName(userId) || 'Участник';
            videoContainer.className = 'video-container placeholder';
            videoContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; width: 100%; height: 100%; 
                            display: flex; flex-direction: column; align-items: center; 
                            justify-content: center;">
                    <div style="width: 80px; height: 80px; background: white; 
                                border-radius: 50%; display: flex; align-items: center; 
                                justify-content: center; margin-bottom: 20px; font-size: 32px; 
                                color: #1a73e8; font-weight: bold;">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                    <div style="font-weight: bold; color: white; margin-bottom: 10px; font-size: 16px;">
                        ${userName}
                    </div>
                    <div style="color: rgba(255,255,255,0.8); font-size: 14px;">
                        ${hasAudio ? 'Только аудио' : 'Нет медиа'}
                    </div>
                </div>
            `;
        }
    
    // Добавляем в сетку
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
    
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    
        if (videoGrid) {
            videoGrid.appendChild(videoContainer);
            console.log(`✅ Видео добавлено в сетку для ${userId}`);
        
        // Логируем структуру
            console.log(`📦 Сетка содержит ${videoGrid.children.length} элементов`);
        }
    }
    
    getUserName(userId) {
        // Ищем имя пользователя в списке участников
        const participantElement = document.getElementById(`participant-${userId}`);
        if (participantElement) {
            const nameElement = participantElement.querySelector('.participant-info span');
            return nameElement ? nameElement.textContent : 'Участник';
        }
        return 'Участник';
    }
    
    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                console.log('🖥️ Начало демонстрации экрана...');
                
                // ПРОСТОЙ запрос на демонстрацию экрана
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true
                });
                
                console.log('✅ Демонстрация экрана начата');
                
                // Получаем видеотрек с экрана
                const screenTrack = this.screenStream.getVideoTracks()[0];
                
                // Обновляем локальное видео
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    // Создаем новый поток с экраном
                    const newStream = new MediaStream();
                    newStream.addTrack(screenTrack);
                    
                    // Добавляем аудио если есть
                    if (this.localStream) {
                        const audioTrack = this.localStream.getAudioTracks()[0];
                        if (audioTrack) {
                            newStream.addTrack(audioTrack);
                        }
                    }
                    
                    localVideo.srcObject = newStream;
                }
                
                // Заменяем видеотреки во ВСЕХ соединениях
                this.peers.forEach((peerData, userId) => {
                    if (peerData.pc) {
                        const senders = peerData.pc.getSenders();
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                        
                        if (videoSender && screenTrack) {
                            videoSender.replaceTrack(screenTrack);
                            console.log(`🔄 Заменен видеотрек для ${userId}`);
                        }
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
                btn.querySelector('span').textContent = 'Стоп экран';
                
            } else {
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
            this.peers.forEach((peerData, userId) => {
                if (peerData.pc && this.localStream) {
                    const senders = peerData.pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    const cameraTrack = this.localStream.getVideoTracks()[0];
                    
                    if (videoSender && cameraTrack) {
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
                    
                    // Обновляем видео если оно было выключено
                    const localVideo = document.getElementById('local-video');
                    if (localVideo && localVideo.srcObject) {
                        localVideo.srcObject = this.localStream;
                    }
                } else {
                    icon.className = 'fas fa-video-slash';
                    text.textContent = 'Вкл. видео';
                    btn.classList.remove('active');
                }
            }
        }
    }
    
    addParticipantToUI(user) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;
        
        // Проверяем, не добавлен ли уже
        if (!document.getElementById(`participant-${user.id}`)) {
            const li = document.createElement('li');
            li.className = 'participant';
            li.id = `participant-${user.id}`;
            
            li.innerHTML = `
                <div class="participant-info">
                    <div class="participant-avatar">${user.name.charAt(0)}</div>
                    <span>${user.name}</span>
                    ${user.isHost ? '<span class="participant-host">Ведущий</span>' : ''}
                </div>
                <div class="participant-status">
                    <i class="fas fa-circle text-primary"></i>
                </div>
            `;
            
            participantsList.appendChild(li);
        }
        
        this.updateParticipantCount();
    }
    
    removeUser(userId) {
        console.log(`➖ Удаление пользователя ${userId}`);
        
        // Удаляем из списка участников
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) participant.remove();
        
        // Удаляем видео
        const video = document.getElementById(`remote-video-${userId}`);
        if (video) video.remove();
        
        // Закрываем соединение
        const peerData = this.peers.get(userId);
        if (peerData && peerData.pc) {
            peerData.pc.close();
        }
        this.peers.delete(userId);
        this.remoteStreams.delete(userId);
        
        this.updateParticipantCount();
    }
    
    updateParticipantCount() {
        const countElement = document.getElementById('participantCount');
        if (countElement) {
            const participantsList = document.getElementById('participantsList');
            const count = (participantsList ? participantsList.children.length : 0) + 1;
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
        this.addParticipantToUI({ 
            id: this.userId, 
            name: this.userName, 
            isHost: true 
        });
        
        this.addSystemMessage(`Вы присоединились к встрече ${this.meetingId}`);
    }
    
    showInviteModal() {
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
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `
            <div class="message-header">
                <strong>${userName}</strong>
                <span>${timestamp}</span>
            </div>
            <div class="message-body">${message}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    addSystemMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-system';
        messageDiv.textContent = message;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
            this.peers.forEach((peerData, userId) => {
                if (peerData.pc) {
                    peerData.pc.close();
                }
            });
            
            this.peers.clear();
            this.remoteStreams.clear();
            
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
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, запуск приложения');
    window.app = new VideoMeetApp();
    
    // Добавляем отладку
    window.debug = {
        showPeers: () => {
            console.log('=== ВСЕ СОЕДИНЕНИЯ ===');
            console.log('Всего:', window.app.peers.size);
            window.app.peers.forEach((data, id) => {
                console.log(`Соединение ${id}:`, data.pc.connectionState);
            });
        },
        showStreams: () => {
            console.log('=== ВСЕ ПОТОКИ ===');
            console.log('Локальный поток:', window.app.localStream);
            console.log('Удаленные потоки:', window.app.remoteStreams.size);
        }
    };
});
