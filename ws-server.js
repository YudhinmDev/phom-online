// Zero-Dependency RFC 6455 WebSocket Server Implementation
const crypto = require('crypto');

class WSSocket {
    constructor(socket) {
        this.socket = socket;
        this.id = 'usr_' + Math.random().toString(36).substring(2, 9);
        this.buffer = Buffer.alloc(0);
        this.listeners = {};
        this.data = {}; // Custom attachment for player info

        this.socket.on('data', chunk => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.processBuffer();
        });

        this.socket.on('close', () => {
            this.emit('close');
        });

        this.socket.on('error', err => {
            this.emit('error', err);
        });
    }

    processBuffer() {
        while (this.buffer.length >= 2) {
            const firstByte = this.buffer[0];
            const secondByte = this.buffer[1];

            const fin = (firstByte & 0x80) !== 0;
            const opcode = firstByte & 0x0f;
            const isMasked = (secondByte & 0x80) !== 0;
            let payloadLen = secondByte & 0x7f;

            let offset = 2;
            if (payloadLen === 126) {
                if (this.buffer.length < 4) return;
                payloadLen = this.buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (this.buffer.length < 10) return;
                payloadLen = Number(this.buffer.readBigUInt64BE(2));
                offset = 10;
            }

            const maskLen = isMasked ? 4 : 0;
            const totalFrameLen = offset + maskLen + payloadLen;

            if (this.buffer.length < totalFrameLen) {
                return; // Wait for complete frame
            }

            let maskKey = null;
            if (isMasked) {
                maskKey = this.buffer.slice(offset, offset + 4);
                offset += 4;
            }

            const rawPayload = this.buffer.slice(offset, offset + payloadLen);
            this.buffer = this.buffer.slice(totalFrameLen);

            // Unmask
            let payload = rawPayload;
            if (isMasked && maskKey) {
                payload = Buffer.alloc(payloadLen);
                for (let i = 0; i < payloadLen; i++) {
                    payload[i] = rawPayload[i] ^ maskKey[i % 4];
                }
            }

            if (opcode === 0x8) { // Close frame
                this.socket.end();
                return;
            } else if (opcode === 0x9) { // Ping
                this.sendRaw(Buffer.from([0x8a, 0x00])); // Pong
            } else if (opcode === 0x1) { // Text frame
                const text = payload.toString('utf8');
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.event) {
                        this.emit(parsed.event, parsed.data);
                    }
                    this.emit('message', parsed);
                } catch (e) {
                    this.emit('raw_message', text);
                }
            }
        }
    }

    send(event, data) {
        const jsonStr = JSON.stringify({ event, data });
        const payload = Buffer.from(jsonStr, 'utf8');
        const len = payload.length;
        let header;

        if (len <= 125) {
            header = Buffer.from([0x81, len]);
        } else if (len <= 65535) {
            header = Buffer.alloc(4);
            header[0] = 0x81;
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x81;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }

        this.sendRaw(Buffer.concat([header, payload]));
    }

    sendRaw(buffer) {
        if (!this.socket.destroyed && this.socket.writable) {
            this.socket.write(buffer);
        }
    }

    on(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    }

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(h => {
                try { h(...args); } catch (err) { console.error('WS handler error:', err); }
            });
        }
    }
}

class WSServer {
    constructor(httpServer) {
        this.httpServer = httpServer;
        this.clients = new Map();
        this.listeners = {};

        this.httpServer.on('upgrade', (req, socket, head) => {
            const key = req.headers['sec-websocket-key'];
            if (!key) {
                socket.destroy();
                return;
            }

            const acceptKey = crypto
                .createHash('sha1')
                .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
                .digest('base64');

            const headers = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Accept: ${acceptKey}`
            ];

            socket.write(headers.join('\r\n') + '\r\n\r\n');

            const ws = new WSSocket(socket);
            this.clients.set(ws.id, ws);

            ws.on('close', () => {
                this.clients.delete(ws.id);
            });

            this.emit('connection', ws);
        });
    }

    on(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    }

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(h => {
                try { h(...args); } catch (err) { console.error('WSServer emit error:', err); }
            });
        }
    }
}

module.exports = { WSServer, WSSocket };
