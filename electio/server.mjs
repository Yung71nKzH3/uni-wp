import { createServer } from "http";
import parseurl from "parseurl";
import next from "next";
import { Server } from "socket.io";
import os from "os";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper to get local network IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// In-memory active room sessions
const activeRooms = {};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parseurl(req);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const broadcastRoomList = () => {
    const roomsList = Object.values(activeRooms).map((r) => ({
      roomCode: r.roomCode,
      name: r.name,
      playerCount: r.players ? r.players.length : 1,
      optionsCount: r.options.length,
    }));
    io.emit("ROOM_LIST_UPDATE", roomsList);
  };

  io.on("connection", (socket) => {
    broadcastRoomList();

    socket.on("GET_LOCAL_INFO", (callback) => {
      if (callback) callback({ ip: getLocalIp(), port });
    });

    socket.on("CREATE_ROOM", ({ roomCode, name }, callback) => {
      activeRooms[roomCode] = {
        roomCode,
        name: name || `Roulette Room #${roomCode}`,
        hostId: socket.id,
        players: [socket.id],
        options: [],
        chips: {},
      };
      socket.join(roomCode);
      if (callback) callback({ success: true, roomCode });
      broadcastRoomList();
    });

    socket.on("JOIN_ROOM", ({ roomCode }, callback) => {
      const room = activeRooms[roomCode];
      if (!room) {
        if (callback) callback({ success: false, error: "Room not found!" });
        return;
      }

      if (!room.players.includes(socket.id)) {
        room.players.push(socket.id);
      }
      socket.join(roomCode);

      if (callback) {
        callback({
          success: true,
          roomCode: room.roomCode,
          options: room.options,
          chips: room.chips,
        });
      }

      io.to(roomCode).emit("PLAYER_COUNT_UPDATE", room.players.length);
      broadcastRoomList();
    });

    socket.on("UPDATE_ROOM_STATE", ({ roomCode, options, chips }) => {
      if (activeRooms[roomCode]) {
        activeRooms[roomCode].options = options;
        activeRooms[roomCode].chips = chips;
        socket.to(roomCode).emit("ROOM_STATE_SYNC", { options, chips });
      }
    });

    socket.on("TRIGGER_SPIN", ({ roomCode, selectedWinner, winnerIndex, weightedOptions }) => {
      io.to(roomCode).emit("SPIN_EVENT", { selectedWinner, winnerIndex, weightedOptions });
    });

    socket.on("disconnect", () => {
      for (const code of Object.keys(activeRooms)) {
        const room = activeRooms[code];
        if (room.players.includes(socket.id)) {
          room.players = room.players.filter((id) => id !== socket.id);
          if (room.players.length === 0) {
            delete activeRooms[code];
          } else {
            io.to(code).emit("PLAYER_COUNT_UPDATE", room.players.length);
          }
        }
      }
      broadcastRoomList();
    });
  });

  const localIp = getLocalIp();
  httpServer.listen(port, () => {
    console.log(`> Electio Server ready on http://localhost:${port}`);
    console.log(`> Network Access IP: http://${localIp}:${port}`);
  });
});
