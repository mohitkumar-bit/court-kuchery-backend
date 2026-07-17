const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatHandlers = require("./chatHandlers");
const presenceHandlers = require("./presenceHandlers");
const consultHandlers = require("./consultHandlers");

let io;

const initializeSocket = (server, app) => {
  io = new Server(server, {
    cors: {
      origin: "*", // change later in production
      methods: ["GET", "POST"],
    },
  });

  /* 🔐 SOCKET AUTH MIDDLEWARE */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Unauthorized - No Token"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

      socket.user = decoded; // 🔥 attach user to socket
      next();
    } catch (err) {
      return next(new Error("Unauthorized - Invalid Token"));
    }
  });

  // make io accessible in controllers
  app.set("io", io);

  io.on("connection", (socket) => {
    console.log(`🟢 Socket connected: ${socket.user.id} [${socket.user.role}]`);

    // optional: join personal room
    socket.join(`user:${socket.user.id}`);

    presenceHandlers(io, socket);
    chatHandlers(io, socket);
    consultHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected:", socket.user.id);
    });
  });
};

const getIO = () => io;

/** Broadcast lawyer online/offline so client apps update without refresh */
const emitLawyerAvailability = (lawyerId, isOnline) => {
  if (!io || !lawyerId) return;
  io.emit("LAWYER_AVAILABILITY", {
    lawyerId: String(lawyerId),
    isOnline: !!isOnline,
  });
};

module.exports = initializeSocket;
module.exports.getIO = getIO;
module.exports.emitLawyerAvailability = emitLawyerAvailability;
