class VideoMeetApp {
    constructor() {
        this.socket = io();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        this.userName = 'Участник';
        this.meetingId = null;
        this.localStream = null;
        this.screenStream = null;
        this.peers = new Map();
        this.startTime = null;
        this.timerInterval = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.setupSocketListeners();
    }
    
    bindEvents() {
        console.log('Инициализация обработчиков событий...');
        
        // Вкладки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                const tabId = e.target.dataset.tab + 'Tab';
                const tabElement = document.getElementById(tabId);
                if (tabElement) {
                    tabElement.classList.add('active');
                }
            });
        });
        
        // Создание встречи
        const createBtn = document.getElementById('createMeetingBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const nameInput = document.getElementById('hostName');
                this.userName = nameInput ? nameInput.value || 'Ведущий' : 'Ведущий';
                this.createMeeting();
            });
        }
        
        // Присоединение к встрече
        const joinBtn = document.getElementById('joinMeetingBtn');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                const nameInput = document.getElementById('userName');
                this.userName = nameInput ? nameInput.value || 'Участник' : 'Участник';
                const codeInput = document.getElementById('meetingCode');
                const code = codeInput ? codeInput.value : '';
                
                if (code) {
                    this.joinMeeting(code);
                } else {
                    alert('Введите код встречи');
                }
            });
        }
        
        // Управление медиа
        this.setupMediaControls();
        
        // Чат
        const sendChatBtn = document.getElementById('sendChatBtn');
        if (sendChatBtn) {
            sendChatBtn.addEventListener('click', () => this.sendMessage());
        }
        
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
        
        // Управление интерфейсом
        const inviteBtn = document.getElementById('inviteBtn');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => this.showInviteModal());
        }
        
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => this.copyMeetingLink());
        }
        
        const leaveBtn = document.getElementById('leaveBtn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => this.leaveMeeting());
        }
        
        // Модальное окно приглашения
        this.setupInviteModal();
        
        // Полный экран
        const fullscreenBtn = document.getElementById('toggleFullscreen');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }
        
        // Горячие клавиши
        document.addEventListener('keydown', (e) => this.handleHotkeys(e));
        
        console.log('Обработчики событий инициализированы');
    }
    
    setupMediaControls() {
        const toggleMicBtn = document.getElementById('toggleMicBtn');
        if (toggleMicBtn) {
            toggleMicBtn.addEventListener('click', () => this.toggleMic());
        }
        
        const toggleCamBtn = document.getElementById('toggleCamBtn');
        if (toggleCamBtn) {
            toggleCamBtn.addEventListener('click', () => this.toggleCam());
        }
        
        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) {
            screenShareBtn.addEventListener('click', () => this.toggleScreenShare());
        }
        
        const toggleChatBtn = document.getElementById('toggleChatBtn');
        if (toggleChatBtn) {
            toggleChatBtn.addEventListener('click', () => this.toggleChat());
        }
    }
    
    setupInviteModal() {
        // Кнопка закрытия модального окна
        const closeBtn = document.getElementById('closeInviteModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Кнопка закрытия нажата');
                this.hideInviteModal();
            });
        }
        
        // Копирование ссылки
        const copyInviteLinkBtn = document.getElementById('copyInviteLink');
        if (copyInviteLinkBtn) {
            copyInviteLinkBtn.addEventListener('click', () => this.copyInviteLink());
        }
        
        // Закрытие по клику вне модального окна
        const inviteModal = document.getElementById('inviteModal');
        if (inviteModal) {
            inviteModal.addEventListener('click', (e) => {
                if (e.target.id === 'inviteModal') {
                    this.hideInviteModal();
                }
            });
        }
        
        // Закрытие по клавише Esc
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('inviteModal');
                if (modal && modal.classList.contains('show')) {
                    this.hideInviteModal();
                }
            }
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Подключено к серверу с ID:', this.socket.id);
        });
        
        this.socket.on('meeting-created', (data) => {
            console.log('Встреча создана:', data.meetingId);
            this.meetingId = data.meetingId;
            this.showMeetingRoom();
            this.startTimer();
            this.requestMediaAccess();
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('Пользователь присоединился:', data.user.name);
            this.addParticipant(data.user);
            this.addSystemMessage(`${data.user.name} присоединился`);
            this.updateParticipantCount();
        });
        
        this.socket.on('user-left', (data) => {
            console.log('Пользователь вышел:', data.userId);
            this.removeParticipant(data.userId);
            this.updateParticipantCount();
        });
        
        this.socket.on('chat-message', (data) => {
            console.log('Получено сообщение:', data);
            this.addChatMessage(data.user, data.message, data.timestamp, false);
        });
        
        this.socket.on('meeting-ended', () => {
            alert('Владелец завершил встречу');
            this.leaveMeeting();
        });
        
        this.socket.on('participants-list', (participants) => {
            console.log('Список участников:', participants);
            participants.forEach(p => {
                this.addParticipant(p);
            });
            this.updateParticipantCount();
        });
        
        // WebRTC события
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
        
        this.socket.on('error', (data) => {
            console.error('Ошибка сервера:', data.message);
            alert(data.message);
        });
    }
    
    async createMeeting() {
        try {
            console.log('Создание встречи для пользователя:', this.userName);
            
            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostId: this.userId,
                    hostName: this.userName
                })
            });
            
            const data = await response.json();
            console.log('Ответ сервера:', data);
            
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
            } else {
                alert('Не удалось создать встречу: ' + data.message);
            }
        } catch (error) {
            console.error('Ошибка создания встречи:', error);
            alert('Не удалось создать встречу. Проверьте подключение к серверу.');
        }
    }
    
    async joinMeeting(code) {
        try {
            console.log('Присоединение к встрече:', code);
            // Убираем все не буквы и цифры, оставляем только код
            const cleanCode = code.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase();
            
            const response = await fetch(`/api/meetings/${cleanCode}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Информация о встрече:', data);
                
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
                this.startTimer();
                this.requestMediaAccess();
            } else {
                const errorData = await response.json();
                alert(errorData.message || 'Встреча не найдена');
            }
        } catch (error) {
            console.error('Ошибка присоединения:', error);
            alert('Не удалось присоединиться. Проверьте подключение к серверу.');
        }
    }
    
    async requestMediaAccess() {
        try {
            console.log('Запрос доступа к медиа...');
            
            // Проверяем доступные устройства
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                console.log('Доступные устройства:', devices);
            } catch (err) {
                console.log('Не удалось перечислить устройства:', err);
            }
            
            // Пробуем получить медиа
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            console.log('Медиа доступ получен');
            this.addLocalVideo();
            this.setupMediaControls();
            
            // Уведомляем сервер
            this.socket.emit('media-ready', {
                meetingId: this.meetingId,
                userId: this.userId
            });
            
        } catch (error) {
            console.error('Ошибка доступа к медиа:', error);
            this.addSystemMessage('Камера/микрофон недоступны. Вы можете продолжить без видео.');
            
            // Создаем заглушку для видео
            this.createVideoPlaceholder();
        }
    }
    
    createVideoPlaceholder() {
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item placeholder';
        videoItem.id = `video-${this.userId}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'video-placeholder-avatar';
        avatar.textContent = this.userName.charAt(0).toUpperCase();
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const videoInfo = document.createElement('div');
        videoInfo.className = 'video-info';
        
        const name = document.createElement('span');
        name.textContent = this.userName + ' (Вы)';
        name.style.color = 'white';
        
        const status = document.createElement('span');
        status.className = 'video-status';
        status.textContent = 'Камера выключена';
        status.style.marginLeft = '10px';
        status.style.fontSize = '12px';
        status.style.opacity = '0.8';
        
        videoInfo.appendChild(name);
        videoInfo.appendChild(status);
        overlay.appendChild(videoInfo);
        videoItem.appendChild(avatar);
        videoItem.appendChild(overlay);
        
        videoGrid.appendChild(videoItem);
    }
    
    addLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Проверяем, не добавлено ли уже наше видео
        if (!document.getElementById(`video-${this.userId}`)) {
            const videoItem = this.createVideoElement(this.userId, this.userName, true);
            videoGrid.appendChild(videoItem);
            
            // Обновляем поток
            const videoElement = videoItem.querySelector('video');
            if (videoElement && this.localStream) {
                videoElement.srcObject = this.localStream;
            }
        }
    }
    
    createVideoElement(userId, userName, isLocal = false) {
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.id = `video-${userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        if (isLocal) video.muted = true;
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const videoInfo = document.createElement('div');
        videoInfo.className = 'video-info';
        
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        avatar.textContent = userName.charAt(0).toUpperCase();
        
        const name = document.createElement('span');
        name.textContent = userName + (isLocal ? ' (Вы)' : '');
        
        const audioIndicator = document.createElement('span');
        audioIndicator.className = 'video-muted hidden';
        audioIndicator.textContent = 'Без звука';
        audioIndicator.id = `audio-${userId}`;
        
        videoInfo.appendChild(avatar);
        videoInfo.appendChild(name);
        videoInfo.appendChild(audioIndicator);
        
        overlay.appendChild(videoInfo);
        videoItem.appendChild(video);
        videoItem.appendChild(overlay);
        
        return videoItem;
    }
    
    addParticipant(user) {
        if (user.id !== this.userId) {
            console.log('Добавление участника:', user.name);
            
            const videoGrid = document.getElementById('videoGrid');
            const emptyState = document.getElementById('emptyState');
            
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            // Проверяем, не добавлен ли уже участник
            if (!document.getElementById(`video-${user.id}`)) {
                const videoItem = this.createVideoElement(user.id, user.name, false);
                videoGrid.appendChild(videoItem);
                
                // Инициируем WebRTC соединение
                if (this.localStream) {
                    this.createPeerConnection(user.id);
                }
            }
            
            // Добавляем в список участников
            this.addParticipantToList(user);
        }
    }
    
    addParticipantToList(user) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;
        
        // Проверяем, не добавлен ли уже
        if (!document.getElementById(`participant-${user.id}`)) {
            const li = document.createElement('li');
            li.className = 'participant';
            li.id = `participant-${user.id}`;
            
            li.innerHTML = `
                <div class="participant-info">
                    <div class="participant-avatar">${user.name.charAt(0).toUpperCase()}</div>
                    <span>${user.name}</span>
                    ${user.isHost ? '<span class="participant-host">Ведущий</span>' : ''}
                </div>
                <div class="participant-status">
                    <i class="fas fa-circle text-primary"></i>
                </div>
            `;
            
            participantsList.appendChild(li);
        }
    }
    
    removeParticipant(userId) {
        console.log('Удаление участника:', userId);
        
        // Удаляем видео
        const videoEl = document.getElementById(`video-${userId}`);
        if (videoEl) videoEl.remove();
        
        // Удаляем из списка
        const participantEl = document.getElementById(`participant-${userId}`);
        if (participantEl) participantEl.remove();
        
        // Закрываем WebRTC соединение
        if (this.peers.has(userId)) {
            this.peers.get(userId).close();
            this.peers.delete(userId);
        }
        
        // Если видео больше нет, показываем пустое состояние
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        if (videoGrid && emptyState && videoGrid.children.length === 0) {
            emptyState.style.display = 'block';
        }
    }
    
    updateParticipantCount() {
        const participantCount = document.getElementById('participantCount');
        if (participantCount) {
            const participantsList = document.getElementById('participantsList');
            const count = participantsList ? participantsList.children.length + 1 : 1;
            participantCount.textContent = count;
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
                } else {
                    icon.className = 'fas fa-microphone-slash';
                    text.textContent = 'Вкл. звук';
                    btn.classList.remove('active');
                }
                
                // Обновляем индикатор на видео
                const indicator = document.getElementById(`audio-${this.userId}`);
                if (indicator) {
                    indicator.classList.toggle('hidden', audioTrack.enabled);
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

    addRemoteVideo(userId, stream) {
    console.log(`➕ Добавление видео для ${userId}`, stream);
    
    // ПРОВЕРКА: есть ли видеопоток
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    console.log(`📊 Статистика потока ${userId}:`);
    console.log('- Видео треков:', videoTracks.length);
    console.log('- Аудио треков:', audioTracks.length);
    
    if (videoTracks.length === 0) {
        console.log('⚠️ У участника нет видео, показываем заглушку');
        this.addVideoPlaceholder(userId);
        return;
    }
    
    // Удаляем старый элемент если есть
    const oldVideo = document.getElementById(`remote-video-${userId}`);
    if (oldVideo) oldVideo.remove();
    
    // Создаем контейнер для видео
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-item';
    videoContainer.id = `remote-video-${userId}`;
    
    // Создаем видео элемент
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false; // Звук включен для удаленных участников
    
    // Назначаем поток
    video.srcObject = stream;
    
    // Обработка ошибок видео
    video.onerror = (e) => {
        console.error(`❌ Ошибка видео элемента ${userId}:`, e);
    };
    
    video.onloadedmetadata = () => {
        console.log(`✅ Видео метаданные загружены для ${userId}`);
        video.play().catch(e => console.log(`⚠️ Автовоспроизведение не сработало: ${e}`));
    };
    
    // Получаем имя пользователя
    let userName = 'Участник';
    // Можно получить из participantsList или из данных сокета
    
    // Создаем оверлей с информацией
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.innerHTML = `
        <div class="video-info">
            <div class="participant-avatar">${userName.charAt(0)}</div>
            <span>${userName}</span>
            <span class="video-status" id="remote-audio-${userId}">🔊</span>
        </div>
    `;
    
    // Собираем все вместе
    videoContainer.appendChild(video);
    videoContainer.appendChild(overlay);
    
    // Добавляем в сетку видео
    const videoGrid = document.getElementById('videoGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    if (videoGrid) {
        videoGrid.appendChild(videoContainer);
        console.log(`✅ Видео добавлено в сетку для ${userId}`);
    }
    
    // Обновляем статус аудио
    if (audioTracks.length > 0 && audioTracks[0].enabled) {
        document.getElementById(`remote-audio-${userId}`).textContent = '🔊';
    } else {
        document.getElementById(`remote-audio-${userId}`).textContent = '🔇';
    }
}

    addRemoteVideo(userId, stream) {
    console.log(`➕ Добавление видео для ${userId}`, stream.getTracks());
    
    // Проверяем есть ли видеотреки
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log('Видео треки:', videoTracks.length, 'Аудио треки:', audioTracks.length);
    
    if (videoTracks.length === 0) {
        console.log('⚠️ У удаленного пользователя нет видео');
        // Показываем заглушку
        this.addVideoPlaceholder(userId, 'Участник');
        return;
    }
    
    // ... остальной код создания видео элемента
    }

    addVideoPlaceholder(userId, name = 'Участник') {
        console.log(`🖼️ Создание заглушки для ${userId}`);
    
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;
    
         // Удаляем старый элемент
         const oldElement = document.getElementById(`remote-video-${userId}`);
         if (oldElement) oldElement.remove();
    
        const placeholder = document.createElement('div');
        placeholder.className = 'video-item placeholder';
        placeholder.id = `remote-video-${userId}`;
    
        placeholder.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%;">
                <div style="text-align: center; color: white;">
                    <div style="width: 80px; height: 80px; background: white; border-radius: 50%; 
                                display: flex; align-items: center; justify-content: center; 
                                margin: 0 auto 15px; font-size: 32px; color: #1a73e8; font-weight: bold;">
                        ${name.charAt(0).toUpperCase()}
                    </div>
                    <div style="font-weight: bold; margin-bottom: 5px;">${name}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Камера выключена</div>
                </div>
            </div>
        `;
    
        videoGrid.appendChild(placeholder);
    }
    
    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                console.log('Начало демонстрации экрана...');
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: "always"
                    },
                    audio: true
                });
                
                console.log('Экран захвачен');
                const btn = document.getElementById('screenShareBtn');
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-stop';
                btn.querySelector('span').textContent = 'Стоп';
                
                // Обновляем локальное видео на экран
                const localVideo = document.querySelector(`#video-${this.userId} video`);
                if (localVideo) {
                    localVideo.srcObject = this.screenStream;
                }
                
                // Обновляем поток у всех пиров
                this.peers.forEach(peer => {
                    const videoTrack = this.screenStream.getVideoTracks()[0];
                    if (videoTrack) {
                        const sender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    }
                });
                
                this.screenStream.getVideoTracks()[0].onended = () => {
                    console.log('Демонстрация экрана завершена');
                    this.stopScreenShare();
                };
                
            } else {
                this.stopScreenShare();
            }
        } catch (error) {
            console.error('Ошибка демонстрации экрана:', error);
            if (error.name !== 'NotAllowedError') {
                alert('Не удалось начать демонстрацию экрана');
            }
        }
    }
    
    stopScreenShare() {
        if (this.screenStream) {
            console.log('Остановка демонстрации экрана');
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
            
            const btn = document.getElementById('screenShareBtn');
            btn.classList.remove('active');
            btn.querySelector('i').className = 'fas fa-desktop';
            btn.querySelector('span').textContent = 'Экран';
            
            // Возвращаем камеру
            if (this.localStream) {
                const localVideo = document.querySelector(`#video-${this.userId} video`);
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                }
                
                // Возвращаем поток у всех пиров
                this.peers.forEach(peer => {
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    if (videoTrack) {
                        const sender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    }
                });
            }
        }
    }
    
    createPeerConnection(targetUserId) {
        console.log('Создание соединения с:', targetUserId);
        
        if (this.peers.has(targetUserId)) {
            console.log('Соединение уже существует');
            return;
        }
        
        const peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Добавляем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peer.addTrack(track, this.localStream);
            });
        }
        
        // Обработка входящего потока
        peer.ontrack = (event) => {
            console.log('Получен поток от:', targetUserId);
            const stream = event.streams[0];
            const video = document.querySelector(`#video-${targetUserId} video`);
            if (video) {
                video.srcObject = stream;
            }
        };
        
        // ICE кандидаты
        peer.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    meetingId: this.meetingId,
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        this.peers.set(targetUserId, peer);
        
        // Создаем оффер
        peer.createOffer()
            .then(offer => peer.setLocalDescription(offer))
            .then(() => {
                console.log('Отправка оффера для:', targetUserId);
                this.socket.emit('offer', {
                    meetingId: this.meetingId,
                    targetUserId: targetUserId,
                    offer: peer.localDescription
                });
            })
            .catch(error => {
                console.error('Ошибка создания оффера:', error);
            });
    }
    
    handleOffer(data) {
        console.log('Получен оффер от:', data.senderId);
        
        const peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Добавляем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peer.addTrack(track, this.localStream);
            });
        }
        
        peer.ontrack = (event) => {
            console.log('Получен поток от:', data.senderId);
            const stream = event.streams[0];
            const video = document.querySelector(`#video-${data.senderId} video`);
            if (video) {
                video.srcObject = stream;
            }
        };
        
        peer.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    meetingId: this.meetingId,
                    targetUserId: data.senderId,
                    candidate: event.candidate
                });
            }
        };
        
        peer.setRemoteDescription(new RTCSessionDescription(data.offer))
            .then(() => peer.createAnswer())
            .then(answer => peer.setLocalDescription(answer))
            .then(() => {
                console.log('Отправка ответа для:', data.senderId);
                this.socket.emit('answer', {
                    meetingId: this.meetingId,
                    targetUserId: data.senderId,
                    answer: peer.localDescription
                });
            })
            .catch(error => {
                console.error('Ошибка обработки оффера:', error);
            });
        
        this.peers.set(data.senderId, peer);
    }
    
    handleAnswer(data) {
        console.log('Получен ответ от:', data.senderId);
        
        const peer = this.peers.get(data.senderId);
        if (peer) {
            peer.setRemoteDescription(new RTCSessionDescription(data.answer))
                .catch(error => {
                    console.error('Ошибка установки удаленного описания:', error);
                });
        }
    }
    
    handleIceCandidate(data) {
        console.log('Получен ICE кандидат от:', data.senderId);
        
        const peer = this.peers.get(data.senderId);
        if (peer) {
            peer.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(error => {
                    console.error('Ошибка добавления ICE кандидата:', error);
                });
        }
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input ? input.value.trim() : '';
        
        if (message && this.socket && this.meetingId) {
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
    
    showMeetingRoom() {
        console.log('Показать комнату встречи');
        
        const joinModal = document.getElementById('joinModal');
        const meetingRoom = document.getElementById('meetingRoom');
        
        if (joinModal) joinModal.classList.remove('show');
        if (meetingRoom) meetingRoom.classList.remove('hidden');
        
        // Обновляем информацию о встрече
        const currentMeetingId = document.getElementById('currentMeetingId');
        const meetingCodeDisplay = document.getElementById('meetingCodeDisplay');
        const meetingLink = document.getElementById('meetingLink');
        
        if (currentMeetingId) currentMeetingId.textContent = this.meetingId;
        if (meetingCodeDisplay) meetingCodeDisplay.textContent = this.meetingId;
        if (meetingLink) {
            meetingLink.value = `${window.location.origin}/join/${this.meetingId}`;
        }
        
        // Добавляем системное сообщение
        this.addSystemMessage(`Вы присоединились к встрече ${this.meetingId}`);
    }
    
    showInviteModal() {
        console.log('Показать модальное окно приглашения');
        const modal = document.getElementById('inviteModal');
        if (modal) {
            modal.classList.add('show');
            
            // Обновляем данные
            const meetingCodeDisplay = document.getElementById('meetingCodeDisplay');
            const meetingLink = document.getElementById('meetingLink');
            
            if (meetingCodeDisplay) {
                meetingCodeDisplay.textContent = this.meetingId || 'XXXX-XXXX';
            }
            if (meetingLink) {
                meetingLink.value = this.meetingId ? 
                    `${window.location.origin}/join/${this.meetingId}` : 
                    `${window.location.origin}/join/XXXX-XXXX`;
            }
        }
    }
    
    hideInviteModal() {
        console.log('Скрыть модальное окно приглашения');
        const modal = document.getElementById('inviteModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }
    
    copyMeetingLink() {
        if (this.meetingId) {
            const link = `${window.location.origin}/join/${this.meetingId}`;
            this.copyToClipboard(link, 'Ссылка на встречу скопирована');
        } else {
            alert('Сначала создайте или присоединитесь к встрече');
        }
    }
    
    copyInviteLink() {
        const linkInput = document.getElementById('meetingLink');
        if (linkInput && linkInput.value) {
            this.copyToClipboard(linkInput.value, 'Ссылка скопирована в буфер обмена');
        }
    }
    
    copyToClipboard(text, message) {
        navigator.clipboard.writeText(text).then(() => {
            alert(message);
        }).catch(err => {
            console.error('Ошибка копирования:', err);
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert(message);
            } catch (err) {
                console.error('Fallback copy failed:', err);
                alert('Не удалось скопировать. Скопируйте вручную: ' + text);
            }
            document.body.removeChild(textArea);
        });
    }
    
    startTimer() {
        this.startTime = new Date();
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - this.startTime;
            
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            
            let timeString = '';
            if (hours > 0) {
                timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = timeString;
            }
        }, 1000);
    }
    
    toggleChat() {
        const chatPanel = document.querySelector('.panel:nth-child(2)');
        if (chatPanel) {
            const isVisible = chatPanel.style.display !== 'none';
            chatPanel.style.display = isVisible ? 'none' : 'block';
            
            const btn = document.getElementById('toggleChatBtn');
            if (btn) {
                btn.classList.toggle('active', !isVisible);
            }
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Ошибка полноэкранного режима:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    handleHotkeys(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'm':
                    e.preventDefault();
                    this.toggleMic();
                    break;
                case 'e':
                    e.preventDefault();
                    this.toggleCam();
                    break;
                case 's':
                    e.preventDefault();
                    this.toggleScreenShare();
                    break;
                case 't':
                    e.preventDefault();
                    this.toggleChat();
                    break;
            }
        }
    }
    
    leaveMeeting() {
        if (confirm('Покинуть встречу?')) {
            console.log('Покидание встречи');
            
            // Останавливаем все медиа потоки
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Закрываем все WebRTC соединения
            this.peers.forEach(peer => peer.close());
            this.peers.clear();
            
            // Отправляем уведомление серверу
            if (this.socket && this.meetingId) {
                this.socket.emit('leave-meeting', {
                    meetingId: this.meetingId,
                    userId: this.userId
                });
            }
            
            // Останавливаем таймер
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // Перезагружаем страницу
            setTimeout(() => {
                location.reload();
            }, 100);
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация приложения...');
    window.app = new VideoMeetApp();
});
