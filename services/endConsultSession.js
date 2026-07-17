const mongoose = require("mongoose");
const ConsultSession = require("../modals/consultSession");
const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");
const LawyerEarning = require("../modals/LawyerEarning");
const SystemSettings = require("../modals/SystemSettings");
const { sessions } = require("../utils/sessionBilling");
const { releaseLock } = require("../utils/lock");
const { addConsultationDebit } = require("../utils/consultWalletTxn");

/**
 * Charge any time not yet billed by the 10s interval (e.g. short sessions).
 */
async function settleUnbilledTime(session) {
  const durationSeconds = session.durationSeconds || 0;
  const rate = session.ratePerMinute || 0;
  if (!rate || durationSeconds <= 0) return session;

  const expectedGross = (rate / 60) * durationSeconds;
  const alreadyBilled = session.totalAmount || 0;
  const remaining = Math.max(0, expectedGross - alreadyBilled);
  if (remaining < 0.01) return session;

  const userId = session.userId;
  const sessionIdStr = String(session._id);

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, walletBalance: { $gte: remaining } },
    { $inc: { walletBalance: -remaining } },
    { new: true }
  );

  if (updatedUser) {
    await addConsultationDebit(
      userId,
      sessionIdStr,
      remaining,
      updatedUser.walletBalance
    );
    session.totalAmount = alreadyBilled + remaining;
  } else {
    const user = await User.findById(userId);
    const drain = Math.min(Math.max(user?.walletBalance || 0, 0), remaining);
    if (drain >= 0.01) {
      const finalUser = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { walletBalance: -drain } },
        { new: true }
      );
      await addConsultationDebit(
        userId,
        sessionIdStr,
        drain,
        finalUser?.walletBalance || 0
      );
      session.totalAmount = alreadyBilled + drain;
    }
  }

  await session.save();
  return session;
}

async function getCommissionPercent() {
  try {
    const settings = await SystemSettings.findOne();
    if (settings?.commissionPercentage != null) {
      return settings.commissionPercentage;
    }
  } catch (err) {
    console.error("Commission fetch error:", err);
  }
  return 20;
}

async function finalizeEarning(session, io, room, forceReason = null) {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const currentCommission = await getCommissionPercent();
    const commissionAmount = (session.totalAmount * currentCommission) / 100;
    const lawyerAmount = session.totalAmount - commissionAmount;

    try {
      await LawyerEarning.create(
        [
          {
            sessionId: session._id,
            lawyerId: session.lawyerId,
            totalAmount: session.totalAmount,
            commissionAmount,
            lawyerAmount,
          },
        ],
        { session: mongoSession }
      );
    } catch (err) {
      if (err.code === 11000) {
        await mongoSession.abortTransaction();
        return { commissionAmount: 0, lawyerAmount: 0 };
      }
      throw err;
    }

    const updatedLawyer = await Lawyer.findByIdAndUpdate(
      session.lawyerId,
      { $inc: { pendingBalance: lawyerAmount } },
      { session: mongoSession, new: true }
    );

    if (!updatedLawyer) {
      throw new Error("Lawyer not found during balance update");
    }

    await mongoSession.commitTransaction();

    const payload = {
      sessionId: String(session._id),
      totalAmount: session.totalAmount,
      commission: commissionAmount,
      lawyerEarning: lawyerAmount,
      durationSeconds: session.durationSeconds || 0,
      reason: forceReason || undefined,
    };

    if (forceReason) {
      io?.to(room).emit("SESSION_FORCE_ENDED", {
        ...payload,
        remainingBalance: 0,
        reason: forceReason,
      });
      io?.to(`user:${session.userId}`).emit("SESSION_FORCE_ENDED", {
        ...payload,
        remainingBalance: 0,
        reason: forceReason,
      });
      io?.to(`user:${session.lawyerId}`).emit("SESSION_FORCE_ENDED", {
        ...payload,
        remainingBalance: 0,
        reason: forceReason,
      });
      await releaseLock(`lock:lawyer:${session.lawyerId}`);
      await releaseLock(`lock:user:${session.userId}`);
    } else {
      io?.to(room).emit("SESSION_ENDED", payload);
      io?.to(`user:${session.userId}`).emit("SESSION_ENDED", payload);
      io?.to(`user:${session.lawyerId}`).emit("SESSION_ENDED", payload);
    }

    return { commissionAmount, lawyerAmount };
  } catch (error) {
    await mongoSession.abortTransaction();
    console.error("FINALIZE EARNING ERROR 👉", error);
    throw error;
  } finally {
    mongoSession.endSession();
  }
}

/**
 * End an ACTIVE consultation (manual leave, app close, disconnect, etc.)
 * Idempotent if already ended.
 */
async function endActiveSession(io, sessionId, options = {}) {
  const forceReason = options.forceReason || null;
  const session = await ConsultSession.findById(sessionId);

  if (!session) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (session.status === "ENDED" || session.status === "FORCE_ENDED") {
    const user = await User.findById(session.userId);
    return {
      ok: true,
      alreadyEnded: true,
      totalAmount: session.totalAmount || 0,
      remainingBalance: user?.walletBalance || 0,
      commission: 0,
      lawyerEarning: session.lawyerEarning || 0,
      durationSeconds: session.durationSeconds || 0,
    };
  }

  if (session.status !== "ACTIVE") {
    return { ok: false, code: "NOT_ACTIVE", status: session.status };
  }

  const sessionIdStr = String(session._id);
  const room = `session:${sessionIdStr}`;

  const activeInterval = sessions.get(sessionIdStr);
  if (activeInterval) {
    clearInterval(activeInterval);
    sessions.delete(sessionIdStr);
  }

  if (session.startedAt) {
    session.durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    );
  }

  session.status = forceReason ? "FORCE_ENDED" : "ENDED";
  session.endedAt = new Date();
  await session.save();

  // Bill any elapsed seconds the interval hasn't charged yet
  await settleUnbilledTime(session);

  const { commissionAmount, lawyerAmount } = await finalizeEarning(
    session,
    io,
    room,
    forceReason
  );

  if (!forceReason) {
    await releaseLock(`lock:lawyer:${session.lawyerId}`);
    await releaseLock(`lock:user:${session.userId}`);
  }

  const user = await User.findById(session.userId);

  return {
    ok: true,
    message: forceReason
      ? "Consultation force-ended"
      : "Consultation ended successfully",
    totalAmount: session.totalAmount,
    remainingBalance: user?.walletBalance || 0,
    commission: commissionAmount,
    lawyerEarning: lawyerAmount,
    durationSeconds: session.durationSeconds || 0,
  };
}

module.exports = {
  endActiveSession,
  finalizeEarning,
};
