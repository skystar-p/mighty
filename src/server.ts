import io = require('socket.io');
import uuid = require('uuid/v4');
import { Card, CardSuit, Giruda, shuffleCard } from './card';

const enum GameStatus {
    Ready,
    DealMissPending,
    Commitment,
    PresidentReady,
    MainGame,
}

const enum Role {
    President,
    Friend,
    Opposition,
    None,
}

const enum CommitStatus {
    None,
    Committed,
    Passed
}

interface Commitment {
    giruda: Giruda;
    score: number;
}

interface Turn {
    currentSuit: string | null;
    prevCard: string;
    jokerCall: boolean;
}

interface Play {
    card: string;
    suit: string;
    jokerCall: boolean;
}

interface FirstTurnFriend {
    kind: 'first-turn';
}

interface SelectionFriend {
    kind: 'selection';
    selection: string;
}

interface CardFriend {
    kind: 'card';
    card: Card;
}

type FriendSelection = FirstTurnFriend | SelectionFriend | CardFriend | null;

class PlayerStatus {
    cards: Card[] = [];
    role: Role = Role.None;
    playedCard: Card | null;
    // for game start
    ready: boolean = false;
    // for check deal-miss or not
    commitReady: boolean = false;
    // for check if player commitment is done
    commitStatus: CommitStatus = CommitStatus.None;
    score: number = 0;

    constructor() {

    }

    consumeCard(card: Card) {
        this.cards.splice(this.cards.map(x => x.toString()).indexOf(card.toString()), 1);
    }
}

// 5ma
class RoomData {
    id: string;
    playerList: string[] = [];
    turn: number = 0;
    commitment: Commitment = { giruda: Giruda.None, score: 11 };
    friendSelection: FriendSelection = null;
    floor: Card[] = [];
    gameStatus: GameStatus = GameStatus.Ready;
    playerStatus: { [playerId: string]: PlayerStatus } = {};
    turnStatus: Turn | null;
    turnIndex: number;

    constructor(roomId: string, roomCreator: UserData) {
        this.id = roomId;
        this.join(roomCreator);
    }

    reset() {
        this.gameStatus = GameStatus.Ready;
        this.turn = 0;
        this.turnStatus = null;
        this.commitment = { giruda: Giruda.None, score: 11 };
        this.friendSelection = null;
        this.playerList.forEach(userId => {
            let ps: PlayerStatus = this.playerStatus[userId];
            ps.cards = [];
            ps.score = 0;
            ps.playedCard = null;
            ps.ready = false;
            ps.commitReady= false;
            ps.commitStatus = CommitStatus.None;
            ps.role = Role.None;
        });
        // emit reset event to room
        server.in(this.id).emit('reset');
    }

    isValidCommitment(commitment: Commitment | null): boolean {
        if (commitment === null) return true;
        if (commitment.score > 20) return false;
        const oldScore = this.commitment.score + (this.commitment.giruda === Giruda.None ? 1 : 0);
        const newScore = commitment.score + (commitment.giruda === Giruda.None ? 1 : 0);
        return newScore > oldScore;
    }

    get passes(): number {
        let counter = 0;
        this.playerList.forEach(userId => {
            counter += this.playerStatus[userId].commitStatus === CommitStatus.Passed ? 1 : 0
        });
        return counter;
    }

    get commits(): number {
        let counter = 0;
        this.playerList.forEach(userId => {
            counter += this.playerStatus[userId].commitStatus === CommitStatus.Committed ? 1 : 0
        });
        return counter;
    }

    get onlyCommit(): string | null {
        const users = this.playerList.filter(userId => {
            return this.playerStatus[userId].commitStatus === CommitStatus.Committed;
        });
        if (users.length !== 1) return null;
        return users[0];
    }

    changeHead(userId: string) {
        const idx = this.playerList.indexOf(userId);
        this.playerList = this.playerList.slice(idx).concat(this.playerList.slice(0, idx));
    }

    nextTurn() {
        this.turn = (this.turn + 1) % 5;
    }

    get currentTurn(): UserData {
        return userData[this.playerList[this.turn]];
    }

    join(user: UserData): boolean {
        if (user.isJoined()) {
            return false;
        }
        if (this.playerList.length >= 5) {
            return false;
        }
        this.playerList.push(user.id);
        this.playerStatus[user.id] = new PlayerStatus();
        user.roomId = this.id;
        return true;
    }

    leave(user: UserData): boolean {
        const idx = this.playerList.indexOf(user.id);
        if (idx === -1) {
            return false;
        }
        if (this.gameStatus !== 0) {
            return false;
        }
        this.playerList.splice(idx, 1);
        delete this.playerStatus[user.id];
        return true;
    }

    forcedLeave(user: UserData) {
        // for now
        this.leave(user);
        this.reset();
    }

    isAllReady(): boolean {
        let readyCount = 0;
        this.playerList.forEach(userId => {
            readyCount += +this.playerStatus[userId].ready;
        });
        return readyCount === 5;
    }

    isAllCommitmentReady(): boolean {
        let commitCount = 0;
        this.playerList.forEach(userId => {
            commitCount += +this.playerStatus[userId].commitReady;
        });
        return commitCount === 5;
    }
}

class UserData {
    id: string;
    roomId: string;
    nickname: string;
    constructor(userId: string) {
        this.id = userId;
        this.roomId = '';
        this.nickname = '';
    }

    isJoined(): boolean {
        return this.roomId !== '';
    }
}

// construct server instance
const server = io(12345);

let roomData: { [roomId: string]: RoomData } = {};

let userData: { [userId: string]: UserData } = {};

// socket connected
server.on('connect', socket => {
    userData[socket.id] = new UserData(socket.id);

    socket.on('disconnect', reason => {
        const user = userData[socket.id];
        if (user.isJoined()) {
            roomData[user.roomId].forcedLeave(user);
        }
        delete userData[socket.id];
    });

    socket.on('set-nickname', (data, reply) => {
        const user = userData[socket.id];
        if (data) {
            user.nickname = data;
            reply(true);
        }
        else {
            reply(false);
        }
    });

    socket.on('room-list', (reply) => {
        reply(Object.keys(roomData));
    });

    socket.on('nickname-query', (data: string[], reply) => {
        let nicknames: {[userId: string]: string} = {};
        data.forEach(userId => {
            nicknames[userId] = userData[userId].nickname;
        });
        reply(nicknames);
    });

    socket.on('create-room', (reply) => {
        const userId = socket.id;
        const user = userData[userId];
        if (user.isJoined()) {
            reply(null);
            return;
        }
        // generate random string
        const roomId = uuid();
        const room = new RoomData(roomId, user);
        roomData[roomId] = room;
        reply(roomId);
    });

    socket.on('join-room', (data, reply) => {
        // data: room id
        const userId = socket.id;
        const user = userData[userId];
        if (user.isJoined()) {
            reply(null);
            return;
        }
        if (!(data in roomData)) {
            reply(null);
            return;
        }
        if (!roomData[data].join(user)) {
            reply(null);
            return;
        }
        reply(roomData[data].playerList);
    });

    socket.on('ready', (reply) => {
        // data is none
        const user = userData[socket.id];
        const room = roomData[user.roomId];

        if (room.gameStatus !== GameStatus.Ready) {
            reply(false);
            return;
        }

        room.playerStatus[user.id].ready = true;
        if (room.isAllReady()) {
            readyGame(room);
            room.playerList.forEach(userId => {
                const cards = room.playerStatus[userId].cards.map(x => x.toString());
                server.to(userId).emit('deal', cards);
            });
        }
        reply(true);
    });

    socket.on('ready-cancel', (reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];

        if (room.gameStatus !== GameStatus.Ready) {
            reply(false);
            return;
        }

        room.playerStatus[user.id].ready = false;
        reply(true);
    });

    socket.on('deal-miss', (data, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];
        const playerStatus = room.playerStatus[user.id];

        if (room.gameStatus !== GameStatus.DealMissPending) {
            reply(false);
            return;
        }

        if (!data) {
            room.playerStatus[user.id].commitReady = true;
            if (room.isAllCommitmentReady()) {
                room.gameStatus = GameStatus.Commitment;
                server.to(room.id).emit('commitment-request', room.currentTurn.id);
            }
            reply(true);
            return;
        }

        const totalPoint = playerStatus.cards
            .map(x => x.dealPoint).reduce((prev, next) => prev + next);

        if (totalPoint > 0) {
            reply(false);
            return;
        }

        room.changeHead(user.id);
        room.reset();
        reply(true);
    });

    socket.on('commitment', (data: Commitment | null, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];
        const playerStatus = room.playerStatus[user.id];

        if (room.gameStatus !== GameStatus.Commitment) {
            reply(false);
            return;
        }

        if (socket.id !== room.currentTurn.id) {
            reply(false);
            return;
        }

        if (data === null) {
            playerStatus.commitStatus = CommitStatus.Passed;
            reply(true);

            if (room.passes === 4 && room.commits === 1) {
                room.gameStatus = GameStatus.PresidentReady;
                const president = server.sockets.connected[room.onlyCommit];
                president.to(room.id).broadcast.emit('waiting-president');
                president.emit('floor-cards', room.floor.map(x => x.toString()))
                return;
            }

            let counter = 0;
            while (room.playerStatus[room.currentTurn.id].commitStatus === CommitStatus.Passed) {
                room.nextTurn();
                counter++;

                if (counter >= 5) {
                    room.reset();
                    return;
                }
            }
            server.to(room.id).emit('commitment-request', room.currentTurn.id);
            return;
        }

        if (playerStatus.commitStatus === CommitStatus.Passed) {
            reply(false);
            return;
        }

        if (room.isValidCommitment(data)) {
            playerStatus.commitStatus = CommitStatus.Committed;
            room.commitment = data;
            const currentScore = data.score + (data.giruda === Giruda.None ? 1 : 0);

            if (currentScore >= 21) {
                room.playerList.forEach(userId => {
                    if (userId === user.id) return;
                    room.playerStatus[userId].commitStatus = CommitStatus.Passed;
                });
                reply(true);
                room.gameStatus = GameStatus.PresidentReady;
                const president = server.sockets.connected[user.id];
                president.to(room.id).broadcast.emit('waiting-president');
                president.emit('floor-cards', room.floor.map(x => x.toString()))
                return;
            }

            while (room.playerStatus[room.currentTurn.id].commitStatus === CommitStatus.Passed)
                room.nextTurn();
            server.to(room.id).emit('commitment-request', room.currentTurn.id);
        }
        else {
            reply(false);
            server.to(room.id).emit('commitment-request', room.currentTurn.id);
        }
        reply(true);
    });

    socket.on('friend-selection', (floorCard: string[], friendSelection: FriendSelection, changeCommitment: Commitment | null, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];
        const playerStatus = room.playerStatus[user.id];

        if (room.gameStatus !== GameStatus.PresidentReady) {
            reply(false);
            return;
        }

        if (user.id !== room.onlyCommit) {
            reply(false);
            return;
        }

        const whole: string[] = playerStatus.cards.concat(room.floor).map(x => x.toString());
        if (!floorCard.every(card => whole.includes(card))) {
            reply(false);
            socket.emit('floor-cards', room.floor.map(x => x.toString()));
            return;
        }

        // TODO validate friendSelection

        if (changeCommitment !== null) {
            const oldScore = room.commitment.score + (room.commitment.giruda === Giruda.None ? 1 : 0);
            const newScore = changeCommitment.score + (changeCommitment.giruda === Giruda.None ? 1 : 0);
            if (room.commitment.giruda === changeCommitment.giruda) {
                if (oldScore > newScore) {
                    reply(false);
                    return;
                }
            }
            else {
                if (oldScore + 2 > newScore) {
                    reply(false);
                    return;
                }
            }
            room.commitment = changeCommitment;
        }

        setRole(room, friendSelection);
        room.floor = floorCard.map(x => Card.fromCardCode(x));
        room.friendSelection = friendSelection;
        room.changeHead(user.id);
        room.gameStatus = GameStatus.MainGame;
        room.turnStatus = null;
        server.in(room.id).emit('turn', user.id, null);
        reply(true);
    });

    socket.on('play', (data: Play, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];
        const playerStatus = room.playerStatus[user.id];

        if (room.gameStatus !== GameStatus.MainGame) {
            reply(false);
            return;
        }

        if (socket.id !== room.currentTurn.id) {
            reply(false);
            return;
        }

        const card = Card.fromCardCode(data.card);

        if (!playerStatus.cards.includes(card)) {
            reply(false);
            return;
        }

        if (!room.turnStatus.currentSuit) {
            let newTurn: Turn = {
                currentSuit: card.suit,
                prevCard: card.toString(),
                jokerCall: data.jokerCall &&
                    ((card.toString() === 'c3' && room.commitment.giruda !== Giruda.Club) ||
                        (card.toString() === 'h3' && room.commitment.giruda === Giruda.Club))
            }
            if (card.suit === CardSuit.Joker)
                newTurn.currentSuit = data.suit;
            playerStatus.playedCard = card;
            playerStatus.consumeCard(card);
            room.turnStatus = newTurn;
            room.nextTurn();
            server.in(room.id).emit('turn', room.currentTurn.id, room.turnStatus);
            reply(true);
            return;
        }

        // check validity of play
        if ((card.suit !== room.turnStatus.currentSuit &&
                playerStatus.cards.map(x => x.suit).includes(card.suit)) &&
                card.toString() !== 'jk' &&
                !((card.toString() === 'sA' && room.commitment.giruda !== Giruda.Spade) ||
                    (card.toString() === 'dA' && room.commitment.giruda === Giruda.Spade))) {
            reply(false);
            return;
        }
        if (room.turnStatus.jokerCall === true &&
                playerStatus.cards.map(x => x.toString()).includes('jk') &&
                card.toString() !== 'jk') {
            reply(false);
            return;

        }

        room.turnStatus.prevCard = card.toString();
        room.nextTurn();

        if (room.turn === 0) {
            const playedCards: Card[] = room.playerList.map(x => room.playerStatus[x].playedCard);
            const tableScore: number = playedCards.map(x => x.point).reduce((prev, next) => prev + next);
            const idxTable = '234567890JQKA';
            const suitTable = 'sdch';
            let suitRank: string = '';
            const cardRank: string[] = [];

            suitRank += room.commitment.giruda;
            suitRank += room.turnStatus.currentSuit;
            for (let j = 0; j < 2; j++) {
                for (let i = 0; i < 4; i++) {
                    if (suitRank.includes(suitTable[i])) continue;
                }
            }

            cardRank.push(room.commitment.giruda === Giruda.Spade ? 'dA' : 'sA');
            if (room.turnStatus.jokerCall === false)
                cardRank.push('jk');
            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < idxTable.length; i++) {
                    if (suitRank[j] === 'd' && room.commitment.giruda === Giruda.Spade && i === 0) continue;
                    if (suitRank[j] === 's' && room.commitment.giruda !== Giruda.Spade && i === 0) continue;
                    cardRank.push(suitRank[j] + idxTable[i]);
                }
            }
            if (room.turnStatus.jokerCall === true)
                cardRank.push('jk');

            const playedCardRanks: number[] = playedCards.map(x => cardRank.indexOf(x.toString()));
            let minRank = 100, minIndex = -1;
            playedCardRanks.forEach((rank, i) => {
                if (rank < minRank) {
                    minRank = rank;
                    minIndex = i;
                }
            });

            room.changeHead(room.playerList[minIndex]);
            room.playerStatus[room.playerList[minIndex]].score += tableScore;
            room.turnStatus.currentSuit = null;
            room.turnStatus.jokerCall = false;
            room.turnIndex++;
        }
        playerStatus.consumeCard(card);
        server.in(room.id).emit('turn', room.currentTurn.id, room.turnStatus);
        reply(true);
    });
});

function readyGame(room: RoomData) {
    const card: Card[][] = shuffleCard();
    room.playerList.forEach((userId, i) => {
        room.playerStatus[userId].cards = card[i];
    });
    room.floor = card[5];
    room.gameStatus = GameStatus.DealMissPending;
}

function setRole(room: RoomData, friend: FriendSelection) {
    room.playerList.forEach(userId => {
        const ps = room.playerStatus[userId];
        if (ps.commitStatus === CommitStatus.Committed) {
            ps.role = Role.President;
            return;
        }
        switch (friend.kind) {
            case 'selection':
                if (friend.selection === userId) {
                    ps.role = Role.Friend;
                    return;
                }
                break;
            case 'card':
                if (ps.cards.some(card => card.toString() === friend.card.toString())) {
                    ps.role = Role.Friend;
                    return;
                }
                break;
        }
        ps.role = Role.Opposition;
    });
}
