const ConsultSession = require("../modals/consultSession");
const { endActiveSession } = require("../services/endConsultSession");

/** Pending auto-ends after disconnect: key = `${userId}:${sessionId}` */
const pendingAbandon = new Map();
const DISCONNECT_GRACE_MS = 8000;

function abandonKey(userId, sessionId) {
  return `${userId}:${sessionId}`;
}

function clearPendingAbandon(userId, sessionId) {
  const key = abandonKey(userId, sessionId);
  const t = pendingAbandon.get(key);
  if (t) {
    clearTimeout(t);
    pendingAbandon.delete(key);
  }
}

function scheduleAbandon(io, userId, sessionId) {
  const key = abandonKey(userId, sessionId);
  if (pendingAbandon.has(key)) return;

  const timeout = setTimeout(async () => {
    pendingAbandon.delete(key);
    try {
      const session = await ConsultSession.findById(sessionId);
      if (!session || session.status !== "ACTIVE") return;

      const isParticipant =
        String(session.userId) === String(userId) ||
        String(session.lawyerId) === String(userId);
      if (!isParticipant) return;

      console.log(
        `⚠️ Auto-ending session ${sessionId} — participant ${userId} disconnected`
      );
      await endActiveSession(io, sessionId);
    } catch (err) {
      console.error("Auto-end on disconnect failed:", err);
    }
  }, DISCONNECT_GRACE_MS);

  pendingAbandon.set(key, timeout);
}

module.exports = (io, socket) => {
  if (!socket.data.activeSessions) {
    socket.data.activeSessions = new Set();
  }

  /* ============================
     JOIN SESSION
  ============================ */
  socket.on("JOIN_SESSION", ({ sessionId }) => {
    if (!sessionId) return;
    const id = String(sessionId);
    const room = `session:${id}`;
    socket.join(room);
    socket.data.activeSessions.add(id);
    clearPendingAbandon(socket.user.id, id);
    console.log(`📌 Socket ${socket.id} (${socket.user.role}) joined room: ${room}`);
  });

  /* ============================
     SEND MESSAGE
  ============================ */
  socket.on("SEND_MESSAGE", async (data) => {
    try {
      const { sessionId, content } = data;
      if (!sessionId || !content) return;

      const Message = require("../modals/Message");
      const role = (socket.user.role || "user").toUpperCase();

      console.log(`📩 Message from ${socket.user.id} [${role}]: ${content}`);

      const newMessage = await Message.create({
        sessionId,
        senderId: socket.user.id,
        senderRole: role,
        messageType: "TEXT",
        content,
        status: "SENT",
      });

      const room = `session:${sessionId}`;
      console.log(`✅ Message saved. Emitting to ${room}`);

      io.to(room).emit("RECEIVE_MESSAGE", {
        _id: newMessage._id,
        sessionId,
        content,
        senderRole: role,
        createdAt: newMessage.createdAt,
      });
    } catch (err) {
      console.error("❌ SEND_MESSAGE Error:", err);
    }
  });

  /* ============================
     LEAVE SESSION
     abandon: true → end ACTIVE consult immediately
  ============================ */
  socket.on("LEAVE_SESSION", async ({ sessionId, abandon }) => {
    if (!sessionId) return;

    const id = String(sessionId);
    const room = `session:${id}`;
    socket.leave(room);
    socket.data.activeSessions.delete(id);
    console.log(`🚪 Left session room: ${room}${abandon ? " (abandon)" : ""}`);

    if (abandon) {
      clearPendingAbandon(socket.user.id, id);
      try {
        await endActiveSession(io, id);
      } catch (err) {
        console.error("Abandon leave end failed:", err);
      }
    }
  });

  /* ============================
     DISCONNECT — end consult after short grace
     (app kill / phone off / network drop)
  ============================ */
  socket.on("disconnect", () => {
    const sessions = socket.data.activeSessions;
    if (!sessions || sessions.size === 0) return;

    console.log(
      `🔴 Socket disconnect ${socket.user.id} with active sessions:`,
      [...sessions]
    );

    for (const sessionId of sessions) {
      scheduleAbandon(io, socket.user.id, sessionId);
    }
    sessions.clear();
  });
};
