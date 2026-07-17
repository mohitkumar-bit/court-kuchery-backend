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
  sendSignupOtp,
  verifySignupOtp,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerClientPushToken,
  getClientNotifications,
  getClientUnreadCount,
  markClientNotificationRead,
  markClientNotificationsRead,
} = require("../controllers/notificationController");
const { upload } = require("../middleware/uploadMiddleware");
const {
  uploadClientProfileImage,
  uploadImage,
} = require("../controllers/uploadController");


router.get("/me", authMiddleware, getProfile);
router.patch("/me", authMiddleware, updateProfile);
router.post(
  "/me/profile-image",
  authMiddleware,
  upload.single("image"),
  uploadClientProfileImage
);
router.post("/upload", authMiddleware, upload.single("image"), uploadImage);
router.patch("/change-password", authMiddleware, changePassword);
router.post("/push-token", authMiddleware, registerClientPushToken);
router.get("/notifications", authMiddleware, getClientNotifications);
router.get("/notifications/unread-count", authMiddleware, getClientUnreadCount);
router.patch("/notifications/read-all", authMiddleware, markClientNotificationsRead);
router.patch("/notifications/:notificationId/read", authMiddleware, markClientNotificationRead);
router.post("/register", register);
router.post("/login", login);
router.post("/otp/send", sendSignupOtp);
router.post("/otp/verify", verifySignupOtp);
router.post("/logout", authMiddleware, logout);
router.post("/refresh", refreshAccessToken);

module.exports = router;
