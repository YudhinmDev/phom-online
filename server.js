const http = require('http');
const fs = require('fs');
const path = require('path');
const { WSServer } = require('./ws-server.js');
const { GameRoom } = require('./game-room.js');

const PORT = process.env.PORT || 3500;
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Strip query parameters
    let reqUrl = req.url.split('?')[0];
    let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// Initialize WebSocket Server
const wsServer = new WSServer(server);
const rooms = new Map(); // roomCode -> GameRoom

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

wsServer.on('connection', ws => {
    console.log(`[WS] Client kết nối: ${ws.id}`);

    // Tạo phòng mới
    ws.on('create_room', data => {
        let code = generateRoomCode();
        while (rooms.has(code)) {
            code = generateRoomCode();
        }

        const room = new GameRoom(code, ws, data.name, data.avatar);
        rooms.set(code, room);
        console.log(`[ROOM] Tạo phòng mới #${code} bởi ${data.name}`);
    });

    // Vào phòng
    ws.on('join_room', data => {
        const code = (data.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            ws.send('error_msg', { message: `Không tìm thấy phòng #${code}!` });
            return;
        }

        const success = room.addPlayer(ws, data.name, data.avatar);
        if (success) {
            console.log(`[ROOM] ${data.name} đã vào phòng #${code}`);
        }
    });

    // Sẵn sàng
    ws.on('toggle_ready', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.toggleReady(ws.id);
    });

    // Bắt đầu ván
    ws.on('start_game', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.startGame(ws.id);
    });

    // Bốc nọc
    ws.on('draw_card', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handleDraw(ws.data.seatIndex);
    });

    // Ăn bài
    ws.on('eat_card', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handleEat(ws.data.seatIndex);
    });

    // Đánh bài
    ws.on('play_card', data => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handlePlay(ws.data.seatIndex, data.cardId);
    });

    // Hạ phỏm
    ws.on('meld_phom', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handleMeld(ws.data.seatIndex);
    });

    // Bị cháy (Móm)
    ws.on('chay_mom', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handleChay(ws.data.seatIndex);
    });

    // Gửi bài & kết thúc lượt
    ws.on('finish_turn', () => {
        const code = ws.data.roomCode;
        const room = rooms.get(code);
        if (room) room.handleLayoff(ws.data.seatIndex);
    });

    // Ngắt kết nối
    ws.on('close', () => {
        console.log(`[WS] Client ngắt kết nối: ${ws.id}`);
        const code = ws.data.roomCode;
        if (code && rooms.has(code)) {
            const room = rooms.get(code);
            room.removePlayer(ws.id);
            if (room.players.length === 0) {
                rooms.delete(code);
                console.log(`[ROOM] Phòng #${code} đã bị xóa do không còn ai.`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🎮 Phom Game Server (Real-time Online)`);
    console.log(`🌐 Đang chạy tại: http://localhost:${PORT}`);
    console.log(`📱 Mở link trên điện thoại hoặc chia sẻ link cho bạn bè cùng chơi!`);
    console.log(`======================================================\n`);
});
