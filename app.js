// Main UI Controller & Real-Time Multiplayer Engine for Phom Web Game
document.addEventListener('DOMContentLoaded', () => {
    // Game State
    const state = {
        deck: new Deck(),
        players: [
            { id: 0, name: 'Bạn', avatar: '🧑‍💻', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: true },
            { id: 1, name: 'Người chơi 1', avatar: '👨‍💼', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false },
            { id: 2, name: 'Người chơi 2', avatar: '👨‍🎨', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false },
            { id: 3, name: 'Người chơi 3', avatar: '👩‍🔬', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false }
        ],
        currentTurn: 0, // 0..3
        round: 1,       // 1 to 4
        latestDiscard: null, // { card, playerIndex }
        selectedCard: null,
        turnTimeLeft: 60, // 1 phút suy nghĩ
        timerInterval: null,
        soundOn: true,
        sortMode: 'smart', // 'smart' or 'rank'
        userStage: 'PLAYING', // 'TAKING', 'PLAYING', 'MELDING', 'LAYOFF', 'WAITING'

        // Online Mode State
        isOnline: false,
        onlineRoomCode: null,
        myOnlineSeat: 0,
        selectedAvatar: localStorage.getItem('phom_player_avatar') || '🧑‍💻',
        isHost: false,
        seatToDOMMap: {} // serverSeatIndex -> 'seatUser' | 'seatTop' | 'seatLeft' | 'seatRight'
    };

    // DOM Elements
    const dom = {
        viewportFrame: document.getElementById('deviceFrame'),
        userHand: document.getElementById('userHand'),
        userDiscards: document.getElementById('userDiscards'),
        userEatenCards: document.getElementById('userEatenCards'),
        userStatus: document.getElementById('userStatus'),
        nocDeck: document.getElementById('nocDeck'),
        nocCount: document.getElementById('nocCount'),
        btnEat: document.getElementById('btnEat'),
        btnDraw: document.getElementById('btnDraw'),
        btnPlay: document.getElementById('btnPlay'),
        btnPlayText: document.getElementById('btnPlayText'),
        btnMeld: document.getElementById('btnMeld'),
        btnChay: document.getElementById('btnChay'),
        btnSend: document.getElementById('btnSend'),
        btnSort: document.getElementById('btnSort'),
        toast: document.getElementById('gameToast'),
        scoreModal: document.getElementById('scoreModal'),
        modalContent: document.getElementById('modalScoreTable'),
        roundBadge: document.getElementById('roundBadge'),
        btnDealNew: document.getElementById('btnDealNew'),
        btnSoundToggle: document.getElementById('btnSoundToggle'),

        // Lobby Elements
        lobbyModal: document.getElementById('lobbyModal'),
        lobbyStepInit: document.getElementById('lobbyStepInit'),
        lobbyStepRoom: document.getElementById('lobbyStepRoom'),
        inputPlayerName: document.getElementById('inputPlayerName'),
        avatarPicker: document.getElementById('avatarPicker'),
        btnCreateRoom: document.getElementById('btnCreateRoom'),
        inputRoomCode: document.getElementById('inputRoomCode'),
        btnJoinRoom: document.getElementById('btnJoinRoom'),
        btnPlayOffline: document.getElementById('btnPlayOffline'),
        displayRoomPin: document.getElementById('displayRoomPin'),
        btnCopyLink: document.getElementById('btnCopyLink'),
        lobbySeatsList: document.getElementById('lobbySeatsList'),
        btnStartOnlineGame: document.getElementById('btnStartOnlineGame'),
        btnToggleReady: document.getElementById('btnToggleReady'),
        btnLeaveRoom: document.getElementById('btnLeaveRoom')
    };

    // Initialize Game
    init();

    function init() {
        bindSimulatorControls();
        bindActionButtons();
        bindLobbyControls();
        initOnlineClient();

        // Check if invited via URL ?room=CODE
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            dom.inputRoomCode.value = roomParam.trim().toUpperCase();
            showToast(`Đã nhận mã phòng mời: #${roomParam.toUpperCase()}`);
        }
    }

    // Helper: Convert raw card data from server to Card instances
    function hydrateCard(raw) {
        if (!raw) return null;
        if (raw instanceof Card) return raw;
        const c = new Card(raw.rank, raw.suit);
        c.isEaten = !!raw.isEaten;
        return c;
    }

    function hydrateCards(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(hydrateCard);
    }

    // =========================================================================
    // ONLINE MULTIPLAYER CLIENT INTEGRATION
    // =========================================================================
    function initOnlineClient() {
        window.netClient.connect();

        // 1. Lobby room update
        window.netClient.on('lobby_update', data => {
            state.onlineRoomCode = data.roomCode;
            dom.displayRoomPin.textContent = data.roomCode;

            dom.lobbyStepInit.classList.add('hidden');
            dom.lobbyStepRoom.classList.remove('hidden');

            renderLobbySeats(data.players);
        });

        // 2. Game started (Chỉ hiển thị người chơi thật, XÓA BOT)
        window.netClient.on('game_started', data => {
            dom.lobbyModal.classList.remove('open');
            state.isOnline = true;
            state.onlineRoomCode = data.roomCode;
            state.myOnlineSeat = data.mySeat;
            state.round = data.round;
            state.currentTurn = data.currentTurn;
            state.turnTimeLeft = 60; // 1 phút
            state.userStage = (data.currentTurn === data.mySeat) ? 'PLAYING' : 'WAITING';

            // Xếp ghế chính xác cho người chơi thật (ẩn hoàn toàn các ghế không có người)
            layoutSeats(data.players, data.mySeat, data.myHand);

            const badgeCode = document.getElementById('roomBadgeCode');
            const badgePlayers = document.getElementById('roomBadgePlayers');
            if (badgeCode) badgeCode.textContent = `🏷️ Phòng #${data.roomCode}`;
            if (badgePlayers) badgePlayers.textContent = `● Online (${data.players.length}/4)`;

            dom.nocCount.textContent = `${data.nocCount} lá`;
            window.soundFX.playCardDeal();
            showToast('🎮 Ván đấu online đã bắt đầu!');

            renderAll();
            updateActiveSeatOnline(data.currentTurn);
        });

        // 3. Timer tick from server (1 phút)
        window.netClient.on('timer_tick', data => {
            state.turnTimeLeft = data.timeLeft;
            updateOnlineTimer(data.currentTurn);
        });

        // 4. Card drawn by user
        window.netClient.on('card_drawn_self', data => {
            state.players[0].hand = hydrateCards(data.hand);
            state.userStage = 'PLAYING';
            window.soundFX.playCardDeal();
            renderAll();
        });

        // 5. Card drawn by other player
        window.netClient.on('player_drew_public', data => {
            dom.nocCount.textContent = `${data.nocCount} lá`;
            const p = state.players.find(x => x.id === data.seatIndex);
            if (p && !p.isUser) {
                p.hand = new Array(data.cardCount).fill(null);
            }
            window.soundFX.playCardDeal();
            renderDiscardsAndMelds();
        });

        // 6. Card eaten by user (Hiện trước mặt)
        window.netClient.on('card_eaten_self', data => {
            state.players[0].hand = hydrateCards(data.hand);
            state.players[0].eatenCards = hydrateCards(data.eatenCards);
            state.userStage = 'PLAYING';
            state.latestDiscard = null;
            window.soundFX.playEat();
            renderAll();
        });

        // 7. Card eaten by other player (Hiện trước mặt đối thủ)
        window.netClient.on('player_eaten_public', data => {
            const p = state.players.find(x => x.id === data.seatIndex);
            if (p) {
                p.eatenCards = hydrateCards(data.eatenCards);
                if (!p.isUser) {
                    p.hand = new Array(data.cardCount).fill(null);
                }
            }
            state.latestDiscard = null;
            window.soundFX.playEat();
            renderDiscardsAndMelds();
        });

        // 8. Card played
        window.netClient.on('card_played_public', data => {
            const p = state.players.find(x => x.id === data.seatIndex);
            const playedCard = hydrateCard(data.card);

            if (p) {
                p.discards = hydrateCards(data.discards);
                if (!p.isUser) {
                    p.hand = new Array(data.cardCount).fill(null);
                }
            }
            state.latestDiscard = { card: playedCard, playerIndex: data.seatIndex };

            window.soundFX.playCardPlay();
            renderDiscardsAndMelds();
        });

        // 9. Prompt meld / prompt layoff (at round 4)
        window.netClient.on('prompt_meld', data => {
            state.userStage = 'MELDING';
            renderActionBar();
        });

        window.netClient.on('prompt_layoff', () => {
            state.userStage = 'LAYOFF';
            renderActionBar();
        });

        // 10. Turn changed
        window.netClient.on('turn_changed', data => {
            state.round = data.round;
            state.currentTurn = data.currentTurn;
            state.turnTimeLeft = 60; // Reset 1 phút
            const isMyTurn = data.currentTurn === state.myOnlineSeat;
            state.userStage = isMyTurn ? 'TAKING' : 'WAITING';

            renderRoundInfo();
            updateActiveSeatOnline(data.currentTurn);
            renderActionBar();
        });

        // 11. Hand updated
        window.netClient.on('hand_updated', data => {
            state.players[0].hand = hydrateCards(data.hand);
            if (data.melds) {
                state.players[0].melds = data.melds.map(hydrateCards);
            }
            renderAll();
        });

        // 12. Player melded public
        window.netClient.on('player_melded_public', data => {
            const p = state.players.find(x => x.id === data.seatIndex);
            if (p && !p.isUser) {
                p.melds = data.melds.map(hydrateCards);
                p.hand = new Array(data.cardCount).fill(null);
            }
            window.soundFX.playWin();
            renderDiscardsAndMelds();
        });

        // 13. Game ended
        window.netClient.on('game_ended', data => {
            showEndGameModalOnline(data.results);
        });

        // 14. Instant win (Ù)
        window.netClient.on('game_won_instant', data => {
            handleWinOnline(data);
        });

        // 15. Toasts & Errors
        window.netClient.on('toast_alert', data => {
            showToast(data.message);
        });

        window.netClient.on('error_msg', data => {
            showToast(`⚠️ ${data.message}`);
        });
    }

    // =========================================================================
    // SEAT MANAGEMENT: CHỈ HIỂN THỊ NGƯỜI THẬT, XÓA TOÀN BỘ BOT
    // =========================================================================
    function layoutSeats(players, mySeat, myHand) {
        const total = players.length;
        const seatLeft = document.getElementById('seatLeft');
        const seatTop = document.getElementById('seatTop');
        const seatRight = document.getElementById('seatRight');
        const seatUser = document.getElementById('seatUser');

        // Ẩn tất cả các ghế đối thủ trước
        [seatLeft, seatTop, seatRight].forEach(s => {
            if (s) s.classList.add('hidden-seat');
        });

        state.players = [];
        state.seatToDOMMap = {};

        // 1. Ghế của BẠN (Luôn ở dưới cùng - Bottom)
        const me = players.find(p => p.seatIndex === mySeat);
        state.players[0] = {
            id: mySeat,
            domId: 'seatUser',
            name: me.name,
            avatar: me.avatar,
            hand: hydrateCards(myHand || []),
            melds: [],
            discards: [],
            eatenCards: [],
            isUser: true
        };
        state.seatToDOMMap[mySeat] = 'seatUser';
        seatUser.querySelector('.player-name').textContent = me.name;
        seatUser.querySelector('.avatar-img').textContent = me.avatar;

        const others = players.filter(p => p.seatIndex !== mySeat);

        // 2. Định vị các người chơi thật còn lại (KHÔNG CÓ BOT)
        if (total === 2) {
            // 2 người chơi: Bạn (dưới) đối diện Bạn bè (trên)
            const opp = others[0];
            setupOpponentSeat(seatTop, opp, 1);
            state.seatToDOMMap[opp.seatIndex] = 'seatTop';
        } else if (total === 3) {
            // 3 người chơi: Bạn (dưới), Người 1 (trái), Người 2 (phải)
            const opp1 = others[0];
            const opp2 = others[1];
            setupOpponentSeat(seatLeft, opp1, 1);
            setupOpponentSeat(seatRight, opp2, 2);
            state.seatToDOMMap[opp1.seatIndex] = 'seatLeft';
            state.seatToDOMMap[opp2.seatIndex] = 'seatRight';
        } else if (total === 4) {
            // 4 người chơi: Xoay vòng theo chiều kim đồng hồ
            others.forEach(p => {
                const rel = (p.seatIndex - mySeat + 4) % 4;
                let targetDOM = seatLeft;
                let relIdx = 1;
                if (rel === 1) { targetDOM = seatLeft; relIdx = 1; }
                else if (rel === 2) { targetDOM = seatTop; relIdx = 2; }
                else if (rel === 3) { targetDOM = seatRight; relIdx = 3; }
                setupOpponentSeat(targetDOM, p, relIdx);
                state.seatToDOMMap[p.seatIndex] = targetDOM.id;
            });
        }
    }

    function setupOpponentSeat(seatDOM, p, indexInState) {
        seatDOM.classList.remove('hidden-seat');
        seatDOM.querySelector('.player-name').textContent = p.name;
        seatDOM.querySelector('.avatar-img').textContent = p.avatar;

        state.players[indexInState] = {
            id: p.seatIndex,
            domId: seatDOM.id,
            name: p.name,
            avatar: p.avatar,
            hand: new Array(p.cardCount || 9).fill(null),
            melds: hydrateCards(p.melds || []),
            discards: hydrateCards(p.discards || []),
            eatenCards: hydrateCards(p.eatenCards || []),
            isUser: false
        };
    }

    function updateActiveSeatOnline(serverSeatIndex) {
        const domId = state.seatToDOMMap[serverSeatIndex];
        const allSeats = [
            document.getElementById('seatUser'),
            document.getElementById('seatLeft'),
            document.getElementById('seatTop'),
            document.getElementById('seatRight')
        ];

        allSeats.forEach(s => {
            if (s) {
                if (s.id === domId) s.classList.add('active');
                else s.classList.remove('active');
            }
        });
    }

    // Timer tròn đếm ngược 1 phút (60 giây)
    function updateOnlineTimer(serverSeatIndex) {
        const domId = state.seatToDOMMap[serverSeatIndex];
        if (!domId) return;

        const activeSeat = document.getElementById(domId);
        if (!activeSeat) return;

        const circleVal = activeSeat.querySelector('.timer-circle-val');
        if (circleVal) {
            const maxOffset = 126;
            // Tính toán theo 60 giây
            const offset = maxOffset - (state.turnTimeLeft / 60) * maxOffset;
            circleVal.style.strokeDashoffset = offset;

            // Báo động khi còn 10 giây cuối
            if (state.turnTimeLeft <= 10) {
                circleVal.classList.add('urgent');
                if (state.turnTimeLeft > 0) window.soundFX.playTick();
            } else {
                circleVal.classList.remove('urgent');
            }
        }
    }

    function renderLobbySeats(players) {
        dom.lobbySeatsList.innerHTML = '';
        const myId = window.netClient.ws ? window.netClient.ws.id : null;
        let imHost = false;

        for (let i = 0; i < 4; i++) {
            const p = players[i];
            const item = document.createElement('div');
            item.className = 'lobby-seat-item';

            if (p) {
                if (p.isHost && p.id === myId) imHost = true;
                const statusBadge = p.isHost 
                    ? '<span class="seat-ready-badge host">👑 Chủ phòng</span>'
                    : (p.isReady ? '<span class="seat-ready-badge ready">✅ Sẵn sàng</span>' : '<span class="seat-ready-badge waiting">⏳ Chờ...</span>');

                item.innerHTML = `
                    <div class="lobby-seat-user">
                        <span style="font-size:22px;">${p.avatar}</span>
                        <strong style="font-size:13px; color:#fff;">${p.name} ${p.id === myId ? '(Bạn)' : ''}</strong>
                    </div>
                    ${statusBadge}
                `;
            } else {
                item.innerHTML = `
                    <div class="lobby-seat-user" style="opacity: 0.5;">
                        <span style="font-size:20px;">🪑</span>
                        <span style="font-size:12px; color:#94a3b8;">Ghế trống ${i + 1}</span>
                    </div>
                    <span style="font-size:11px; color:#64748b;">Đang đợi...</span>
                `;
            }

            dom.lobbySeatsList.appendChild(item);
        }

        state.isHost = imHost;
        if (imHost) {
            dom.btnStartOnlineGame.classList.remove('hidden');
            dom.btnToggleReady.classList.add('hidden');
        } else {
            dom.btnStartOnlineGame.classList.add('hidden');
            dom.btnToggleReady.classList.remove('hidden');
        }
    }

    function showEndGameModalOnline(results) {
        let html = '';
        const rankLabels = ['Nhất 🥇', 'Nhì 🥈', 'Ba 🥉', 'Bét 💥'];
        results.forEach((r, idx) => {
            const rowClass = idx === 0 ? 'winner' : '';
            const statusStr = r.isMom ? 'MÓM (Cháy bài)' : `${r.trashScore} điểm`;
            html += `
                <tr class="${rowClass}">
                    <td><strong>${rankLabels[idx]}</strong></td>
                    <td>${r.avatar} ${r.name}</td>
                    <td>${r.melds.length} Phỏm</td>
                    <td>${statusStr}</td>
                </tr>
            `;
        });

        dom.modalContent.innerHTML = html;
        dom.scoreModal.classList.add('open');
        window.soundFX.playWin();
    }

    function handleWinOnline(data) {
        showToast(`🏆 ${data.winnerName} ĐÃ ${data.reason.toUpperCase()}! THẮNG TUYỆT ĐỐI!`);
        window.soundFX.playWin();

        dom.modalContent.innerHTML = `
            <tr class="winner">
                <td><strong>Vô Địch</strong></td>
                <td>${data.winnerAvatar} ${data.winnerName}</td>
                <td>3 Phỏm</td>
                <td>Ù TRÒN (0 điểm)</td>
            </tr>
        `;
        dom.scoreModal.classList.add('open');
    }

    // =========================================================================
    // LOBBY USER CONTROLS BINDING
    // =========================================================================
    function bindLobbyControls() {
        const avatarOpts = dom.avatarPicker.querySelectorAll('.avatar-option');
        avatarOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                avatarOpts.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.selectedAvatar = opt.dataset.av;
                localStorage.setItem('phom_player_avatar', state.selectedAvatar);
            });
        });

        dom.btnCreateRoom.addEventListener('click', () => {
            const name = dom.inputPlayerName.value.trim() || 'Người chơi';
            window.netClient.createRoom(name, state.selectedAvatar);
        });

        dom.btnJoinRoom.addEventListener('click', () => {
            const name = dom.inputPlayerName.value.trim() || 'Người chơi';
            const code = dom.inputRoomCode.value.trim();
            if (!code) {
                showToast('Vui lòng nhập mã phòng!');
                return;
            }
            window.netClient.joinRoom(code, name, state.selectedAvatar);
        });

        dom.btnPlayOffline.addEventListener('click', () => {
            dom.lobbyModal.classList.remove('open');
            state.isOnline = false;
            startNewOfflineGame();
        });

        dom.btnCopyLink.addEventListener('click', () => {
            const inviteUrl = `${location.origin}${location.pathname}?room=${state.onlineRoomCode}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                showToast('📋 Đã sao chép link mời vào bộ nhớ tạm!');
            }).catch(() => {
                prompt('Link mời bạn bè:', inviteUrl);
            });
        });

        dom.btnStartOnlineGame.addEventListener('click', () => {
            window.netClient.startGame();
        });

        dom.btnToggleReady.addEventListener('click', () => {
            window.netClient.toggleReady();
        });

        dom.btnLeaveRoom.addEventListener('click', () => {
            location.href = location.pathname;
        });
    }

    // =========================================================================
    // GAME ENGINE & RENDERING (Render bài rác, bài đã ăn trước mặt)
    // =========================================================================
    function startNewOfflineGame() {
        clearInterval(state.timerInterval);
        state.deck.reset();
        state.deck.shuffle();

        // Mở lại tất cả các ghế cho bot trong chế độ offline
        ['seatLeft', 'seatTop', 'seatRight'].forEach(id => {
            const s = document.getElementById(id);
            if (s) s.classList.remove('hidden-seat');
        });

        state.players = [
            { id: 0, domId: 'seatUser', name: 'Bạn', avatar: '🧑‍💻', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: true },
            { id: 1, domId: 'seatLeft', name: 'Máy 1', avatar: '👨‍💼', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false },
            { id: 2, domId: 'seatTop', name: 'Máy 2', avatar: '👨‍🎨', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false },
            { id: 3, domId: 'seatRight', name: 'Máy 3', avatar: '👩‍🔬', hand: [], melds: [], discards: [], eatenCards: [], isMom: false, isUser: false }
        ];

        state.players.forEach(p => {
            const seatEl = document.getElementById(p.domId);
            if (seatEl) {
                seatEl.querySelector('.player-name').textContent = p.name;
                seatEl.querySelector('.avatar-img').textContent = p.avatar;
            }
        });

        state.players[0].hand = state.deck.deal(10);
        state.players[1].hand = state.deck.deal(9);
        state.players[2].hand = state.deck.deal(9);
        state.players[3].hand = state.deck.deal(9);

        state.currentTurn = 0;
        state.round = 1;
        state.latestDiscard = null;
        state.selectedCard = null;
        state.userStage = 'PLAYING';
        state.turnTimeLeft = 60; // 1 phút

        window.soundFX.playCardDeal();
        showToast('Ván luyện tập bắt đầu! Bạn có 10 lá.');

        renderAll();
        startTurnTimerOffline();
    }

    function renderAll() {
        renderCenter();
        renderUserHand();
        renderDiscardsAndMelds();
        renderActionBar();
        renderRoundInfo();
        if (!state.isOnline) {
            updateActiveSeat();
        }
    }

    function renderRoundInfo() {
        dom.roundBadge.textContent = `Vòng: ${state.round}/4 ${state.round === 4 ? '(VÒNG CHỐT)' : ''}`;
    }

    function renderCenter() {
        // Nọc
    }

    function renderUserHand() {
        dom.userHand.innerHTML = '';
        const user = state.players[0];

        if (state.sortMode === 'smart') {
            user.hand = PhomLogic.smartSort(user.hand);
        } else {
            user.hand.sort((a, b) => a.rank - b.rank);
        }

        const best = PhomLogic.findBestMelds(user.hand);
        const meldIds = new Set(best.melds.flat().map(c => c.id));
        const nonMelds = user.hand.filter(c => !meldIds.has(c.id));
        const cas = PhomLogic.findCaGroups(nonMelds);
        const caIds = new Set(cas.flatMap(g => g.cards.map(c => c.id)));

        user.hand.forEach(card => {
            const cardEl = createCardElement(card, true);

            if (meldIds.has(card.id)) {
                cardEl.classList.add('in-phom');
            } else if (caIds.has(card.id)) {
                cardEl.classList.add('in-ca');
            }

            if (state.selectedCard && state.selectedCard.id === card.id) {
                cardEl.classList.add('selected');
            }

            cardEl.addEventListener('click', () => {
                selectCard(card);
            });

            dom.userHand.appendChild(cardEl);
        });

        renderMeldsTray(user.melds);
    }

    function renderMeldsTray(melds) {
        let tray = document.getElementById('userMeldsTray');
        if (!tray) {
            tray = document.createElement('div');
            tray.id = 'userMeldsTray';
            tray.className = 'melds-tray';
            dom.viewportFrame.querySelector('.poker-table').appendChild(tray);
        }
        tray.innerHTML = '';

        melds.forEach((m, idx) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'phom-group';
            groupEl.innerHTML = `<span class="phom-tag">Phỏm ${idx+1}</span>`;
            m.forEach(c => {
                const mini = createCardElement(c, false, true);
                groupEl.appendChild(mini);
            });
            tray.appendChild(groupEl);
        });
    }

    // Hiển thị bài đã đánh & bài đã ăn (ngửa trước mặt) cho từng người chơi
    function renderDiscardsAndMelds() {
        // 1. Khay bài của Bạn
        dom.userDiscards.innerHTML = '';
        state.players[0].discards.forEach(c => {
            const mini = createCardElement(c, false, true);
            if (state.latestDiscard && state.latestDiscard.card && state.latestDiscard.card.id === c.id) {
                mini.classList.add('latest-in-tray');
            }
            dom.userDiscards.appendChild(mini);
        });

        // LÁ ĂN ĐƯỢC ĐỂ TRƯỚC MẶT BẠN
        dom.userEatenCards.innerHTML = '';
        (state.players[0].eatenCards || []).forEach(c => {
            const mini = createCardElement(c, false, true);
            mini.classList.add('eaten');
            dom.userEatenCards.appendChild(mini);
        });

        // 2. Khay bài của các đối thủ thật
        state.players.forEach(p => {
            if (p.isUser || !p.domId) return;

            const seatDOM = document.getElementById(p.domId);
            if (!seatDOM) return;

            const oppHandDom = seatDOM.querySelector('.opp-cards');
            const oppMeldsDom = seatDOM.querySelector('.player-melds');
            const oppDiscardsDom = seatDOM.querySelector('.player-discards');
            const oppEatenDom = seatDOM.querySelector('.player-eaten-cards');

            // Số lá úp
            if (oppHandDom) {
                oppHandDom.innerHTML = '';
                const count = p.hand ? p.hand.length : 0;
                for (let k = 0; k < Math.min(count, 10); k++) {
                    const back = document.createElement('div');
                    back.className = 'card-back-mini';
                    oppHandDom.appendChild(back);
                }
                const countBadge = document.createElement('span');
                countBadge.style.fontSize = '10px';
                countBadge.style.color = '#ccc';
                countBadge.style.marginLeft = '4px';
                countBadge.textContent = `(${count})`;
                oppHandDom.appendChild(countBadge);
            }

            // LÁ ĂN ĐƯỢC ĐỂ TRƯỚC MẶT ĐỐI THỦ (công khai cho mọi người cùng thấy)
            if (oppEatenDom) {
                oppEatenDom.innerHTML = '';
                (p.eatenCards || []).forEach(c => {
                    const mini = createCardElement(c, false, true);
                    mini.classList.add('eaten');
                    oppEatenDom.appendChild(mini);
                });
            }

            // Phỏm đã hạ
            if (oppMeldsDom) {
                oppMeldsDom.innerHTML = '';
                (p.melds || []).forEach(m => {
                    const group = Array.isArray(m) ? m : [m];
                    group.forEach(c => {
                        const mini = createCardElement(c, false, true);
                        oppMeldsDom.appendChild(mini);
                    });
                });
            }

            // Bài rác đã đánh
            if (oppDiscardsDom) {
                oppDiscardsDom.innerHTML = '';
                (p.discards || []).forEach(c => {
                    const mini = createCardElement(c, false, true);
                    if (state.latestDiscard && state.latestDiscard.card && state.latestDiscard.card.id === c.id) {
                        mini.classList.add('latest-in-tray');
                    }
                    oppDiscardsDom.appendChild(mini);
                });
            }
        });
    }

    function updateActiveSeat() {
        const seats = [
            document.getElementById('seatUser'),
            document.getElementById('seatLeft'),
            document.getElementById('seatTop'),
            document.getElementById('seatRight')
        ];

        seats.forEach((seat, idx) => {
            if (seat) {
                if (idx === state.currentTurn) seat.classList.add('active');
                else seat.classList.remove('active');
            }
        });
    }

    function createCardElement(card, interactive = false, mini = false) {
        const el = document.createElement('div');
        el.className = `card ${card.color} ${mini ? 'mini' : ''}`;
        el.dataset.id = card.id;

        el.innerHTML = `
            <div class="card-corner top">
                <span class="card-rank">${card.label}</span>
                <span class="card-suit">${card.symbol}</span>
            </div>
            <div class="card-center">${card.symbol}</div>
            <div class="card-corner bottom">
                <span class="card-rank">${card.label}</span>
                <span class="card-suit">${card.symbol}</span>
            </div>
        `;

        return el;
    }

    function selectCard(card) {
        const isMyTurn = state.isOnline ? (state.currentTurn === state.myOnlineSeat) : (state.currentTurn === 0);
        if (!isMyTurn || state.userStage !== 'PLAYING') return;

        // Luật Phỏm: Không được chọn lá bài đã ăn để đánh
        if (card.isEaten) {
            showToast('⚠️ Không thể đánh lá bài bạn đã ăn!');
            return;
        }

        if (state.selectedCard && state.selectedCard.id === card.id) {
            state.selectedCard = null;
        } else {
            state.selectedCard = card;
            window.soundFX.playCardSelect();
        }

        renderUserHand();
        renderActionBar();
    }

    function renderActionBar() {
        const isMyTurn = state.isOnline ? (state.currentTurn === state.myOnlineSeat) : (state.currentTurn === 0);
        const user = state.players[0];

        dom.btnEat.classList.add('hidden');
        dom.btnDraw.classList.add('hidden');
        dom.btnPlay.classList.add('hidden');
        dom.btnMeld.classList.add('hidden');
        dom.btnChay.classList.add('hidden');
        dom.btnSend.classList.add('hidden');

        dom.btnEat.classList.remove('active');
        dom.btnDraw.classList.remove('active');
        dom.btnPlay.classList.remove('active');
        dom.btnMeld.classList.remove('active');

        if (!isMyTurn) {
            dom.userStatus.textContent = 'Đang chờ lượt...';
            return;
        }

        if (state.userStage === 'TAKING') {
            dom.userStatus.textContent = 'Bốc nọc hoặc Ăn bài (1p)';
            dom.btnDraw.classList.remove('hidden');
            dom.btnDraw.classList.add('active');

            // Kiểm tra có ăn được cây người trước không
            if (state.latestDiscard) {
                const canEat = PhomLogic.canEatCard(user.hand, state.latestDiscard.card);
                if (canEat) {
                    dom.btnEat.classList.remove('hidden');
                    dom.btnEat.classList.add('active');
                }
            }
        } 
        else if (state.userStage === 'PLAYING') {
            if (state.selectedCard) {
                dom.userStatus.textContent = `Đã chọn [${state.selectedCard.label}${state.selectedCard.symbol}]`;
                dom.btnPlayText.textContent = `ĐÁNH [${state.selectedCard.label}${state.selectedCard.symbol}]`;
                dom.btnPlay.classList.remove('hidden');
                dom.btnPlay.classList.add('active');
            } else {
                dom.userStatus.textContent = 'Bấm vào 1 lá bài để Đánh';
            }
        } 
        else if (state.userStage === 'MELDING') {
            const best = PhomLogic.findBestMelds(user.hand);
            if (best.melds.length > 0) {
                dom.userStatus.textContent = `Bạn có ${best.melds.length} Phỏm! Bấm Hạ Bài.`;
                dom.btnMeld.classList.remove('hidden');
                dom.btnMeld.classList.add('active');
            } else {
                dom.userStatus.textContent = 'Không có Phỏm! Bị Cháy (Móm).';
                dom.btnChay.classList.remove('hidden');
            }
        } 
        else if (state.userStage === 'LAYOFF') {
            dom.userStatus.textContent = 'Bấm Gửi bài để kết thúc lượt';
            dom.btnSend.classList.remove('hidden');
            dom.btnSend.classList.add('active');
        }
    }

    // Timer cho Offline mode (1 phút)
    function startTurnTimerOffline() {
        if (state.isOnline) return;

        clearInterval(state.timerInterval);
        state.turnTimeLeft = 60; // 1 phút
        updateTimerDisplayOffline();

        state.timerInterval = setInterval(() => {
            state.turnTimeLeft--;
            updateTimerDisplayOffline();

            if (state.turnTimeLeft <= 10 && state.turnTimeLeft > 0) {
                window.soundFX.playTick();
            }

            if (state.turnTimeLeft <= 0) {
                clearInterval(state.timerInterval);
                handleTurnTimeoutOffline();
            }
        }, 1000);
    }

    function updateTimerDisplayOffline() {
        const activeSeat = [
            document.getElementById('seatUser'),
            document.getElementById('seatLeft'),
            document.getElementById('seatTop'),
            document.getElementById('seatRight')
        ][state.currentTurn];

        if (!activeSeat) return;

        const circleVal = activeSeat.querySelector('.timer-circle-val');
        if (circleVal) {
            const maxOffset = 126;
            const offset = maxOffset - (state.turnTimeLeft / 60) * maxOffset;
            circleVal.style.strokeDashoffset = offset;

            if (state.turnTimeLeft <= 10) {
                circleVal.classList.add('urgent');
            } else {
                circleVal.classList.remove('urgent');
            }
        }
    }

    function handleTurnTimeoutOffline() {
        if (state.currentTurn === 0) {
            const user = state.players[0];
            if (state.userStage === 'TAKING') {
                actionDraw();
            }
            if (state.userStage === 'PLAYING') {
                const playable = user.hand.filter(c => !c.isEaten);
                const highestCard = [...playable].sort((a,b) => b.score - a.score)[0];
                state.selectedCard = highestCard;
                actionPlay();
            } else if (state.userStage === 'MELDING') {
                const best = PhomLogic.findBestMelds(user.hand);
                if (best.melds.length > 0) actionMeld();
                else actionChay();
            } else if (state.userStage === 'LAYOFF') {
                actionSend();
            }
        } else {
            simulateCurrentOpponentTurnOffline();
        }
    }

    // ACTIONS (Online & Offline Unified)
    function actionDraw() {
        if (state.isOnline) {
            window.netClient.drawCard();
            return;
        }

        if (state.currentTurn !== 0 || state.userStage !== 'TAKING') return;
        const user = state.players[0];
        if (state.deck.cards.length === 0) return;

        const card = state.deck.deal(1)[0];
        user.hand.push(card);
        window.soundFX.playCardDeal();
        showToast(`Bạn vừa bốc lá [${card.label}${card.symbol}]`);

        state.selectedCard = null;
        state.userStage = 'PLAYING';
        renderAll();
    }

    function actionEat() {
        if (state.isOnline) {
            window.netClient.eatCard();
            return;
        }

        if (state.currentTurn !== 0 || state.userStage !== 'TAKING') return;
        if (!state.latestDiscard) return;

        const user = state.players[0];
        const eatenCard = state.latestDiscard.card;
        eatenCard.isEaten = true;
        user.hand.push(eatenCard);

        user.eatenCards = user.eatenCards || [];
        user.eatenCards.push(eatenCard); // Đặt trước mặt

        showToast(`🎉 BẠN ĐÃ ĂN CÂY [${eatenCard.label}${eatenCard.symbol}]!`);
        window.soundFX.playEat();

        state.latestDiscard = null;
        state.selectedCard = null;
        state.userStage = 'PLAYING';
        renderAll();
    }

    function actionPlay() {
        if (!state.selectedCard) return;

        if (state.isOnline) {
            window.netClient.playCard(state.selectedCard.id);
            state.selectedCard = null;
            renderActionBar();
            return;
        }

        if (state.currentTurn !== 0 || state.userStage !== 'PLAYING') return;

        const user = state.players[0];
        const card = state.selectedCard;

        user.hand = user.hand.filter(c => c.id !== card.id);
        user.discards.push(card);

        state.latestDiscard = { card: card, playerIndex: 0 };
        state.selectedCard = null;
        window.soundFX.playCardPlay();

        const best = PhomLogic.findBestMelds(user.hand);
        if (best.trash.length === 0 && best.melds.length > 0) {
            handleWinOffline(0, 'Ù Tròn!');
            return;
        }

        if (state.round === 4) {
            state.userStage = 'MELDING';
            renderAll();
            showToast('Bạn vừa đánh cây Chốt! Hãy bấm nút để tiếp tục.');
            return;
        }

        state.userStage = 'WAITING';
        nextTurnOffline();
    }

    function actionMeld() {
        if (state.isOnline) {
            window.netClient.meldPhom();
            return;
        }

        const user = state.players[0];
        const best = PhomLogic.findBestMelds(user.hand);

        if (best.melds.length === 0) {
            actionChay();
            return;
        }

        user.melds = best.melds;
        const meldIds = new Set(best.melds.flat().map(c => c.id));
        user.hand = user.hand.filter(c => !meldIds.has(c.id));

        window.soundFX.playWin();
        showToast(`Hạ thành công ${best.melds.length} phỏm!`);

        state.userStage = 'LAYOFF';
        renderAll();
    }

    function actionChay() {
        if (state.isOnline) {
            window.netClient.chayMom();
            return;
        }

        const user = state.players[0];
        user.isMom = true;
        showToast('🔥 BẠN BỊ MÓM (CHÁY BÀI)!');
        state.userStage = 'WAITING';
        nextTurnOffline();
    }

    function actionSend() {
        if (state.isOnline) {
            window.netClient.finishTurn();
            return;
        }

        const user = state.players[0];
        const allOpponentPhoms = [];
        for (let i = 1; i < state.players.length; i++) {
            state.players[i].melds.forEach(m => {
                allOpponentPhoms.push({ phom: m, playerIndex: i, playerName: state.players[i].name });
            });
        }

        const layoffs = PhomLogic.findPossibleLayoffs(user.hand, allOpponentPhoms);
        if (layoffs.length > 0) {
            layoffs.forEach(lo => {
                user.hand = user.hand.filter(c => c.id !== lo.card.id);
                lo.targetPhom.push(lo.card);
                showToast(`Đã gửi lá [${lo.card.label}${lo.card.symbol}] vào phỏm của ${lo.playerName}!`);
            });
            window.soundFX.playEat();
        } else {
            showToast('Không có lá bài nào gửi được. Kết thúc lượt!');
        }

        state.userStage = 'WAITING';
        nextTurnOffline();
    }

    function nextTurnOffline() {
        clearInterval(state.timerInterval);
        state.currentTurn = (state.currentTurn + 1) % state.players.length;

        if (state.currentTurn === 0) {
            state.round++;
            if (state.round > 4) {
                endGameScoringOffline();
                return;
            }
            state.userStage = 'TAKING';
        }

        renderAll();
        startTurnTimerOffline();

        if (state.currentTurn !== 0) {
            setTimeout(() => {
                simulateCurrentOpponentTurnOffline();
            }, 1200);
        }
    }

    function simulateCurrentOpponentTurnOffline() {
        if (state.currentTurn === 0) return;

        const bot = state.players[state.currentTurn];
        const prevPlayerId = (state.currentTurn + state.players.length - 1) % state.players.length;

        let hasEaten = false;
        if (state.latestDiscard && state.latestDiscard.playerIndex === prevPlayerId) {
            if (PhomLogic.canEatCard(bot.hand, state.latestDiscard.card)) {
                const eatenCard = state.latestDiscard.card;
                eatenCard.isEaten = true;
                bot.hand.push(eatenCard);
                bot.eatenCards = bot.eatenCards || [];
                bot.eatenCards.push(eatenCard);

                showToast(`${bot.name} vừa ĂN lá [${eatenCard.label}${eatenCard.symbol}]!`);
                window.soundFX.playEat();
                state.latestDiscard = null;
                hasEaten = true;
            }
        }

        if (!hasEaten && state.deck.cards.length > 0) {
            const drawn = state.deck.deal(1)[0];
            bot.hand.push(drawn);
            window.soundFX.playCardDeal();
        }

        setTimeout(() => {
            const best = PhomLogic.findBestMelds(bot.hand);
            let discardCard;
            const playableTrash = best.trash.filter(c => !c.isEaten);
            if (playableTrash.length > 0) {
                discardCard = playableTrash.sort((a,b) => b.score - a.score)[0];
            } else {
                const playableHand = bot.hand.filter(c => !c.isEaten);
                discardCard = playableHand[0] || bot.hand[0];
            }

            bot.hand = bot.hand.filter(c => c.id !== discardCard.id);
            bot.discards.push(discardCard);

            state.latestDiscard = { card: discardCard, playerIndex: state.currentTurn };
            window.soundFX.playCardPlay();

            if (state.round === 4) {
                if (best.melds.length > 0) {
                    bot.melds = best.melds;
                    const meldIds = new Set(best.melds.flat().map(c => c.id));
                    bot.hand = bot.hand.filter(c => !meldIds.has(c.id));
                    showToast(`${bot.name} đã Hạ ${bot.melds.length} Phỏm!`);
                } else {
                    bot.isMom = true;
                    showToast(`${bot.name} bị Cháy (Móm)!`);
                }
            }

            const nextPlayerId = (state.currentTurn + 1) % state.players.length;
            if (nextPlayerId === 0) {
                const userCanEat = PhomLogic.canEatCard(state.players[0].hand, discardCard);
                if (userCanEat) {
                    showToast(`⚡ Cây [${discardCard.label}${discardCard.symbol}] ĂN ĐƯỢC! Bấm nút Ăn ngay!`);
                }
            }

            nextTurnOffline();
        }, 800);
    }

    function endGameScoringOffline() {
        clearInterval(state.timerInterval);
        const results = state.players.map(p => {
            const best = PhomLogic.findBestMelds(p.hand);
            const isMom = p.isMom || (p.melds.length === 0 && best.melds.length === 0);
            return {
                name: p.name,
                avatar: p.avatar,
                melds: p.melds.length > 0 ? p.melds : best.melds,
                trashScore: isMom ? 999 : PhomLogic.calculateTrashScore(p.hand),
                isMom: isMom
            };
        });

        results.sort((a, b) => a.trashScore - b.trashScore);
        showEndGameModalOnline(results);
    }

    function handleWinOffline(winnerId, reason) {
        clearInterval(state.timerInterval);
        const p = state.players[winnerId];
        handleWinOnline({
            winnerName: p.name,
            winnerAvatar: p.avatar,
            reason: reason
        });
    }

    function showToast(msg) {
        dom.toast.textContent = msg;
        dom.toast.classList.add('show');
        setTimeout(() => {
            dom.toast.classList.remove('show');
        }, 2400);
    }

    function bindActionButtons() {
        dom.btnEat.addEventListener('click', actionEat);
        dom.btnDraw.addEventListener('click', actionDraw);
        dom.btnPlay.addEventListener('click', actionPlay);
        dom.btnMeld.addEventListener('click', actionMeld);
        dom.btnChay.addEventListener('click', actionChay);
        dom.btnSend.addEventListener('click', actionSend);

        dom.btnSort.addEventListener('click', () => {
            state.sortMode = state.sortMode === 'smart' ? 'rank' : 'smart';
            dom.btnSort.textContent = state.sortMode === 'smart' ? '✨ Xếp: Phỏm/Cạ' : '🔢 Xếp: Theo số';
            window.soundFX.playCardSelect();
            renderUserHand();
        });

        dom.nocDeck.addEventListener('click', () => {
            const isMyTurn = state.isOnline ? (state.currentTurn === state.myOnlineSeat) : (state.currentTurn === 0);
            if (isMyTurn && state.userStage === 'TAKING') {
                actionDraw();
            }
        });

        dom.btnDealNew.addEventListener('click', () => {
            if (state.isOnline) {
                dom.lobbyModal.classList.add('open');
            } else {
                startNewOfflineGame();
            }
        });

        document.getElementById('btnCloseModal').addEventListener('click', () => {
            dom.scoreModal.classList.remove('open');
            if (state.isOnline) {
                dom.lobbyModal.classList.add('open');
            } else {
                startNewOfflineGame();
            }
        });

        dom.btnSoundToggle.addEventListener('click', () => {
            const on = window.soundFX.toggle();
            dom.btnSoundToggle.textContent = on ? '🔊 Âm thanh' : '🔇 Tắt tiếng';
        });
    }

    function bindSimulatorControls() {
        const btnLandscape = document.getElementById('btnModeLandscape');
        const btnPortrait = document.getElementById('btnModePortrait');
        const btnFluid = document.getElementById('btnModeFluid');

        function setMode(mode, activeBtn) {
            dom.viewportFrame.className = `device-frame ${mode}`;
            [btnLandscape, btnPortrait, btnFluid].forEach(b => b.classList.remove('active'));
            activeBtn.classList.add('active');
        }

        btnLandscape.addEventListener('click', () => setMode('landscape', btnLandscape));
        btnPortrait.addEventListener('click', () => setMode('portrait', btnPortrait));
        btnFluid.addEventListener('click', () => setMode('fluid', btnFluid));
    }
});
