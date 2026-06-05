const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  refreshAccessToken,
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerClientPushToken,
  getClientNotifications,
  getClientUnreadCount,
  markClientNotificationRead,
  markClientNotificationsRead,
} = require("../controllers/notificationController");


router.get("/me", authMiddleware, getProfile);
router.patch("/me", authMiddleware, updateProfile);
router.patch("/change-password", authMiddleware, changePassword);
router.post("/push-token", authMiddleware, registerClientPushToken);
router.get("/notifications", authMiddleware, getClientNotifications);
router.get("/notifications/unread-count", authMiddleware, getClientUnreadCount);
router.patch("/notifications/read-all", authMiddleware, markClientNotificationsRead);
router.patch("/notifications/:notificationId/read", authMiddleware, markClientNotificationRead);
router.post("/register", register);
router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.post("/refresh", refreshAccessToken);

module.exports = router;
