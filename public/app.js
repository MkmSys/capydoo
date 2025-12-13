class VideoMeetApp {
    constructor() {
        this.socket = null;
        this.userId = this.generateId();
        this.userName = 'Участник';
        this.meetingId = null;
        this.isHost = false;
        this.participants = new Map();
        this.localStream = null;
        this.peers = new Map();
        this.startTime = null;
        this.timerInterval = null;
        
        this.init();
    }
    
    generateId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    
    init() {
        this.bindEvents();
        this.initSocket();
    }
    
    bindEvents() {
        // Вкладки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.tab + 'Tab').classList.add('active');
            });
        });
        
        // Создание встречи
        document.getElementById('createMeetingBtn').addEventListener('click', () => {
            this.userName = document.getElementById('hostName').value || 'Ведущий';
            this.createMeeting();
        });
        
        // Присоединение к встрече
        document.getElementById('joinMeetingBtn').addEventListener('click', () => {
            this.userName = document.getElementById('userName').value || 'Участник';
            const code = document.getElementById('meetingCode').value;
            if (code) {
                this.joinMeeting(code);
            } else {
                alert('Введите код встречи');
            }
        });
        
        // Управление медиа
        document.getElementById('toggleMicBtn').addEventListener('click', () => this.toggleMic());
        document.getElementById('toggleCamBtn').addEventListener('click', () => this.toggleCam());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.toggleScreenShare());
        
        // Чат
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Управление интерфейсом
        document.getElementById('toggleChatBtn').addEventListener('click', () => this.toggleChat());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyMeetingLink());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveMeeting());
        
        // Приглашение
        document.getElementById('copyInviteLink').addEventListener('click', () => this.copyInviteLink());
        document.getElementById('closeInviteModal').addEventListener('click', () => {
            document.getElementById('inviteModal').classList.remove('show');
        });
        
        // Полный экран
        document.getElementById('toggleFullscreen').addEventListener('click', () => this.toggleFullscreen());
        
        // Горячие клавиши
        document.addEventListener('keydown', (e) => this.handleHotkeys(e));
    }
    
    initSocket() {
        // Подключаемся к серверу
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Подключено к серверу с ID:', this.socket.id);
        });
        
        this.socket.on('meeting-created', (data) => {
            this.meetingId = data.meetingId;
            this.isHost = true;
            this.showMeetingRoom();
            this.startTimer();
            this.requestMediaAccess();
        });
        
        this.socket.on('user-joined', (data) => {
            this.addParticipant(data.user);
            this.addSystemMessage(`${data.user.name} присоединился`);
            this.updateParticipantCount();
        });
        
        this.socket.on('user-left', (data) => {
            this.removeParticipant(data.userId);
            const user = this.participants.get(data.userId);
            if (user) {
                this.addSystemMessage(`${user.name} вышел`);
            }
            this.updateParticipantCount();
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.user, data.message, data.timestamp, false);
        });
        
        this.socket.on('meeting-ended', () => {
            alert('Владелец завершил встречу');
            this.leaveMeeting();
        });
        
        this.socket.on('participants-list', (participants) => {
            this.participants.clear();
            participants.forEach(p => {
                this.participants.set(p.id, p);
                this.addParticipantToUI(p);
            });
            this.updateParticipantCount();
        });
        
        // WebRTC события
        this.socket.on('offer', this.handleOffer.bind(this));
        this.socket.on('answer', this.handleAnswer.bind(this));
        this.socket.on('ice-candidate', this.handleIceCandidate.bind(this));
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
            console.error('Ошибка создания встречи:', error);
            alert('Не удалось создать встречу');
        }
    }
    
    async joinMeeting(code) {
        try {
            const response = await fetch(`/api/meetings/${code}`);
            
            if (response.ok) {
                const data = await response.json();
                this.meetingId = data.meetingId;
                
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
                alert('Встреча не найдена');
            }
        } catch (error) {
            console.error('Ошибка присоединения:', error);
            alert('Не удалось присоединиться');
        }
    }
    
    async requestMediaAccess() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            this.addLocalVideo();
            this.setupMediaControls();
            
            // Уведомляем других участников о нашем подключении
            this.socket.emit('media-ready', {
                meetingId: this.meetingId,
                userId: this.userId
            });
            
        } catch (error) {
            console.error('Ошибка доступа к медиа:', error);
            this.addSystemMessage('Не удалось получить доступ к камере/микрофону');
        }
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
            videoElement.srcObject = this.localStream;
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
        if (user.id !== this.userId && !this.participants.has(user.id)) {
            this.participants.set(user.id, user);
            this.addParticipantToUI(user);
            
            // Инициируем WebRTC соединение
            if (this.localStream) {
                this.createPeerConnection(user.id);
            }
        }
    }
    
    addParticipantToUI(user) {
        const participantsList = document.getElementById('participantsList');
        
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
                <i class="fas fa-circle ${user.isHost ? 'text-success' : 'text-primary'}"></i>
            </div>
        `;
        
        participantsList.appendChild(li);
    }
    
    removeParticipant(userId) {
        this.participants.delete(userId);
        
        // Удаляем из UI
        const participantEl = document.getElementById(`participant-${userId}`);
        if (participantEl) participantEl.remove();
        
        const videoEl = document.getElementById(`video-${userId}`);
        if (videoEl) videoEl.remove();
        
        // Закрываем WebRTC соединение
        if (this.peers.has(userId)) {
            this.peers.get(userId).close();
            this.peers.delete(userId);
        }
        
        // Если видео больше нет, показываем пустое состояние
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        if (videoGrid.children.length === 0 && emptyState) {
            emptyState.style.display = 'block';
        }
    }
    
    updateParticipantCount() {
        const count = this.participants.size + 1; // +1 для себя
        document.getElementById('participantCount').textContent = count;
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
    
    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                
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
                        const sender = peer.getSenders().find(s => s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    }
                });
                
                this.screenStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenShare();
                };
                
            } else {
                this.stopScreenShare();
            }
        } catch (error) {
            console.error('Ошибка демонстрации экрана:', error);
        }
    }
    
    stopScreenShare() {
        if (this.screenStream) {
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
                        const sender = peer.getSenders().find(s => s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    }
                });
            }
        }
    }
    
    setupMediaControls() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            const videoTrack = this.localStream.getVideoTracks()[0];
            
            if (audioTrack) {
                audioTrack.onmute = () => {
                    document.getElementById(`audio-${this.userId}`).classList.remove('hidden');
                };
                audioTrack.onunmute = () => {
                    document.getElementById(`audio-${this.userId}`).classList.add('hidden');
                };
            }
        }
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.socket) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            this.socket.emit('chat-message', {
                meetingId: this.meetingId,
                message: message,
                timestamp: timestamp
            });
            
            this.addChatMessage(this.userName, message, timestamp, true);
            input.value = '';
        }
    }
    
    addChatMessage(userName, message, timestamp, isOwn = false) {
        const chatMessages = document.getElementById('chatMessages');
        
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
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-system';
        messageDiv.textContent = message;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    showMeetingRoom() {
        document.getElementById('joinModal').classList.remove('show');
        document.getElementById('meetingRoom').classList.remove('hidden');
        
        document.getElementById('currentMeetingId').textContent = this.meetingId;
        document.getElementById('meetingCodeDisplay').textContent = this.meetingId;
        document.getElementById('meetingLink').value = `${window.location.origin}/join/${this.meetingId}`;
        
        // Добавляем себя в список участников
        this.addParticipantToUI({
            id: this.userId,
            name: this.userName,
            isHost: this.isHost
        });
        
        // Добавляем системное сообщение
        this.addSystemMessage(`Вы ${this.isHost ? 'создали' : 'присоединились к'} встрече`);
    }
    
    showInviteModal() {
        document.getElementById('inviteModal').classList.add('show');
    }
    
    copyMeetingLink() {
        const link = `${window.location.origin}/join/${this.meetingId}`;
        this.copyToClipboard(link, 'Ссылка скопирована');
    }
    
    copyInviteLink() {
        const linkInput = document.getElementById('meetingLink');
        linkInput.select();
        this.copyToClipboard(linkInput.value, 'Ссылка скопирована в буфер');
    }
    
    copyToClipboard(text, message) {
        navigator.clipboard.writeText(text).then(() => {
            alert(message);
        }).catch(err => {
            console.error('Ошибка копирования:', err);
        });
    }
    
    startTimer() {
        this.startTime = new Date();
        
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
            
            document.getElementById('timer').textContent = timeString;
        }, 1000);
    }
    
    toggleChat() {
        const chatPanel = document.querySelector('.panel:nth-child(2)');
        const isVisible = chatPanel.style.display !== 'none';
        chatPanel.style.display = isVisible ? 'none' : 'block';
        
        const btn = document.getElementById('toggleChatBtn');
        btn.classList.toggle('active', !isVisible);
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
        if (e.ctrlKey) {
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
            // Останавливаем все медиа потоки
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            // Закрываем все WebRTC соединения
            this.peers.forEach(peer => peer.close());
            
            // Отправляем уведомление серверу
            if (this.socket) {
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
            location.reload();
        }
    }
    
    // WebRTC методы
    createPeerConnection(targetUserId) {
        if (this.peers.has(targetUserId)) return;
        
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
            const stream = event.streams[0];
            this.addRemoteVideo(targetUserId, stream);
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
        
        // Если мы хост, создаем оффер
        if (this.isHost) {
            peer.createOffer()
                .then(offer => peer.setLocalDescription(offer))
                .then(() => {
                    this.socket.emit('offer', {
                        meetingId: this.meetingId,
                        targetUserId: targetUserId,
                        offer: peer.localDescription
                    });
                });
        }
    }
    
    addRemoteVideo(userId, stream) {
        let videoItem = document.getElementById(`video-${userId}`);
        
        if (!videoItem) {
            const user = this.participants.get(userId);
            if (user) {
                videoItem = this.createVideoElement(userId, user.name, false);
                document.getElementById('videoGrid').appendChild(videoItem);
            }
        }
        
        if (videoItem) {
            const video = videoItem.querySelector('video');
            video.srcObject = stream;
        }
    }
    
    handleOffer(data) {
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
            const stream = event.streams[0];
            this.addRemoteVideo(data.senderId, stream);
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
                this.socket.emit('answer', {
                    meetingId: this.meetingId,
                    targetUserId: data.senderId,
                    answer: peer.localDescription
                });
            });
        
        this.peers.set(data.senderId, peer);
    }
    
    handleAnswer(data) {
        const peer = this.peers.get(data.senderId);
        if (peer) {
            peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }
    
    handleIceCandidate(data) {
        const peer = this.peers.get(data.senderId);
        if (peer) {
            peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoMeetApp();
});