import io = require('socket.io');
import uuid = require('uuid/v4');

class PlayerStatus {
    cards: string[] = [];
    role: string = '';
    playedCard: string = '';

    constructor() {

    }
}

class RoomData {
    playerList: Array<String> = [];
    gameStatus: number = 0;
    playerStatus: { [playerId: string]: PlayerStatus } = {};

    constructor(roomCreator: string) {
        this.playerList.push(roomCreator);
        this.playerStatus[roomCreator] = new PlayerStatus();
    }
}

// construct server instance
const server = io(12345);

let roomData = {};

// socket connected
server.on('connect', socket => {

    socket.on('room-list', (data, reply) => {
        reply(Object.keys(roomData));
    });

    socket.on('create-room', (data, reply) => {
        if (socket.roomId) {
            reply(null);
            return;
        }
        // generate random string
        const roomId = uuid();
        const room = new RoomData(socket.id);
        roomData[roomId] = room;
        socket.roomId = roomId;
        reply(roomId);
    });

    socket.on('join-room', (data, reply) => {
        // data: room id
    });

});

