import io = require('socket.io');
import uuid = require('uuid/v4');

class PlayerStatus {
    cards: string[] = [];
    role: string = '';
    playedCard: string = '';

    constructor() {

    }
}

// 5ma
class RoomData {
    id: string;
    playerList: string[] = [];
    gameStatus: number = 0;
    playerStatus: { [playerId: string]: PlayerStatus } = {};

    constructor(roomId: string, roomCreator: UserData) {
        this.id = roomId;
        this.join(roomCreator);
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

    socket.on('room-list', (data, reply) => {
        reply(Object.keys(roomData));
    });

    socket.on('create-room', (data, reply) => {
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
        reply(data);
    });

});

