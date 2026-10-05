import { createServer } from "http";
import parseurl from "parseurl";
import next from "next";
import { Server } from "socket.io";
import os from "os";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Helper to get local network IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        // Lower priority for known virtual adapters
        const isVirtual = /virtual|vEthernet|tailscale|loopback|wsl/i.test(name);
        if (isVirtual) {
          candidates.push({ ip: net.address, priority: 1 });
        } else if (net.address.startsWith("192.168.") || net.address.startsWith("10.")) {
          candidates.push({ ip: net.address, priority: 3 });
        } else {
          candidates.push({ ip: net.address, priority: 2 });
        }
      }
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].ip;
  }
  return "localhost";
}

// In-memory active room sessions
// { [roomCode]: { roomCode, name, hostId, players: [socket.id], options: [], chips: {}, isSpinning: false, lastWinner: null } }
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
      optionsCount: r.options ? r.options.length : 0,
      isSpinning: !!r.isSpinning,
    }));
    io.emit("ROOM_LIST_UPDATE", roomsList);
  };

  const removePlayerFromRoom = (socket, code) => {
    const room = activeRooms[code];
    if (!room) return;

    room.players = room.players.filter((id) => id !== socket.id);
    socket.leave(code);

    if (room.players.length === 0) {
      delete activeRooms[code];
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players[0];
      }
      io.to(code).emit("PLAYER_COUNT_UPDATE", room.players.length);
    }
    broadcastRoomList();
  };

  io.on("connection", (socket) => {
    broadcastRoomList();

    socket.on("GET_LOCAL_INFO", (callback) => {
      if (typeof callback === "function") {
        callback({ ip: getLocalIp(), port });
      }
    });

    socket.on("CREATE_ROOM", ({ roomCode, name, options, chips }, callback) => {
      // Generate guaranteed unique 4-digit numeric room code if not provided or collision
      let finalCode = roomCode;
      if (!finalCode || activeRooms[finalCode]) {
        let attempts = 0;
        do {
          finalCode = Math.floor(1000 + Math.random() * 9000).toString();
          attempts++;
        } while (activeRooms[finalCode] && attempts < 100);
      }

      activeRooms[finalCode] = {
        roomCode: finalCode,
        name: name || `Roulette Room #${finalCode}`,
        hostId: socket.id,
        players: [socket.id],
        options: Array.isArray(options) ? options : [],
        chips: typeof chips === "object" && chips !== null ? chips : {},
        isSpinning: false,
        lastWinner: null,
      };

      socket.join(finalCode);

      if (typeof callback === "function") {
        callback({
          success: true,
          roomCode: finalCode,
          options: activeRooms[finalCode].options,
          chips: activeRooms[finalCode].chips,
        });
      }
      broadcastRoomList();
    });

    socket.on("JOIN_ROOM", ({ roomCode }, callback) => {
      const room = activeRooms[roomCode];
      if (!room) {
        if (typeof callback === "function") {
          callback({ success: false, error: "Room #" + roomCode + " not found!" });
        }
        return;
      }

      if (!room.players.includes(socket.id)) {
        room.players.push(socket.id);
      }
      socket.join(roomCode);

      if (typeof callback === "function") {
        callback({
          success: true,
          roomCode: room.roomCode,
          name: room.name,
          options: room.options,
          chips: room.chips,
          isSpinning: room.isSpinning,
          lastWinner: room.lastWinner,
        });
      }

      io.to(roomCode).emit("PLAYER_COUNT_UPDATE", room.players.length);
      broadcastRoomList();
    });

    socket.on("LEAVE_ROOM", ({ roomCode }) => {
      if (roomCode) {
        removePlayerFromRoom(socket, roomCode);
      }
    });

    socket.on("UPDATE_ROOM_STATE", ({ roomCode, options, chips }) => {
      const room = activeRooms[roomCode];
      if (room) {
        if (room.isSpinning) {
          // Ignore edits while the wheel is actively spinning
          return;
        }
        room.options = Array.isArray(options) ? options : [];
        room.chips = typeof chips === "object" && chips !== null ? chips : {};
        socket.to(roomCode).emit("ROOM_STATE_SYNC", {
          options: room.options,
          chips: room.chips,
        });
        broadcastRoomList();
      }
    });

    socket.on("TRIGGER_SPIN", ({ roomCode, selectedWinner, winnerIndex, weightedOptions }) => {
      const room = activeRooms[roomCode];
      if (!room) return;

      if (room.isSpinning) {
        // Prevent concurrent spin triggers
        return;
      }

      room.isSpinning = true;
      room.lastWinner = selectedWinner;

      // Broadcast spin start to all players in the room (including the sender)
      io.to(roomCode).emit("SPIN_EVENT", {
        selectedWinner,
        winnerIndex,
        weightedOptions,
      });

      // Clear spinning lock after animation completes (3s animation + 500ms celebration)
      setTimeout(() => {
        if (activeRooms[roomCode]) {
          activeRooms[roomCode].isSpinning = false;
          io.to(roomCode).emit("SPIN_FINISHED", { winner: selectedWinner });
          broadcastRoomList();
        }
      }, 3500);
    });

    socket.on("disconnect", () => {
      for (const code of Object.keys(activeRooms)) {
        const room = activeRooms[code];
        if (room.players.includes(socket.id)) {
          removePlayerFromRoom(socket, code);
        }
      }
    });
  });

  const localIp = getLocalIp();
  httpServer.listen(port, () => {
    console.log(`> Electio Server ready on http://localhost:${port}`);
    console.log(`> Network Access IP: http://${localIp}:${port}`);
  });
});
