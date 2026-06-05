const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getWalletBalance,
  getWalletTransactions,
  dummyRecharge,
} = require("../controllers/walletController");
const {
  initiatePayment,
  getPaymentStatus,
  phonePeCallback,
  paymentRedirect,
} = require("../controllers/paymentController");

router.get("/balance", authMiddleware, getWalletBalance);
router.get("/transactions", authMiddleware, getWalletTransactions);

/* PhonePe wallet recharge */
router.post("/payment/initiate", authMiddleware, initiatePayment);
router.get("/payment/status/:merchantOrderId", authMiddleware, getPaymentStatus);
router.post(
  "/payment/callback",
  express.text({ type: "*/*" }),
  phonePeCallback
);
router.get("/payment/redirect", paymentRedirect);

/* Dev-only dummy recharge when PAYMENT_MODE=DUMMY */
router.post("/recharge", authMiddleware, (req, res, next) => {
  if (process.env.PAYMENT_MODE === "DUMMY") {
    return dummyRecharge(req, res);
  }
  return res.status(400).json({
    message: "Use POST /wallet/payment/initiate for PhonePe recharge",
  });
});

module.exports = router;
