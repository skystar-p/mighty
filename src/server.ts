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

interface Result {
    role: Role;
    score: number;
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
    turnIndex: number = 0;

    mighty: Card = Card.fromCardCode('sA');
    jokerCall: Card = Card.fromCardCode('c3');

    constructor(roomId: string, roomCreator: UserData) {
        this.id = roomId;
        this.join(roomCreator);
    }

    reset() {
        this.gameStatus = GameStatus.Ready;
        this.turn = 0;
        this.turnIndex = 0;
        this.turnStatus = null;
        this.commitment = { giruda: Giruda.None, score: 11 };
        this.friendSelection = null;
        this.mighty = Card.fromCardCode('sA');
        this.jokerCall = Card.fromCardCode('c3');
        for (const userId of this.playerList) {
            let ps: PlayerStatus = this.playerStatus[userId];
            ps.cards = [];
            ps.score = 0;
            ps.playedCard = null;
            ps.ready = false;
            ps.commitReady= false;
            ps.commitStatus = CommitStatus.None;
            ps.role = Role.None;
        }
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
        return this.playerList.reduce((counter, userId) => counter + Number(this.playerStatus[userId].commitStatus === CommitStatus.Passed), 0);
    }

    get commits(): number {
        return this.playerList.reduce((counter, userId) => counter + Number(this.playerStatus[userId].commitStatus === CommitStatus.Committed), 0);
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

    leave(user: UserData, forced=false): boolean {
        const idx = this.playerList.indexOf(user.id);
        if (idx === -1) {
            return false;
        }
        if (this.gameStatus !== GameStatus.Ready && !forced) {
            return false;
        }
        this.playerList.splice(idx, 1);
        delete this.playerStatus[user.id];
        user.roomId = '';
        return true;
    }

    forcedLeave(user: UserData) {
        // for now
        this.leave(user, true);
        if (this.gameStatus !== GameStatus.Ready) {
            this.reset();
        }
        if (this.playerList.length !== 0) {
            server.to(this.id).emit('leave-room', user.id, this.playerList.map(p => ({id: p, ready: this.playerStatus[p].ready})));
        }
        else {
            delete roomData[this.id];
        }
    }

    isAllReady(): boolean {
        return this.playerList.reduce((readyCount, userId) => readyCount + Number(this.playerStatus[userId].ready), 0) === 5;
    }

    isAllCommitmentReady(): boolean {
        return this.playerList.reduce((commitCount, userId) => commitCount + Number(this.playerStatus[userId].commitReady), 0) === 5;
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
const server = io(8181);

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
        const nicknames = data.reduce(
            (nicknames, userId) => ({
                ...nicknames,
                [userId]: userData[userId].nickname
            }), {}
        );
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
        socket.join(roomId);
        roomData[roomId] = room;
        reply(roomId);
        socket.emit('join-room', user.id, [{id: userId, ready: false}]);
    });

    socket.on('join-room', (data, reply) => {
        // data: room id
        const userId = socket.id;
        const user = userData[userId];
        const room = roomData[data];

        if (user.isJoined()) {
            reply(false);
            return;
        }
        if (!(data in roomData)) {
            reply(false);
            return;
        }
        if (!roomData[data].join(user)) {
            reply(false);
            return;
        }
        reply(true);
        socket.join(room.id);
        server.to(room.id).emit('join-room', user.id, room.playerList.map(p => ({id: p, ready: room.playerStatus[p].ready})));
    });

    socket.on('leave-room', (reply) => {
        const userId = socket.id;
        const user = userData[userId];
        const room = roomData[user.roomId];

        if (!user.isJoined()) {
            reply(false);
            return;
        }
        if (!room.leave(user)) {
            reply(false);
            return;
        }
        reply(true);
        if (room.playerList.length !== 0) {
            server.to(room.id).emit('leave-room', user.id, room.playerList.map(p => ({id: p, ready: room.playerStatus[p].ready})));
        }
        else {
            delete roomData[room.id];
        }
        if (socket) {
            socket.leave(room.id);
        }
    });

    socket.on('ready', (ready: boolean, reply) => {
        const user = userData[socket.id];
        const room = roomData[user.roomId];

        if (room.gameStatus !== GameStatus.Ready) {
            reply(false);
            return;
        }
        room.playerStatus[user.id].ready = ready;
        server.to(room.id).emit('ready', {id: user.id, ready: ready},
            room.playerList.map(p => ({id: p, ready: room.playerStatus[p].ready})))

        if (ready && room.isAllReady()) {
            readyGame(room);
            for (const userId of room.playerList) {
                const cards = room.playerStatus[userId].cards.map(x => x.toString());
                server.to(userId).emit('deal', cards);
            }
        }
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

        if (playerStatus.commitStatus === CommitStatus.Passed) {
            reply(false);
            return;
        }

        if (data === null) {
            playerStatus.commitStatus = CommitStatus.Passed;
        }
        else if (room.isValidCommitment(data)) {
            playerStatus.commitStatus = CommitStatus.Committed;
            room.commitment = data;
            const currentScore = data.score + (data.giruda === Giruda.None ? 1 : 0);

            if (currentScore >= 21) {
                for (const userId of room.playerList) {
                    if (userId === user.id) continue;
                    room.playerStatus[userId].commitStatus = CommitStatus.Passed;
                }
                reply(true);
                room.gameStatus = GameStatus.PresidentReady;
                const president = server.sockets.connected[user.id];
                president.to(room.id).broadcast.emit('waiting-president');
                president.emit('floor-cards', room.floor.map(x => x.toString()))
                return;
            }
        }
        else {
            reply(false);
            // server.to(room.id).emit('commitment-request', room.currentTurn.id);
            return;
        }

        reply(true);
        if (room.passes === 4 && room.commits === 1) {
            room.gameStatus = GameStatus.PresidentReady;
            const president = server.sockets.connected[room.onlyCommit];
            // TODO: more data in waiting-president?
            president.to(room.id).broadcast.emit('waiting-president');
            president.emit('floor-cards', room.floor.map(x => x.toString()))
            return;
        }
        else if (room.passes === 5) {
            room.reset();
            return;
        }

        do {
            room.nextTurn();
        } while (room.playerStatus[room.currentTurn.id].commitStatus === CommitStatus.Passed);
        server.to(room.id).emit('commitment-request', room.currentTurn.id);
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
            // TODO: emit commitment change message
        }

        setRole(room, friendSelection);
        room.floor = floorCard.map(x => Card.fromCardCode(x));
        room.friendSelection = friendSelection;
        room.changeHead(user.id);
        room.gameStatus = GameStatus.MainGame;
        room.turnStatus = null;
        if (room.commitment.giruda === Giruda.Spade)
            room.mighty = Card.fromCardCode('dA');
        if (room.commitment.giruda === Giruda.Club)
            room.jokerCall = Card.fromCardCode('h3');
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

        // if joker is left at 9th turn, player must play joker
        if (room.turnIndex === 8 && playerStatus.cards.map(c => c.toString()).includes('jk')) {
            reply(false);
            return;
        }

        // this means it is first play of a round
        if (!room.turnStatus.currentSuit) {
            // check validity of play
            // check: is player playing giruda in the very first round?
            if (room.turnIndex === 0 && room.turn === 0 && card.toString() !== 'jk' &&
                    card.suit.toString() === room.commitment.giruda.toString()) {
                reply(false);
                return;
            }

            let newTurn: Turn = {
                currentSuit: card.suit,
                prevCard: card.toString(),
                jokerCall: data.jokerCall && card.toString() === room.jokerCall.toString()
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
        // check: is player playing card that have suit of current round?
        if ((card.suit !== room.turnStatus.currentSuit &&
                playerStatus.cards.map(x => x.suit).includes(card.suit)) &&
                card.toString() !== 'jk' &&
                card.toString() !== room.mighty.toString()) {
            reply(false);
            return;
        }
        // check: is player not playing joker in joker call round?
        if (room.turnStatus.jokerCall === true &&
                playerStatus.cards.map(x => x.toString()).includes('jk') &&
                card.toString() !== 'jk' && card.toString() !== room.mighty.toString()) {
            reply(false);
            return;
        }

        // valid play by here
        room.turnStatus.prevCard = card.toString();

        room.nextTurn();

        // if next turn is new round, calculate the previous round
        if (room.turn === 0) {
            // calculate winner of round and prepare next round
            const playedCards: Card[] = room.playerList.map(x => room.playerStatus[x].playedCard);
            const tableScore: number = playedCards.map(x => x.point).reduce((prev, next) => prev + next);
            const idxTable = '234567890JQKA';
            const suitTable = 'sdch';
            let suitRank: string = '';
            const cardRank: string[] = [];

            suitRank += room.commitment.giruda;
            if (room.commitment.giruda !== room.turnStatus.currentSuit) {
                suitRank += room.turnStatus.currentSuit;
            }
            for (let j = 0; j < 3; j++) {
                for (let i = 0; i < 4; i++) {
                    if (suitRank.includes(suitTable[i])) continue;
                    suitRank += suitTable[i];
                }
            }

            // always mighty is the best rank
            cardRank.push(room.mighty.toString());
            // if not joker call round, joker is the next rank of mighty
            if (room.turnStatus.jokerCall === false && room.turnIndex >= 1 && room.turnIndex <= 8)
                cardRank.push('jk');
            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < idxTable.length; i++) {
                    let cr = suitRank[j] + idxTable[i];
                    if (cr === room.mighty.toString()) continue;
                    cardRank.push(cr);
                }
            }
            // if joker call round or in first round, joker is the lowest rank
            if (room.turnStatus.jokerCall === true && room.turnIndex === 1)
                cardRank.push('jk');

            const playedCardRanks: number[] = playedCards.map(x => cardRank.indexOf(x.toString()));
            let minRank: number = 100, minIndex: number;
            for (const [i, rank] of playedCardRanks.entries()) {
                if (rank < minRank) {
                    minRank = rank;
                    minIndex = i;
                }
            }

            if (room.turnIndex === 9) {
                const result = room.playerList.map(
                    userId => ({
                        [userId]: {
                            score: room.playerStatus[userId].score,
                            role: room.playerStatus[userId].role
                        }
                    })
                ).reduce((result, item) => ({ ...result, ...item }), {});
                server.in(room.id).emit('result', result);
                room.reset();
            }

            const nextHead = room.playerList[minIndex];

            if (room.turnIndex === 0 && room.friendSelection.kind === "first-turn") {
                room.playerStatus[nextHead].role = Role.Friend;
            }

            room.changeHead(nextHead);
            room.playerStatus[nextHead].score += tableScore;
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
    for (const [i, userId] of room.playerList.entries()) {
        room.playerStatus[userId].cards = card[i];
    }
    room.floor = card[5];
    room.gameStatus = GameStatus.DealMissPending;
}

function setRole(room: RoomData, friend: FriendSelection) {
    for (const userId of room.playerList) {
        const ps = room.playerStatus[userId];
        if (ps.commitStatus === CommitStatus.Committed) {
            ps.role = Role.President;
            continue;
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
    }
}
