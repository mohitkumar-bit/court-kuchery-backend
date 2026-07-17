const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");
const UserNotification = require("../modals/UserNotification");
const { sendExpoPushNotifications } = require("./expoPushService");

const collectTokens = (doc) =>
  (doc?.expoPushTokens || []).map((t) => t.token).filter(Boolean);

async function saveAndPush({
  recipientType,
  userId,
  lawyerId,
  title,
  body,
  data,
  channelId = "consult",
  categoryId,
}) {
  try {
    await UserNotification.create({
      recipientType,
      userId: userId || null,
      lawyerId: lawyerId || null,
      title,
      body,
      category: "CONSULT",
    });

    let tokens = [];
    if (recipientType === "LAWYER" && lawyerId) {
      const lawyer = await Lawyer.findById(lawyerId).select("expoPushTokens");
      tokens = collectTokens(lawyer);
    } else if (recipientType === "CLIENT" && userId) {
      const user = await User.findById(userId).select("expoPushTokens");
      tokens = collectTokens(user);
    }

    if (!tokens.length) {
      console.log("CONSULT PUSH: no tokens for", recipientType, userId || lawyerId);
      return { sent: 0, failed: 0 };
    }

    return sendExpoPushNotifications(tokens, {
      title,
      body,
      data,
      channelId,
      priority: "high",
      categoryId,
    });
  } catch (err) {
    console.error("CONSULT PUSH ERROR 👉", err.message);
    return { sent: 0, failed: 0 };
  }
}

/** Lawyer: new consultation request (works when app minimized/closed) */
async function notifyLawyerNewRequest({
  lawyerId,
  sessionId,
  userId,
  userName,
  userProfileImage,
  type,
  ratePerMinute,
}) {
  const consultLabel = type === "CALL" ? "call" : "chat";
  return saveAndPush({
    recipientType: "LAWYER",
    lawyerId,
    title: "New consultation request",
    body: `${userName || "A client"} wants a ${consultLabel} consultation`,
    categoryId: "CONSULT_REQUEST",
    data: {
      type: "CONSULT_REQUEST",
      sessionId: String(sessionId),
      userId: String(userId),
      userName: userName || "Client",
      userProfileImage: userProfileImage || "",
      consultType: type,
      ratePerMinute: String(ratePerMinute ?? ""),
    },
  });
}

/** Client: lawyer accepted */
async function notifyClientAccepted({
  userId,
  sessionId,
  type,
  lawyerName,
  lawyerId,
}) {
  const consultLabel = type === "CALL" ? "call" : "chat";
  return saveAndPush({
    recipientType: "CLIENT",
    userId,
    title: "Consultation accepted",
    body: `${lawyerName || "Your lawyer"} accepted the ${consultLabel}. Tap to continue.`,
    data: {
      type: "CONSULT_ACCEPTED",
      sessionId: String(sessionId),
      consultType: type,
      lawyerName: lawyerName || "",
      lawyerId: lawyerId ? String(lawyerId) : "",
    },
  });
}

/** Client: lawyer declined */
async function notifyClientDeclined({ userId, sessionId }) {
  return saveAndPush({
    recipientType: "CLIENT",
    userId,
    title: "Consultation declined",
    body: "The lawyer is not available right now. Please try again later.",
    data: {
      type: "CONSULT_DECLINED",
      sessionId: String(sessionId),
    },
  });
}

/** Lawyer: client cancelled while request pending */
async function notifyLawyerCancelled({ lawyerId, sessionId, userName }) {
  return saveAndPush({
    recipientType: "LAWYER",
    lawyerId,
    title: "Request cancelled",
    body: `${userName || "The client"} cancelled the consultation request.`,
    data: {
      type: "CONSULT_CANCELLED",
      sessionId: String(sessionId),
    },
  });
}

module.exports = {
  notifyLawyerNewRequest,
  notifyClientAccepted,
  notifyClientDeclined,
  notifyLawyerCancelled,
};
