const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.PORT = '3500';

console.log('[1/2] Đang khởi động Game Server nội bộ trên cổng 3500...');
require('./server.js');

const urlFile = path.join(__dirname, 'PUBLIC_URL.txt');
try { if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile); } catch (e) {}

console.log('[2/2] Đang tạo đường link Online công khai...');

function startTunnel() {
    const ssh = spawn('ssh', [
        '-p', '443',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-R0:localhost:3500',
        'a.pinggy.io'
    ]);

    let gotUrl = false;

    function handleData(data) {
        const text = data.toString();
        process.stdout.write(text);

        const match = text.match(/https:\/\/[a-z0-9.-]+\.a\.pinggy\.link/i) 
                   || text.match(/https:\/\/[a-z0-9.-]+\.free\.pinggy\.net/i) 
                   || text.match(/https:\/\/[a-z0-9.-]+\.pinggy-free\.link/i);

        if (match && !gotUrl) {
            gotUrl = true;
            const publicUrl = match[0];
            fs.writeFileSync(urlFile, publicUrl, 'utf8');
            console.log('\n=============================================================');
            console.log('🎉 LINK GAME ĐÃ SẴN SÀNG! MỞ TRÊN ĐIỆN THOẠI NGAY:');
            console.log(`👉 ${publicUrl}`);
            console.log('=============================================================\n');
        }
    }

    ssh.stdout.on('data', handleData);
    ssh.stderr.on('data', handleData);

    ssh.on('close', code => {
        console.log(`Tunnel closed (code ${code}), reconnecting in 5s...`);
        setTimeout(startTunnel, 5000);
    });
}

startTunnel();
