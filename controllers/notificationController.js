const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");
const NotificationTemplate = require("../modals/NotificationTemplate");
const PushCampaign = require("../modals/PushCampaign");
const UserNotification = require("../modals/UserNotification");
const { sendExpoPushNotifications } = require("../services/expoPushService");

const upsertPushToken = async (Model, id, token, platform) => {
  if (!token || typeof token !== "string") return;

  const doc = await Model.findById(id);
  if (!doc) return null;

  const tokens = doc.expoPushTokens || [];
  const existing = tokens.findIndex((t) => t.token === token);
  const entry = { token, platform: platform || "unknown", updatedAt: new Date() };

  if (existing >= 0) {
    tokens[existing] = entry;
  } else {
    tokens.push(entry);
  }

  doc.expoPushTokens = tokens.slice(-10);
  await doc.save();
  return doc;
};

const collectTokens = (docs) => {
  const tokens = [];
  docs.forEach((d) => {
    (d.expoPushTokens || []).forEach((t) => {
      if (t.token) tokens.push(t.token);
    });
  });
  return tokens;
};

/* ========== CLIENT (USER) ========== */

const registerClientPushToken = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    const { expoPushToken, platform } = req.body;
    if (!expoPushToken) {
      return res.status(400).json({ message: "expoPushToken is required" });
    }
    await upsertPushToken(User, req.user.id, expoPushToken, platform);
    res.status(200).json({ message: "Push token registered" });
  } catch (error) {
    console.error("registerClientPushToken:", error);
    res.status(500).json({ message: "Failed to register push token" });
  }
};

const getClientNotifications = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    const notifications = await UserNotification.find({
      recipientType: "CLIENT",
      userId: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unreadCount = await UserNotification.countDocuments({
      recipientType: "CLIENT",
      userId: req.user.id,
      isRead: false,
    });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("getClientNotifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

const markClientNotificationsRead = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    await UserNotification.updateMany(
      { recipientType: "CLIENT", userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications" });
  }
};

const markClientNotificationRead = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    const notification = await UserNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        recipientType: "CLIENT",
        userId: req.user.id,
      },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.status(200).json({ notification });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
};

const getClientUnreadCount = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    const unreadCount = await UserNotification.countDocuments({
      recipientType: "CLIENT",
      userId: req.user.id,
      isRead: false,
    });
    res.status(200).json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
};

/* ========== LAWYER ========== */

const registerLawyerPushToken = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    const { expoPushToken, platform } = req.body;
    if (!expoPushToken) {
      return res.status(400).json({ message: "expoPushToken is required" });
    }
    await upsertPushToken(Lawyer, req.user.id, expoPushToken, platform);
    res.status(200).json({ message: "Push token registered" });
  } catch (error) {
    console.error("registerLawyerPushToken:", error);
    res.status(500).json({ message: "Failed to register push token" });
  }
};

const getLawyerNotifications = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    const notifications = await UserNotification.find({
      recipientType: "LAWYER",
      lawyerId: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unreadCount = await UserNotification.countDocuments({
      recipientType: "LAWYER",
      lawyerId: req.user.id,
      isRead: false,
    });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("getLawyerNotifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

const markLawyerNotificationsRead = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    await UserNotification.updateMany(
      { recipientType: "LAWYER", lawyerId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications" });
  }
};

const markLawyerNotificationRead = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    const notification = await UserNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        recipientType: "LAWYER",
        lawyerId: req.user.id,
      },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.status(200).json({ notification });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
};

const getLawyerUnreadCount = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    const unreadCount = await UserNotification.countDocuments({
      recipientType: "LAWYER",
      lawyerId: req.user.id,
      isRead: false,
    });
    res.status(200).json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
};

/* ========== ADMIN ========== */

const getNotificationTemplates = async (req, res) => {
  try {
    const templates = await NotificationTemplate.find()
      .sort({ updatedAt: -1 })
      .lean();
    res.status(200).json({ templates });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch templates" });
  }
};

const createNotificationTemplate = async (req, res) => {
  try {
    const { name, title, body, audience, category } = req.body;
    if (!name || !title || !body) {
      return res.status(400).json({ message: "name, title and body are required" });
    }
    const template = await NotificationTemplate.create({
      name,
      title,
      body,
      audience: audience || "BOTH",
      category: category || "GENERAL",
      createdBy: req.user.id,
    });
    res.status(201).json({ template });
  } catch (error) {
    res.status(500).json({ message: "Failed to create template" });
  }
};

const updateNotificationTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;
    const template = await NotificationTemplate.findByIdAndUpdate(
      templateId,
      {
        ...(updates.name != null && { name: updates.name }),
        ...(updates.title != null && { title: updates.title }),
        ...(updates.body != null && { body: updates.body }),
        ...(updates.audience != null && { audience: updates.audience }),
        ...(updates.category != null && { category: updates.category }),
        ...(updates.isActive != null && { isActive: updates.isActive }),
      },
      { new: true }
    );
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.status(200).json({ template });
  } catch (error) {
    res.status(500).json({ message: "Failed to update template" });
  }
};

const deleteNotificationTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    await NotificationTemplate.findByIdAndDelete(templateId);
    res.status(200).json({ message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete template" });
  }
};

const sendAdminPushNotification = async (req, res) => {
  try {
    const { title, body, audience, category, templateId } = req.body;

    let finalTitle = title;
    let finalBody = body;
    let finalAudience = audience;
    let finalCategory = category || "GENERAL";

    if (templateId) {
      const template = await NotificationTemplate.findById(templateId);
      if (!template || !template.isActive) {
        return res.status(404).json({ message: "Template not found or inactive" });
      }
      finalTitle = finalTitle || template.title;
      finalBody = finalBody || template.body;
      finalAudience = finalAudience || template.audience;
      finalCategory = template.category || finalCategory;
    }

    if (!finalTitle || !finalBody || !finalAudience) {
      return res.status(400).json({
        message: "title, body, and audience (CLIENT | LAWYER | BOTH) are required",
      });
    }

    if (!["CLIENT", "LAWYER", "BOTH"].includes(finalAudience)) {
      return res.status(400).json({ message: "Invalid audience" });
    }

    const campaign = await PushCampaign.create({
      title: finalTitle,
      body: finalBody,
      audience: finalAudience,
      category: finalCategory,
      templateId: templateId || null,
      sentBy: req.user.id,
      stats: {
        clientRecipients: 0,
        lawyerRecipients: 0,
        pushSent: 0,
        pushFailed: 0,
        inboxCreated: 0,
      },
    });

    const pushTokens = [];
    const inboxDocs = [];

    if (finalAudience === "CLIENT" || finalAudience === "BOTH") {
      const users = await User.find({
        role: "USER",
        isBlocked: { $ne: true },
      }).select("_id expoPushTokens");

      users.forEach((user) => {
        inboxDocs.push({
          recipientType: "CLIENT",
          userId: user._id,
          title: finalTitle,
          body: finalBody,
          category: finalCategory,
          campaignId: campaign._id,
        });
        pushTokens.push(...collectTokens([user]));
      });
      campaign.stats.clientRecipients = users.length;
    }

    if (finalAudience === "LAWYER" || finalAudience === "BOTH") {
      const lawyers = await Lawyer.find({ isBlocked: { $ne: true } }).select(
        "_id expoPushTokens"
      );

      lawyers.forEach((lawyer) => {
        inboxDocs.push({
          recipientType: "LAWYER",
          lawyerId: lawyer._id,
          title: finalTitle,
          body: finalBody,
          category: finalCategory,
          campaignId: campaign._id,
        });
        pushTokens.push(...collectTokens([lawyer]));
      });
      campaign.stats.lawyerRecipients = lawyers.length;
    }

    if (inboxDocs.length) {
      await UserNotification.insertMany(inboxDocs, { ordered: false });
      campaign.stats.inboxCreated = inboxDocs.length;
    }

    const pushResult = await sendExpoPushNotifications(pushTokens, {
      title: finalTitle,
      body: finalBody,
      data: {
        type: "ADMIN_PUSH",
        category: finalCategory,
        campaignId: String(campaign._id),
      },
    });

    campaign.stats.pushSent = pushResult.sent;
    campaign.stats.pushFailed = pushResult.failed;
    await campaign.save();

    res.status(200).json({
      message: "Notification sent",
      campaign,
    });
  } catch (error) {
    console.error("sendAdminPushNotification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
};

const getPushCampaignHistory = async (req, res) => {
  try {
    const campaigns = await PushCampaign.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("templateId", "name")
      .lean();
    res.status(200).json({ campaigns });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch campaign history" });
  }
};

module.exports = {
  registerClientPushToken,
  getClientNotifications,
  getClientUnreadCount,
  markClientNotificationRead,
  markClientNotificationsRead,
  registerLawyerPushToken,
  getLawyerNotifications,
  getLawyerUnreadCount,
  markLawyerNotificationRead,
  markLawyerNotificationsRead,
  getNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  sendAdminPushNotification,
  getPushCampaignHistory,
};
