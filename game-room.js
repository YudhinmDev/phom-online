// Phom Game Room Manager (Authoritative Server Logic)
const { PhomLogic, Deck, Card } = require('./phom-logic.js');

class GameRoom {
    constructor(code, hostWs, hostName, hostAvatar) {
        this.code = code;
        this.status = 'LOBBY'; // 'LOBBY', 'PLAYING', 'ENDED'
        this.players = []; // [{ id, ws, name, avatar, seatIndex, isReady, isHost }]
        this.deck = new Deck();
        this.round = 1;
        this.currentTurn = 0;
        this.turnStage = 'PLAYING'; // 'TAKING', 'PLAYING', 'MELDING', 'LAYOFF'
        this.latestDiscard = null; // { card, playerIndex }
        this.turnTimer = null;
        this.timeLeft = 60; // Thời gian suy nghĩ là 1 phút (60s)

        this.hands = [];      // Array of [Card, ...] for each seat
        this.discards = [];   // Array of [Card, ...] for each seat
        this.melds = [];      // Array of [[Card, ...], ...] for each seat
        this.eatenCards = []; // Array of [Card, ...] lá bài đã ăn được để trước mặt
        this.isMom = [];      // Array of boolean

        this.addPlayer(hostWs, hostName, hostAvatar, true);
    }

    addPlayer(ws, name, avatar, isHost = false) {
        if (this.players.length >= 4) {
            ws.send('error_msg', { message: 'Phòng đã đủ 4 người chơi!' });
            return false;
        }
        if (this.status !== 'LOBBY') {
            ws.send('error_msg', { message: 'Ván bài đang diễn ra!' });
            return false;
        }

        const seatIndex = this.players.length;
        const player = {
            id: ws.id,
            ws: ws,
            name: name || `Người chơi ${seatIndex + 1}`,
            avatar: avatar || '🧑‍💻',
            seatIndex: seatIndex,
            isReady: isHost, // Host is ready by default
            isHost: isHost
        };

        this.players.push(player);
        ws.data.roomCode = this.code;
        ws.data.seatIndex = seatIndex;

        this.broadcastLobbyUpdate();
        return true;
    }

    removePlayer(wsId) {
        const idx = this.players.findIndex(p => p.id === wsId);
        if (idx === -1) return;

        const removed = this.players.splice(idx, 1)[0];

        // Re-assign seats
        this.players.forEach((p, i) => {
            p.seatIndex = i;
            p.ws.data.seatIndex = i;
        });

        // Pass host to next player if host left
        if (removed.isHost && this.players.length > 0) {
            this.players[0].isHost = true;
            this.players[0].isReady = true;
        }

        if (this.status === 'PLAYING') {
            this.broadcast('toast_alert', { message: `${removed.name} đã rời bàn! Ván đấu kết thúc.` });
            this.endGame();
        } else {
            this.broadcastLobbyUpdate();
        }
    }

    toggleReady(wsId) {
        const player = this.players.find(p => p.id === wsId);
        if (!player || player.isHost) return;
        player.isReady = !player.isReady;
        this.broadcastLobbyUpdate();
    }

    broadcastLobbyUpdate() {
        const lobbyData = {
            roomCode: this.code,
            status: this.status,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                seatIndex: p.seatIndex,
                isReady: p.isReady,
                isHost: p.isHost
            }))
        };
        this.broadcast('lobby_update', lobbyData);
    }

    startGame(hostWsId) {
        const host = this.players.find(p => p.id === hostWsId);
        if (!host || !host.isHost) return;
        if (this.players.length < 2) {
            host.ws.send('error_msg', { message: 'Cần tối thiểu 2 người chơi để bắt đầu!' });
            return;
        }

        this.status = 'PLAYING';
        this.round = 1;
        this.currentTurn = 0;
        this.turnStage = 'PLAYING'; // Seat 0 có 10 lá nên stage đầu là PLAYING (chờ đánh)
        this.latestDiscard = null;

        // Reset bộ bài
        this.deck.reset();
        this.deck.shuffle();

        const n = this.players.length;
        this.hands = [];
        this.discards = [];
        this.melds = [];
        this.eatenCards = [];
        this.isMom = [];

        for (let i = 0; i < n; i++) {
            // Người đánh đầu tiên có 10 lá, các người sau có 9 lá
            const count = (i === 0) ? 10 : 9;
            this.hands.push(this.deck.deal(count));
            this.discards.push([]);
            this.melds.push([]);
            this.eatenCards.push([]);
            this.isMom.push(false);
        }

        // Gửi dữ liệu khởi tạo cho từng người (chỉ gửi BÀI RIÊNG của người đó để chống gian lận)
        this.players.forEach(p => {
            const publicPlayers = this.players.map(other => ({
                name: other.name,
                avatar: other.avatar,
                seatIndex: other.seatIndex,
                cardCount: this.hands[other.seatIndex].length,
                discards: this.discards[other.seatIndex],
                melds: this.melds[other.seatIndex],
                eatenCards: this.eatenCards[other.seatIndex]
            }));

            p.ws.send('game_started', {
                roomCode: this.code,
                mySeat: p.seatIndex,
                myHand: this.hands[p.seatIndex],
                players: publicPlayers,
                round: this.round,
                currentTurn: this.currentTurn,
                stage: this.turnStage,
                nocCount: this.deck.cards.length
            });
        });

        this.broadcast('toast_alert', { message: `Ván đấu bắt đầu! ${this.players[0].name} đánh trước.` });
        this.startTimer();
    }

    startTimer() {
        clearInterval(this.turnTimer);
        this.timeLeft = 60; // 1 phút suy nghĩ
        this.broadcast('timer_tick', { timeLeft: this.timeLeft, currentTurn: this.currentTurn });

        this.turnTimer = setInterval(() => {
            this.timeLeft--;
            this.broadcast('timer_tick', { timeLeft: this.timeLeft, currentTurn: this.currentTurn });

            if (this.timeLeft <= 0) {
                clearInterval(this.turnTimer);
                this.handleTimeout();
            }
        }, 1000);
    }

    handleTimeout() {
        const seat = this.currentTurn;
        const hand = this.hands[seat];

        if (this.turnStage === 'TAKING') {
            this.handleDraw(seat);
            setTimeout(() => {
                if (this.turnStage === 'PLAYING') {
                    // Tự động đánh lá bài có điểm cao nhất
                    const highest = [...this.hands[seat]].sort((a,b) => b.score - a.score)[0];
                    if (highest) this.handlePlay(seat, highest.id);
                }
            }, 500);
        } else if (this.turnStage === 'PLAYING') {
            const highest = [...hand].sort((a,b) => b.score - a.score)[0];
            if (highest) this.handlePlay(seat, highest.id);
        } else if (this.turnStage === 'MELDING') {
            const best = PhomLogic.findBestMelds(hand);
            if (best.melds.length > 0) this.handleMeld(seat);
            else this.handleChay(seat);
        } else if (this.turnStage === 'LAYOFF') {
            this.handleLayoff(seat);
        }
    }

    handleDraw(seatIndex) {
        if (seatIndex !== this.currentTurn || this.turnStage !== 'TAKING') return;
        if (this.deck.cards.length === 0) return;

        const card = this.deck.deal(1)[0];
        this.hands[seatIndex].push(card);
        this.turnStage = 'PLAYING';

        const player = this.players[seatIndex];
        // Gửi lá bài thật cho người bốc
        player.ws.send('card_drawn_self', { card: card, hand: this.hands[seatIndex] });

        // Thông báo công khai số lượng bài còn lại trong nọc
        this.broadcast('player_drew_public', {
            seatIndex: seatIndex,
            nocCount: this.deck.cards.length,
            cardCount: this.hands[seatIndex].length
        });
    }

    handleEat(seatIndex) {
        if (seatIndex !== this.currentTurn || this.turnStage !== 'TAKING') return;
        if (!this.latestDiscard) return;

        const prevSeat = (seatIndex + this.players.length - 1) % this.players.length;
        if (this.latestDiscard.playerIndex !== prevSeat) return;

        const hand = this.hands[seatIndex];
        const cardToEat = this.latestDiscard.card;

        if (!PhomLogic.canEatCard(hand, cardToEat)) return;

        cardToEat.isEaten = true;
        this.eatenCards[seatIndex].push(cardToEat); // Để ngửa trước mặt
        hand.push(cardToEat);
        this.turnStage = 'PLAYING';
        this.latestDiscard = null;

        const player = this.players[seatIndex];
        player.ws.send('card_eaten_self', {
            card: cardToEat,
            hand: hand,
            eatenCards: this.eatenCards[seatIndex]
        });

        this.broadcast('player_eaten_public', {
            seatIndex: seatIndex,
            card: cardToEat,
            eatenCards: this.eatenCards[seatIndex],
            cardCount: hand.length
        });

        this.broadcast('toast_alert', { message: `${player.name} vừa ĂN lá [${cardToEat.label}${cardToEat.symbol}]!` });
    }

    handlePlay(seatIndex, cardId) {
        if (seatIndex !== this.currentTurn || this.turnStage !== 'PLAYING') return;

        const hand = this.hands[seatIndex];
        const cardIdx = hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return;

        const card = hand[cardIdx];
        // LUẬT PHỎM: Tuyệt đối không được đánh lá bài đã ăn!
        if (card.isEaten) {
            const player = this.players[seatIndex];
            player.ws.send('error_msg', { message: 'Không được đánh lá bài bạn đã ăn!' });
            return;
        }

        hand.splice(cardIdx, 1);
        this.discards[seatIndex].push(card);
        this.latestDiscard = { card: card, playerIndex: seatIndex };

        const player = this.players[seatIndex];
        player.ws.send('hand_updated', { hand: hand });

        this.broadcast('card_played_public', {
            seatIndex: seatIndex,
            card: card,
            cardCount: hand.length,
            discards: this.discards[seatIndex]
        });

        // Kiểm tra Ù sau khi đánh
        const best = PhomLogic.findBestMelds(hand);
        if (best.trash.length === 0 && best.melds.length > 0) {
            this.handleWin(seatIndex, 'Ù Tròn!');
            return;
        }

        // VÒNG CHỐT (VÒNG 4):
        if (this.round === 4) {
            this.turnStage = 'MELDING';
            player.ws.send('prompt_meld', {
                hasPhom: best.melds.length > 0,
                melds: best.melds
            });
            return;
        }

        this.nextTurn();
    }

    handleMeld(seatIndex) {
        if (seatIndex !== this.currentTurn || this.turnStage !== 'MELDING') return;

        const hand = this.hands[seatIndex];
        const best = PhomLogic.findBestMelds(hand);

        if (best.melds.length === 0) {
            this.handleChay(seatIndex);
            return;
        }

        this.melds[seatIndex] = best.melds;
        const meldIds = new Set(best.melds.flat().map(c => c.id));
        this.hands[seatIndex] = hand.filter(c => !meldIds.has(c.id));

        const player = this.players[seatIndex];
        player.ws.send('hand_updated', { hand: this.hands[seatIndex], melds: this.melds[seatIndex] });

        this.broadcast('player_melded_public', {
            seatIndex: seatIndex,
            melds: this.melds[seatIndex],
            cardCount: this.hands[seatIndex].length
        });

        this.broadcast('toast_alert', { message: `${player.name} đã Hạ ${best.melds.length} Phỏm!` });

        // Chuyển sang bước GỬI BÀI
        this.turnStage = 'LAYOFF';
        player.ws.send('prompt_layoff', {});
    }

    handleChay(seatIndex) {
        if (seatIndex !== this.currentTurn) return;
        this.isMom[seatIndex] = true;
        const player = this.players[seatIndex];
        this.broadcast('toast_alert', { message: `${player.name} bị Cháy (Móm)!` });
        this.nextTurn();
    }

    handleLayoff(seatIndex) {
        if (seatIndex !== this.currentTurn) return;

        const hand = this.hands[seatIndex];
        const allOpponentPhoms = [];

        this.players.forEach((p, idx) => {
            if (idx !== seatIndex && this.melds[idx].length > 0) {
                this.melds[idx].forEach((m, phomIdx) => {
                    allOpponentPhoms.push({ phom: m, playerIndex: idx, phomIndex: phomIdx, playerName: p.name });
                });
            }
        });

        const layoffs = PhomLogic.findPossibleLayoffs(hand, allOpponentPhoms);
        if (layoffs.length > 0) {
            layoffs.forEach(lo => {
                this.hands[seatIndex] = this.hands[seatIndex].filter(c => c.id !== lo.card.id);
                lo.targetPhom.push(lo.card);
                this.broadcast('toast_alert', { message: `${this.players[seatIndex].name} đã gửi lá [${lo.card.label}${lo.card.symbol}] vào phỏm của ${lo.playerName}!` });
            });

            this.players.forEach(p => {
                p.ws.send('all_melds_updated', {
                    melds: this.melds,
                    myHand: this.hands[p.seatIndex]
                });
            });
        }

        this.nextTurn();
    }

    nextTurn() {
        clearInterval(this.turnTimer);
        const total = this.players.length;
        this.currentTurn = (this.currentTurn + 1) % total;

        if (this.currentTurn === 0) {
            this.round++;
            if (this.round > 4) {
                this.endGame();
                return;
            }
        }

        this.turnStage = 'TAKING';
        this.broadcast('turn_changed', {
            currentTurn: this.currentTurn,
            round: this.round,
            stage: this.turnStage,
            latestDiscard: this.latestDiscard
        });

        this.startTimer();
    }

    endGame() {
        clearInterval(this.turnTimer);
        this.status = 'ENDED';

        const results = this.players.map((p, idx) => {
            const isMom = this.isMom[idx] || (this.melds[idx].length === 0);
            const score = isMom ? 999 : PhomLogic.calculateTrashScore(this.hands[idx]);
            return {
                seatIndex: idx,
                name: p.name,
                avatar: p.avatar,
                melds: this.melds[idx],
                trashScore: score,
                isMom: isMom
            };
        });

        results.sort((a, b) => a.trashScore - b.trashScore);

        this.broadcast('game_ended', { results: results });
    }

    handleWin(winnerSeat, reason) {
        clearInterval(this.turnTimer);
        this.status = 'ENDED';
        const winner = this.players[winnerSeat];
        this.broadcast('game_won_instant', {
            winnerSeat: winnerSeat,
            winnerName: winner.name,
            winnerAvatar: winner.avatar,
            reason: reason
        });
    }

    broadcast(event, data) {
        this.players.forEach(p => {
            if (p.ws) p.ws.send(event, data);
        });
    }
}

module.exports = { GameRoom };
