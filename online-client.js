// Online Multiplayer WebSocket Client for Phom
class PhomNetworkClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.roomCode = null;
        this.mySeat = null;
        this.isHost = false;
        this.playerName = localStorage.getItem('phom_player_name') || 'Bạn';
        this.playerAvatar = localStorage.getItem('phom_player_avatar') || '🧑‍💻';
        this.listeners = {};
        this.mode = 'ONLINE'; // 'ONLINE' or 'OFFLINE'
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const url = `${protocol}${location.host}`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.isConnected = true;
                console.log('[WS] Đã kết nối đến Game Server');
                this.emit('connected');
            };

            this.ws.onmessage = event => {
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.event) {
                        this.emit(parsed.event, parsed.data);
                    }
                } catch (e) {
                    console.error('[WS] Parse message error:', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                console.log('[WS] Mất kết nối tới Game Server');
                this.emit('disconnected');
            };

            this.ws.onerror = err => {
                console.error('[WS] Lỗi kết nối:', err);
            };
        } catch (e) {
            console.error('[WS] Không thể mở kết nối:', e);
        }
    }

    send(event, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event, data }));
        } else {
            console.warn('[WS] Chưa kết nối, không thể gửi:', event);
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    createRoom(name, avatar) {
        this.playerName = name;
        this.playerAvatar = avatar;
        localStorage.setItem('phom_player_name', name);
        localStorage.setItem('phom_player_avatar', avatar);

        this.send('create_room', { name, avatar });
    }

    joinRoom(code, name, avatar) {
        this.playerName = name;
        this.playerAvatar = avatar;
        localStorage.setItem('phom_player_name', name);
        localStorage.setItem('phom_player_avatar', avatar);

        this.send('join_room', { roomCode: code, name, avatar });
    }

    toggleReady() {
        this.send('toggle_ready');
    }

    startGame() {
        this.send('start_game');
    }

    drawCard() {
        this.send('draw_card');
    }

    eatCard() {
        this.send('eat_card');
    }

    playCard(cardId) {
        this.send('play_card', { cardId });
    }

    meldPhom() {
        this.send('meld_phom');
    }

    chayMom() {
        this.send('chay_mom');
    }

    finishTurn() {
        this.send('finish_turn');
    }
}

window.netClient = new PhomNetworkClient();
