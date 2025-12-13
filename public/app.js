class VideoMeetApp {
    constructor() {
        this.socket = io();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        this.userName = 'Участник';
        this.meetingId = null;
        this.localStream = null;
        this.peers = new Map();
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.setupSocketListeners();
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
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyMeetingLink());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveMeeting());
        
        // Приглашение
        document.getElementById('copyInviteLink').addEventListener('click', () => this.copyInviteLink());
        document.getElementById('closeInviteModal').addEventListener('click', () => {
            document.getElementById('inviteModal').classList.remove('show');
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Подключено к серверу');
        });
        
        this.socket.on('meeting-created', (data) => {
            this.meetingId = data.meetingId;
            this.showMeetingRoom();
            this.requestMediaAccess();
        });
        
        this.socket.on('user-joined', (data) => {
            this.addParticipant(data.user);
            this.addSystemMessage(`${data.user.name} присоединился`);
        });
        
        this.socket.on('user-left', (data) => {
            this.removeParticipant(data.userId);
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.user, data.message, data.timestamp, false);
        });
        
        this.socket.on('participants-list', (participants) => {
            participants.forEach(p => this.addParticipant(p));
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
            // Убираем все не буквы и цифры, оставляем только код
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
            
            // Уведомляем сервер
            this.socket.emit('media-ready', {
                meetingId: this.meetingId,
                userId: this.userId
            });
            
        } catch (error) {
            console.error('Ошибка доступа к медиа:', error);
            this.addSystemMessage('Не удалось получить доступ к камере/микрофону');
            
            // Все равно показываем интерфейс, но без видео
            this.addLocalVideo();
        }
    }
    
    addLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.id = `video-${this.userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        if (this.localStream) {
            video.srcObject = this.localStream;
        } else {
            // Заглушка если нет доступа к камере
            video.style.backgroundColor = '#333';
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const videoInfo = document.createElement('div');
        videoInfo.className = 'video-info';
        
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        avatar.textContent = this.userName.charAt(0).toUpperCase();
        
        const name = document.createElement('span');
        name.textContent = this.userName + ' (Вы)';
        
        videoInfo.appendChild(avatar);
        videoInfo.appendChild(name);
        overlay.appendChild(videoInfo);
        videoItem.appendChild(video);
        videoItem.appendChild(overlay);
        
        videoGrid.appendChild(videoItem);
    }
    
    addParticipant(user) {
        if (user.id === this.userId) return;
        
        const videoGrid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.id = `video-${user.id}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const videoInfo = document.createElement('div');
        videoInfo.className = 'video-info';
        
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        avatar.textContent = user.name.charAt(0).toUpperCase();
        
        const name = document.createElement('span');
        name.textContent = user.name;
        
        videoInfo.appendChild(avatar);
        videoInfo.appendChild(name);
        overlay.appendChild(videoInfo);
        videoItem.appendChild(video);
        videoItem.appendChild(overlay);
        
        videoGrid.appendChild(videoItem);
        
        // Инициируем WebRTC соединение
        this.createPeerConnection(user.id);
    }
    
    removeParticipant(userId) {
        const videoEl = document.getElementById(`video-${userId}`);
        if (videoEl) videoEl.remove();
        
        // Закрываем WebRTC соединение
        if (this.peers.has(userId)) {
            this.peers.get(userId).close();
            this.peers.delete(userId);
        }
    }
    
    createPeerConnection(targetUserId) {
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
            const video = document.querySelector(`#video-${targetUserId} video`);
            if (video) {
                video.srcObject = stream;
            }
        };
        
        // ICE кандидаты
        peer.onicecandidate = (event) => {
            if (event.candidate) {
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
                this.socket.emit('offer', {
                    meetingId: this.meetingId,
                    targetUserId: targetUserId,
                    offer: peer.localDescription
                });
            });
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
            const video = document.querySelector(`#video-${data.senderId} video`);
            if (video) {
                video.srcObject = stream;
            }
        };
        
        peer.onicecandidate = (event) => {
            if (event.candidate) {
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
                    video: true
                });
                
                const btn = document.getElementById('screenShareBtn');
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-stop';
                btn.querySelector('span').textContent = 'Стоп';
                
                // Обновляем локальное видео
                const localVideo = document.querySelector(`#video-${this.userId} video`);
                if (localVideo) {
                    localVideo.srcObject = this.screenStream;
                }
                
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
        
        this.addSystemMessage(`Вы присоединились к встрече ${this.meetingId}`);
    }
    
    showInviteModal() {
        document.getElementById('inviteModal').classList.add('show');
    }
    
    copyMeetingLink() {
        const link = `${window.location.origin}/join/${this.meetingId}`;
        navigator.clipboard.writeText(link).then(() => {
            alert('Ссылка скопирована');
        });
    }
    
    copyInviteLink() {
        const linkInput = document.getElementById('meetingLink');
        linkInput.select();
        navigator.clipboard.writeText(linkInput.value).then(() => {
            alert('Ссылка скопирована');
        });
    }
    
    leaveMeeting() {
        if (confirm('Покинуть встречу?')) {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            this.peers.forEach(peer => peer.close());
            
            if (this.socket) {
                this.socket.emit('leave-meeting', {
                    meetingId: this.meetingId,
                    userId: this.userId
                });
            }
            
            location.reload();
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoMeetApp();
});
