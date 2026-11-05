// Phom (Ta La) Game Logic Engine
const SUITS = [
    { id: 'spade', symbol: '♠', name: 'Bích', color: 'black' },
    { id: 'club', symbol: '♣', name: 'Tép', color: 'black' },
    { id: 'diamond', symbol: '♦', name: 'Rô', color: 'red' },
    { id: 'heart', symbol: '♥', name: 'Cơ', color: 'red' }
];

const RANKS = [
    { value: 1, label: 'A', name: 'Át', score: 1 },
    { value: 2, label: '2', name: 'Hai', score: 2 },
    { value: 3, label: '3', name: 'Ba', score: 3 },
    { value: 4, label: '4', name: 'Bốn', score: 4 },
    { value: 5, label: '5', name: 'Năm', score: 5 },
    { value: 6, label: '6', name: 'Sáu', score: 6 },
    { value: 7, label: '7', name: 'Bảy', score: 7 },
    { value: 8, label: '8', name: 'Tám', score: 8 },
    { value: 9, label: '9', name: 'Chín', score: 9 },
    { value: 10, label: '10', name: 'Mười', score: 10 },
    { value: 11, label: 'J', name: 'Bồi', score: 11 },
    { value: 12, label: 'Q', name: 'Đầm', score: 12 },
    { value: 13, label: 'K', name: 'Già', score: 13 }
];

class Card {
    constructor(rank, suit) {
        this.rank = rank; // 1 - 13
        this.suit = suit; // 'spade', 'club', 'diamond', 'heart'
        this.id = `${rank}_${suit}`;
    }

    get rankObj() {
        return RANKS.find(r => r.value === this.rank);
    }

    get suitObj() {
        return SUITS.find(s => s.id === this.suit);
    }

    get label() {
        return this.rankObj.label;
    }

    get symbol() {
        return this.suitObj.symbol;
    }

    get color() {
        return this.suitObj.color;
    }

    get score() {
        return this.rankObj.score;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const s of SUITS) {
            for (const r of RANKS) {
                this.cards.push(new Card(r.value, s.id));
            }
        }
    }

    shuffle() {
        // Thuật toán xáo bài Fisher-Yates
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal(count) {
        return this.cards.splice(0, count);
    }
}

class PhomLogic {
    // Kiểm tra xem 1 mảng bài có phải là Phỏm hợp lệ không
    static isPhom(cards) {
        if (!cards || cards.length < 3) return false;

        // 1. Phỏm Ngang (Sáp): Cùng giá trị rank
        const allSameRank = cards.every(c => c.rank === cards[0].rank);
        if (allSameRank && cards.length >= 3 && cards.length <= 4) {
            // Đảm bảo không trùng chất
            const uniqueSuits = new Set(cards.map(c => c.suit));
            return uniqueSuits.size === cards.length;
        }

        // 2. Phỏm Dọc (Sảnh): Cùng chất, liên tiếp rank
        const allSameSuit = cards.every(c => c.suit === cards[0].suit);
        if (allSameSuit && cards.length >= 3) {
            const sorted = [...cards].sort((a, b) => a.rank - b.rank);
            for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i + 1].rank !== sorted[i].rank + 1) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    // Tìm tất cả các Phỏm có thể tạo thành từ 1 tập bài
    static findAllPhoms(cards) {
        const phoms = [];
        const n = cards.length;
        if (n < 3) return phoms;

        // 1. Tìm các bộ cùng số (Sáp 3 hoặc 4 lá)
        const rankMap = {};
        cards.forEach(c => {
            if (!rankMap[c.rank]) rankMap[c.rank] = [];
            rankMap[c.rank].push(c);
        });

        for (const r in rankMap) {
            const group = rankMap[r];
            if (group.length >= 3) {
                phoms.push([...group]);
                // Nếu có 4 lá, tạo thêm các tổ hợp 3 lá con
                if (group.length === 4) {
                    for (let i = 0; i < 4; i++) {
                        phoms.push(group.filter((_, idx) => idx !== i));
                    }
                }
            }
        }

        // 2. Tìm các sảnh cùng chất (từ 3 lá trở lên)
        const suitMap = {};
        cards.forEach(c => {
            if (!suitMap[c.suit]) suitMap[c.suit] = [];
            suitMap[c.suit].push(c);
        });

        for (const s in suitMap) {
            const group = suitMap[s].sort((a, b) => a.rank - b.rank);
            if (group.length >= 3) {
                for (let len = 3; len <= group.length; len++) {
                    for (let start = 0; start <= group.length - len; start++) {
                        const sub = group.slice(start, start + len);
                        if (this.isPhom(sub)) {
                            phoms.push(sub);
                        }
                    }
                }
            }
        }

        return phoms;
    }

    // Tìm tổ hợp Phỏm tối ưu nhất (giữ lại điểm rác thấp nhất)
    static findBestMelds(cards) {
        const allPhoms = this.findAllPhoms(cards);
        if (allPhoms.length === 0) {
            return { melds: [], trash: [...cards], score: this.calculateTrashScore(cards) };
        }

        // Thử các tổ hợp Phỏm không trùng bài nhau
        let bestResult = {
            melds: [],
            trash: [...cards],
            score: this.calculateTrashScore(cards)
        };

        // Hàm đệ quy tìm tổ hợp không chồng lấn lá bài
        function backtrack(idx, currentMelds, usedIds) {
            if (idx >= allPhoms.length) {
                // Tính rác còn lại
                const trash = cards.filter(c => !usedIds.has(c.id));
                const score = PhomLogic.calculateTrashScore(trash);
                if (score < bestResult.score || (score === bestResult.score && currentMelds.length > bestResult.melds.length)) {
                    bestResult = {
                        melds: [...currentMelds],
                        trash: trash,
                        score: score
                    };
                }
                return;
            }

            // Phương án 1: Bỏ qua phỏm này
            backtrack(idx + 1, currentMelds, usedIds);

            // Phương án 2: Thử lấy phỏm này nếu không bị trùng lá bài
            const phom = allPhoms[idx];
            const hasConflict = phom.some(c => usedIds.has(c.id));
            if (!hasConflict) {
                const newUsed = new Set(usedIds);
                phom.forEach(c => newUsed.add(c.id));
                currentMelds.push(phom);
                backtrack(idx + 1, currentMelds, newUsed);
                currentMelds.pop();
            }
        }

        backtrack(0, [], new Set());
        return bestResult;
    }

    // Tìm các Cạ (2 lá đang chờ ghép thành Phỏm)
    static findCaGroups(cards) {
        const cas = [];
        const used = new Set();

        // 1. Cạ đôi (cùng rank)
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                if (cards[i].rank === cards[j].rank) {
                    cas.push({ type: 'doi', cards: [cards[i], cards[j]] });
                }
            }
        }

        // 2. Cạ sảnh (cùng chất, liền kề hoặc cách 1)
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                if (cards[i].suit === cards[j].suit) {
                    const diff = Math.abs(cards[i].rank - cards[j].rank);
                    if (diff === 1) {
                        cas.push({ type: 'sanh_lien', cards: [cards[i], cards[j]] });
                    } else if (diff === 2) {
                        cas.push({ type: 'sanh_cach', cards: [cards[i], cards[j]] });
                    }
                }
            }
        }

        return cas;
    }

    // Kiểm tra xem lá bài đối thủ đánh ra có ĂN được không
    static canEatCard(hand, targetCard) {
        // Thử ghép targetCard vào tay xem có tạo ra Phỏm mới hợp lệ không
        const testHand = [...hand, targetCard];
        const phomsWithTarget = this.findAllPhoms(testHand).filter(p => 
            p.some(c => c.id === targetCard.id)
        );
        return phomsWithTarget.length > 0;
    }

    // Kiểm tra xem lá bài có thể GỬI vào một Phỏm đã hạ hay không
    static canAddToPhom(card, phom) {
        if (!phom || phom.length < 3) return false;
        const newPhom = [...phom, card];
        return this.isPhom(newPhom);
    }

    // Tìm tất cả các lá bài trên tay có thể gửi vào các Phỏm đã hạ trên bàn
    static findPossibleLayoffs(trashCards, opponentPhoms) {
        const layoffs = []; // { card, targetPhom, targetPlayerIndex }
        trashCards.forEach(card => {
            opponentPhoms.forEach(op => {
                if (this.canAddToPhom(card, op.phom)) {
                    layoffs.push({
                        card: card,
                        targetPhom: op.phom,
                        playerIndex: op.playerIndex,
                        playerName: op.playerName
                    });
                }
            });
        });
        return layoffs;
    }

    // Tính tổng điểm các lá bài rác
    static calculateTrashScore(trashCards) {
        return trashCards.reduce((sum, c) => sum + c.score, 0);
    }

    // Sắp xếp bài thông minh: Phỏm -> Cạ -> Rác
    static smartSort(cards) {
        const best = this.findBestMelds(cards);
        const meldIds = new Set(best.melds.flat().map(c => c.id));
        const nonMeld = cards.filter(c => !meldIds.has(c.id));

        // Phân loại cạ trong nhóm nonMeld
        const cas = this.findCaGroups(nonMeld);
        const caIds = new Set(cas.flatMap(g => g.cards.map(c => c.id)));
        const trash = nonMeld.filter(c => !caIds.has(c.id));

        // Sort từng nhóm
        const sortedMelds = best.melds.flatMap(m => m.sort((a, b) => a.rank - b.rank));
        const sortedCas = nonMeld.filter(c => caIds.has(c.id)).sort((a, b) => a.rank - b.rank);
        const sortedTrash = trash.sort((a, b) => a.rank - b.rank);

        return [...sortedMelds, ...sortedCas, ...sortedTrash];
    }
}

if (typeof window !== 'undefined') {
    window.Card = Card;
    window.Deck = Deck;
    window.PhomLogic = PhomLogic;
    window.SUITS = SUITS;
    window.RANKS = RANKS;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Card, Deck, PhomLogic, SUITS, RANKS };
}
