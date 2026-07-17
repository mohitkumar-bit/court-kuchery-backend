const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerLawyer,
  sendLawyerSignupOtp,
  verifyLawyerSignupOtp,
  getLawyers,
  getLawyerById,
  updateAvailability,
  verifyLawyer,
  lawyerLogin,
  lawyerLogout,
  refreshLawyerAccessToken,
  getLawyerProfile,
  getLawyerStats,
  withdrawFunds,
  getLawyerPayouts,
  completeLawyerProfile,
  updateLawyerProfile,
  changeLawyerPassword,
} = require("../controllers/lawyerController");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  registerLawyerPushToken,
  getLawyerNotifications,
  getLawyerUnreadCount,
  markLawyerNotificationRead,
  markLawyerNotificationsRead,
} = require("../controllers/notificationController");
const { upload } = require("../middleware/uploadMiddleware");
const {
  uploadLawyerProfileImage,
  uploadImage,
} = require("../controllers/uploadController");

router.post("/register", registerLawyer);
router.post("/otp/send", sendLawyerSignupOtp);
router.post("/otp/verify", verifyLawyerSignupOtp);
router.get("/me", authMiddleware, getLawyerProfile);
router.post(
  "/me/profile-image",
  authMiddleware,
  upload.single("image"),
  uploadLawyerProfileImage
);
router.post("/upload", authMiddleware, upload.single("image"), uploadImage);
router.post("/push-token", authMiddleware, registerLawyerPushToken);
router.get("/notifications", authMiddleware, getLawyerNotifications);
router.get("/notifications/unread-count", authMiddleware, getLawyerUnreadCount);
router.patch("/notifications/read-all", authMiddleware, markLawyerNotificationsRead);
router.patch("/notifications/:notificationId/read", authMiddleware, markLawyerNotificationRead);
router.patch("/me/update", authMiddleware, updateLawyerProfile);
router.patch("/change-password", authMiddleware, changeLawyerPassword);
router.get("/stats", authMiddleware, getLawyerStats);
router.get("/", getLawyers);
router.get("/:lawyerId", getLawyerById);
router.patch("/availability", authMiddleware, updateAvailability);
router.patch("/:lawyerId/verify", authMiddleware, adminMiddleware, verifyLawyer);
router.post("/login", lawyerLogin);
router.post("/logout", authMiddleware, lawyerLogout);
router.post("/refresh", refreshLawyerAccessToken);
router.get("/payouts", authMiddleware, getLawyerPayouts);
router.post("/withdraw", authMiddleware, withdrawFunds);
router.post("/complete-profile", authMiddleware, completeLawyerProfile);



module.exports = router;
