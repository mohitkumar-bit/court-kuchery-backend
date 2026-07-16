const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  adminLogin,
  adminRefresh,
  adminLogout,
} = require("../controllers/adminAuthController");
const {
  getAdminDashboardStats,
  getAllLawyersAdmin,
  toggleLawyerBlock,
  getAllUsersAdmin,
  toggleUserBlock,
  getAllConsultationsAdmin,
  getRevenueStats,
  updatePayoutStatus,
  getAllReviewsAdmin,
  deleteReviewAdmin,
  getSystemSettings,
  updateSystemSettings,
  getAllPayoutsAdmin,
  getUnreleasedEarnings,
  releaseLawyerEarning,
  getAllEarningsAdmin,
} = require("../controllers/adminController");
const { verifyLawyer } = require("../controllers/lawyerController");
const {
  getNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  sendAdminPushNotification,
  getPushCampaignHistory,
} = require("../controllers/notificationController");

/* Public admin auth (email + password — no OTP) */
router.post("/login", adminLogin);
router.post("/refresh", adminRefresh);

/* Protected admin routes */
router.use(authMiddleware, adminMiddleware);

router.post("/logout", adminLogout);
router.get("/stats", getAdminDashboardStats);
router.patch("/payouts/:payoutId/status", updatePayoutStatus);
router.get("/lawyers", getAllLawyersAdmin);
router.patch("/lawyers/:lawyerId/verify", verifyLawyer);
router.patch("/lawyers/:lawyerId/toggle-block", toggleLawyerBlock);
router.get("/users", getAllUsersAdmin);
router.patch("/users/:userId/toggle-block", toggleUserBlock);
router.get("/consultations", getAllConsultationsAdmin);
router.get("/revenue-stats", getRevenueStats);
router.get("/payouts", getAllPayoutsAdmin);
router.get("/earnings/unreleased", getUnreleasedEarnings);
router.get("/earnings/all", getAllEarningsAdmin);
router.patch("/earnings/:earningId/release", releaseLawyerEarning);
router.get("/reviews", getAllReviewsAdmin);
router.delete("/reviews/:reviewId", deleteReviewAdmin);
router.get("/settings", getSystemSettings);
router.patch("/settings", updateSystemSettings);

router.get("/notification-templates", getNotificationTemplates);
router.post("/notification-templates", createNotificationTemplate);
router.patch("/notification-templates/:templateId", updateNotificationTemplate);
router.delete("/notification-templates/:templateId", deleteNotificationTemplate);
router.post("/notifications/send", sendAdminPushNotification);
router.get("/notifications/history", getPushCampaignHistory);

module.exports = router;
