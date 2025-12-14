// 🎬 Простой видеозвонок - РАБОЧАЯ ВЕРСИЯ v2.0

class SimpleVideoChat {
    constructor() {
        console.log('🚀 Инициализация SimpleVideoChat v2.0');
        
        this.socket = io();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        this.userName = 'Участник';
        this.roomId = null;
        this.startTime = null;
        this.timerInterval = null;
        
        // WebRTC
        this.localStream = null;
        this.screenStream = null;
        this.peers = new Map(); // userId -> { pc, stream }
        this.remoteStreams = new Map();
        
        // Чат
        this.chatMessages = [];
        
        this.init();
    }
    
    init() {
        console.log('🔧 Настройка приложения');
        this.setupEventListeners();
        this.setupSocketListeners();
        this.checkMediaPermissions();
    }
    
    setupEventListeners() {
        // Создание комнаты
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value.trim() || 'Участник';
            this.createRoom();
        });
        
        // Присоединение к комнате
        document.getElementById('confirmJoinBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value.trim() || 'Участник';
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
        document.getElementById('toggleChatBtn').addEventListener('click', () => this.toggleChat());
        document.getElementById('clearChatBtn').addEventListener('click', () => this.clearChat());
        
        // Чат
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Показать/скрыть участников на мобильных
        document.getElementById('showParticipantsBtn').addEventListener('click', () => {
            this.toggleParticipantsList();
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу:', this.socket.id);
            this.addSystemMessage('Подключено к серверу');
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
            this.addSystemMessage(`Новый участник присоединился`);
            
            // Создаем соединение с новым пользователем
            setTimeout(() => {
                this.createPeerConnection(data.userId, true);
            }, 1000);
        });
        
        this.socket.on('user-left', (data) => {
            console.log('👤 Участник вышел:', data.userId);
            this.removePeer(data.userId);
            this.addSystemMessage(`Участник вышел`);
        });
        
        // WebRTC сигналы
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
        
        // ЧАТ
        this.socket.on('chat-message', (data) => {
            console.log('💬 Сообщение чата:', data);
            this.addChatMessage(data.userName, data.message, data.timestamp, false);
        });
    }
    
    async checkMediaPermissions() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(d => d.kind === 'videoinput');
            const hasMicrophone = devices.some(d => d.kind === 'audioinput');
            
            console.log('📱 Устройства:', {
                hasCamera: hasCamera,
                hasMicrophone: hasMicrophone,
                devices: devices.map(d => ({ kind: d.kind, label: d.label }))
            });
            
            if (!hasCamera) {
                console.warn('⚠️ Камера не обнаружена');
            }
            if (!hasMicrophone) {
                console.warn('⚠️ Микрофон не обнаружен');
            }
            
        } catch (error) {
            console.error('❌ Ошибка проверки устройств:', error);
        }
    }
    
    async createRoom() {
        try {
            console.log('📝 Создание комнаты...');
            this.addSystemMessage('Создание комнаты...');
            
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
        this.addSystemMessage(`Присоединение к комнате ${roomId}...`);
        
        this.roomId = roomId;
        this.socket.emit('join-room', {
            roomId: roomId,
            userName: this.userName
        });
    }
    
    async startMedia() {
        console.log('🎥 Запрос доступа к медиа...');
        this.addSystemMessage('Запрашиваю доступ к камере и микрофону...');
        
        try {
            // АКТИВНЫЙ запрос доступа с четкими параметрами
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            
            const videoTracks = this.localStream.getVideoTracks();
            const audioTracks = this.localStream.getAudioTracks();
            
            console.log('✅ Медиа получено!', {
                videoTracks: videoTracks.length,
                audioTracks: audioTracks.length,
                videoEnabled: videoTracks[0]?.enabled,
                audioEnabled: audioTracks[0]?.enabled
            });
            
            this.addSystemMessage('Камера и микрофон готовы!');
            this.displayLocalVideo();
            
            // Автоматически создаем соединения через 1 секунду
            setTimeout(() => {
                this.notifyPeersAboutMyMedia();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Ошибка доступа к медиа:', error);
            
            if (error.name === 'NotAllowedError') {
                this.addSystemMessage('⚠️ Разрешите доступ к камере и микрофону в настройках браузера');
                alert('Пожалуйста, разрешите доступ к камере и микрофону для работы видеозвонка');
            } else if (error.name === 'NotFoundError') {
                this.addSystemMessage('⚠️ Камера или микрофон не найдены');
                alert('Не удалось найти камеру или микрофон. Проверьте подключение устройств.');
            } else {
                this.addSystemMessage('⚠️ Ошибка доступа к медиаустройствам');
            }
            
            // Все равно показываем интерфейс, но без видео
            this.displayLocalPlaceholder();
        }
    }
    
    notifyPeersAboutMyMedia() {
        console.log('📢 Уведомляю других участников о моем медиа...');
        // В реальности сервер должен отправлять события другим участникам
        // Здесь мы просто логируем
    }
    
    displayLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;
        
        // Очищаем только если это первое отображение
        if (!document.getElementById('local-video-container')) {
            // videoGrid.innerHTML = '';
        }
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = 'local-video-container';
        
        const video = document.createElement('video');
        video.id = 'local-video';
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = this.localStream;
        
        // Обработчики для отладки
        video.onloadedmetadata = () => {
            console.log('✅ Локальное видео загружено');
            video.play().catch(e => console.log('⚠️ Автовоспроизведение:', e));
        };
        
        video.onerror = (e) => {
            console.error('❌ Ошибка локального видео:', e);
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="avatar">${this.userName.charAt(0).toUpperCase()}</div>
            <span>${this.userName} (Вы)</span>
        `;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        videoGrid.appendChild(videoContainer);
        
        // Прокручиваем к новому видео
        this.scrollToBottom();
    }
    
    displayLocalPlaceholder() {
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;
        
        const placeholder = document.createElement('div');
        placeholder.className = 'video-container';
        placeholder.id = 'local-video-container';
        placeholder.style.background = '#1a73e8';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        
        placeholder.innerHTML = `
            <div style="text-align: center; color: white; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📹</div>
                <div style="font-weight: bold; margin-bottom: 8px;">${this.userName}</div>
                <div style="font-size: 12px; opacity: 0.8;">
                    Камера недоступна<br>
                    Но вы можете общаться по аудио
                </div>
            </div>
        `;
        
        videoGrid.appendChild(placeholder);
    }
    
    createPeerConnection(targetUserId, isInitiator) {
        console.log(`🔗 Создание соединения с ${targetUserId}, инициатор: ${isInitiator}`);
        
        // Проверяем есть ли локальный поток
        if (!this.localStream) {
            console.error('❌ Нет локального потока для соединения');
            return;
        }
        
        // Если уже есть соединение - закрываем старое
        if (this.peers.has(targetUserId)) {
            const oldPc = this.peers.get(targetUserId);
            oldPc.close();
            this.peers.delete(targetUserId);
        }
        
        // Настройки STUN серверов
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        const pc = new RTCPeerConnection(config);
        this.peers.set(targetUserId, pc);
        
        // ДОБАВЛЯЕМ ВСЕ ТРЕКИ из локального потока
        this.localStream.getTracks().forEach(track => {
            console.log(`➕ Добавляю ${track.kind} трек в соединение`);
            pc.addTrack(track, this.localStream);
        });
        
        // Получаем ВХОДЯЩИЙ поток от другого участника
        pc.ontrack = (event) => {
            console.log(`📹 Получен поток от ${targetUserId}`, {
                streams: event.streams.length,
                trackKind: event.track?.kind
            });
            
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                this.remoteStreams.set(targetUserId, stream);
                this.displayRemoteVideo(targetUserId, stream);
                
                // Автоматически воспроизводим
                setTimeout(() => {
                    const video = document.querySelector(`#remote-${targetUserId} video`);
                    if (video) {
                        video.play().catch(e => {
                            console.log('⚠️ Автовоспроизведение удаленного видео не удалось:', e);
                        });
                    }
                }, 500);
            }
        };
        
        // ICE кандидаты
        pc.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Отслеживание состояния
        pc.oniceconnectionstatechange = () => {
            console.log(`📶 ICE состояние с ${targetUserId}:`, pc.iceConnectionState);
        };
        
        pc.onconnectionstatechange = () => {
            console.log(`🔗 Состояние соединения с ${targetUserId}:`, pc.connectionState);
        };
        
        // Создаем оффер если мы инициаторы
        if (isInitiator) {
            setTimeout(() => {
                this.createOffer(pc, targetUserId);
            }, 500);
        }
        
        return pc;
    }
    
    async createOffer(pc, targetUserId) {
        try {
            console.log(`📤 Создание оффера для ${targetUserId}...`);
            
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            console.log(`✅ Оффер создан, отправляю для ${targetUserId}`);
            
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
        
        // Создаем новое соединение
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
            
            console.log(`✅ Ответ отправлен для ${data.from}`);
            
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
                console.log(`✅ Установлено удаленное описание от ${data.from}`);
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
        console.log(`➕ Отображение видео для ${userId}`, {
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
        });
        
        // Удаляем старый элемент
        const oldVideo = document.getElementById(`remote-${userId}`);
        if (oldVideo) oldVideo.remove();
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `remote-${userId}`;
        
        // Проверяем есть ли видео
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
        
        if (hasVideo) {
            // Показываем видео элемент
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.srcObject = stream;
            
            // Обработчики
            video.onloadedmetadata = () => {
                console.log(`✅ Видео от ${userId} загружено`);
                video.play().catch(e => console.log(`⚠️ Автовоспроизведение ${userId}:`, e));
            };
            
            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            overlay.innerHTML = `
                <div class="avatar">У</div>
                <span>Участник</span>
                <span style="margin-left: auto; font-size: 12px;">
                    ${hasAudio ? '🔊' : '🔇'}
                </span>
            `;
            
            videoContainer.appendChild(video);
            videoContainer.appendChild(overlay);
            
        } else {
            // Заглушка если нет видео
            videoContainer.style.background = '#34a853';
            videoContainer.style.display = 'flex';
            videoContainer.style.alignItems = 'center';
            videoContainer.style.justifyContent = 'center';
            
            videoContainer.innerHTML = `
                <div style="text-align: center; color: white; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">👤</div>
                    <div style="font-weight: bold; margin-bottom: 8px;">Участник</div>
                    <div style="font-size: 12px; opacity: 0.8;">
                        ${hasAudio ? 'Только аудио' : 'Нет медиа'}
                    </div>
                </div>
            `;
        }
        
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.appendChild(videoContainer);
            this.scrollToBottom();
        }
        
        // Обновляем счетчик участников
        this.updateParticipantCount();
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
        
        // Обновляем счетчик
        this.updateParticipantCount();
    }
    
    updateParticipantCount() {
        const countElement = document.getElementById('participantCount');
        if (countElement) {
            // Считаем все видео контейнеры кроме локального
            const remoteCount = document.querySelectorAll('.video-container:not(#local-video-container)').length;
            const totalCount = 1 + remoteCount; // 1 для себя
            countElement.textContent = totalCount;
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
        this.addSystemMessage(`Добро пожаловать в комнату ${this.roomId}`);
        this.addSystemMessage(`Ваше имя: ${this.userName}`);
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
            
            this.updateParticipantCount();
            
        }, 1000);
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
                    this.addSystemMessage('Микрофон включен');
                } else {
                    icon.className = 'fas fa-microphone-slash';
                    text.textContent = 'Вкл';
                    btn.classList.remove('active');
                    this.addSystemMessage('Микрофон выключен');
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
                    this.addSystemMessage('Камера включена');
                } else {
                    icon.className = 'fas fa-video-slash';
                    text.textContent = 'Вкл';
                    btn.classList.remove('active');
                    this.addSystemMessage('Камера выключена');
                }
            }
        }
    }
    
    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                console.log('🖥️ Начало демонстрации экрана...');
                this.addSystemMessage('Начинаю демонстрацию экрана...');
                
                // Простой запрос на демонстрацию экрана
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always'
                    }
                });
                
                console.log('✅ Демонстрация экрана начата');
                this.addSystemMessage('Демонстрация экрана начата');
                
                // Получаем видеотрек с экрана
                const screenTrack = this.screenStream.getVideoTracks()[0];
                
                // Обновляем локальное видео
                const localVideo = document.querySelector('#local-video-container video');
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
            if (error.name !== 'NotAllowedError') {
                this.addSystemMessage('Не удалось начать демонстрацию экрана');
            }
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
        
        this.addSystemMessage('Демонстрация экрана остановлена');
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.roomId && this.socket) {
            // Отправляем на сервер
            this.socket.emit('chat-message', {
                roomId: this.roomId,
                userName: this.userName,
                message: message
            });
            
            // Локально добавляем свое сообщение
            this.addChatMessage(this.userName, message, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), true);
            
            // Очищаем поле ввода
            input.value = '';
            input.focus();
        }
    }
    
    addChatMessage(userName, message, timestamp, isOwn = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `
            <strong>${userName}:</strong> ${message}
            <div style="font-size: 10px; color: #666; margin-top: 2px; text-align: ${isOwn ? 'right' : 'left'};">${timestamp}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        this.scrollChatToBottom();
        
        // Сохраняем в историю
        this.chatMessages.push({ userName, message, timestamp, isOwn });
    }
    
    addSystemMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.innerHTML = `<strong>Система:</strong> ${message}`;
        
        chatMessages.appendChild(messageDiv);
        this.scrollChatToBottom();
    }
    
    clearChat() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages && confirm('Очистить всю историю чата?')) {
            chatMessages.innerHTML = '';
            this.chatMessages = [];
            this.addSystemMessage('Чат очищен');
        }
    }
    
    toggleChat() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const isVisible = sidebar.style.display !== 'none';
            sidebar.style.display = isVisible ? 'none' : 'block';
            
            const btn = document.getElementById('toggleChatBtn');
            if (btn) {
                btn.classList.toggle('active', !isVisible);
                btn.querySelector('span').textContent = isVisible ? 'Чат' : 'Скрыть';
            }
        }
    }
    
    toggleParticipantsList() {
        // В мобильной версии можно показать список участников
        alert(`Участников в комнате: ${1 + this.peers.size}\n\nВы + ${this.peers.size} других участников`);
    }
    
    scrollToBottom() {
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            setTimeout(() => {
                videoGrid.scrollTop = videoGrid.scrollHeight;
            }, 100);
        }
    }
    
    scrollChatToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 50);
        }
    }
    
    copyRoomLink() {
        if (this.roomId) {
            const link = `${window.location.origin}/?room=${this.roomId}`;
            navigator.clipboard.writeText(link).then(() => {
                this.addSystemMessage(`Ссылка скопирована: ${this.roomId}`);
                alert(`Ссылка на комнату скопирована!\n\nКод комнаты: ${this.roomId}\n\nОтправьте его другим участникам.`);
            }).catch(() => {
                // Fallback для старых браузеров
                const textArea = document.createElement('textarea');
                textArea.value = link;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.addSystemMessage(`Ссылка скопирована: ${this.roomId}`);
            });
        }
    }
    
    leaveRoom() {
        if (confirm('Покинуть комнату?')) {
            console.log('🚪 Выход из комнаты');
            this.addSystemMessage('Выход из комнаты...');
            
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
            
            // Уведомляем сервер
            if (this.socket && this.roomId) {
                this.socket.emit('leave-room', {
                    roomId: this.roomId,
                    userId: this.userId
                });
            }
            
            // Перезагружаем страницу
            setTimeout(() => {
                location.reload();
            }, 500);
        }
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, запуск приложения');
    window.videoChat = new SimpleVideoChat();
    
    // Проверяем параметры URL для автоматического присоединения
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const nameParam = urlParams.get('name');
    
    if (roomParam) {
        setTimeout(() => {
            const userName = nameParam || 'Участник';
            document.getElementById('userName').value = userName;
            document.getElementById('roomCode').value = roomParam;
            document.getElementById('showJoinFormBtn').click();
            setTimeout(() => {
                document.getElementById('confirmJoinBtn').click();
            }, 500);
        }, 1000);
    }
    
    // Для отладки
    console.log('ℹ️ Для отладки используйте window.videoChat');
    console.log('🔧 Проверьте что браузер запрашивает доступ к камере/микрофону');
});
