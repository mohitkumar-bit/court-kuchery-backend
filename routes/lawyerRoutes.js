const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  registerLawyer,
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

router.post("/register", registerLawyer);
router.get("/me", authMiddleware, getLawyerProfile);
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
