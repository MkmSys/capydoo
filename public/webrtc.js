class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.connections = new Map();
        this.localStream = null;
        this.screenStream = null;
    }
    
    async getLocalStream(constraints = { video: true, audio: true }) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            return this.localStream;
        } catch (error) {
            console.error('Ошибка получения медиа:', error);
            throw error;
        }
    }
    
    async getDisplayStream() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            
            this.screenStream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
            };
            
            return this.screenStream;
        } catch (error) {
            console.error('Ошибка демонстрации экрана:', error);
            throw error;
        }
    }
    
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
    }
    
    createConnection(targetId, config = {}) {
        const connection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            ...config
        });
        
        // Добавляем обработчики событий
        connection.onicecandidate = (event) => {
            if (event.candidate && this.app.socket) {
                this.app.socket.emit('ice-candidate', {
                    targetId: targetId,
                    candidate: event.candidate
                });
            }
        };
        
        connection.ontrack = (event) => {
            this.handleRemoteTrack(targetId, event.streams[0]);
        };
        
        connection.oniceconnectionstatechange = () => {
            console.log(`ICE состояние с ${targetId}:`, connection.iceConnectionState);
        };
        
        // Добавляем локальные треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                connection.addTrack(track, this.localStream);
            });
        }
        
        this.connections.set(targetId, connection);
        return connection;
    }
    
    handleRemoteTrack(userId, stream) {
        // Уведомляем основное приложение о новом потоке
        if (this.app.addRemoteVideo) {
            this.app.addRemoteVideo(userId, stream);
        }
    }
    
    async createOffer(targetId) {
        const connection = this.createConnection(targetId);
        
        try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            
            return {
                offer: connection.localDescription,
                connection: connection
            };
        } catch (error) {
            console.error('Ошибка создания оффера:', error);
            throw error;
        }
    }
    
    async handleOffer(targetId, offer) {
        let connection = this.connections.get(targetId);
        
        if (!connection) {
            connection = this.createConnection(targetId);
        }
        
        try {
            await connection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            
            return answer;
        } catch (error) {
            console.error('Ошибка обработки оффера:', error);
            throw error;
        }
    }
    
    async handleAnswer(targetId, answer) {
        const connection = this.connections.get(targetId);
        
        if (connection) {
            try {
                await connection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Ошибка обработки ответа:', error);
            }
        }
    }
    
    async handleIceCandidate(targetId, candidate) {
        const connection = this.connections.get(targetId);
        
        if (connection) {
            try {
                await connection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Ошибка добавления ICE кандидата:', error);
            }
        }
    }
    
    closeConnection(targetId) {
        const connection = this.connections.get(targetId);
        
        if (connection) {
            connection.close();
            this.connections.delete(targetId);
        }
    }
    
    closeAllConnections() {
        this.connections.forEach((connection, targetId) => {
            connection.close();
        });
        this.connections.clear();
    }
    
    replaceVideoTrack(newStream) {
        const videoTrack = newStream.getVideoTracks()[0];
        
        this.connections.forEach(connection => {
            const sender = connection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        });
    }
    
    getConnectionStats(targetId) {
        const connection = this.connections.get(targetId);
        
        if (connection) {
            return connection.getStats();
        }
        
        return null;
    }
}

// Экспорт для использования в основном приложении
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCManager;
}