const PaymentOrder = require("../modals/PaymentOrder");
const phonepe = require("../services/phonepeService");
const {
  creditWalletForOrder,
  markOrderFailed,
} = require("../services/walletCreditService");

const MIN_RECHARGE = 1;
const MAX_RECHARGE = 100000;

const syncOrderFromPhonePe = async (order) => {
  const status = await phonepe.fetchOrderStatus(order.merchantOrderId);
  order.phonepeOrderId = status.orderId || order.phonepeOrderId;
  order.phonepeState = status.state;

  if (phonepe.isPaymentSuccessState(status.state)) {
    const result = await creditWalletForOrder(
      order,
      status.orderId || order.merchantOrderId
    );
    return { order: result.order, status, credited: true };
  }

  if (["FAILED", "CHECKOUT_ORDER_FAILED"].includes(String(status.state))) {
    await markOrderFailed(order, status.state);
    return { order, status, credited: false };
  }

  await order.save();
  return { order, status, credited: false };
};

/* POST /wallet/payment/initiate */
const initiatePayment = async (req, res) => {
  try {
    if (!phonepe.isPhonePeConfigured()) {
      return res.status(503).json({
        message:
          "PhonePe is not configured on the server. Restart the backend after adding PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, and PHONEPE_CALLBACK_BASE_URL to court-kuchery-backend-/.env",
        hint: "On startup you should see: ✅ PhonePe payment gateway configured",
      });
    }

    const amount = Number(req.body.amount);
    if (!amount || amount < MIN_RECHARGE || amount > MAX_RECHARGE) {
      return res.status(400).json({
        message: `Amount must be between ₹${MIN_RECHARGE} and ₹${MAX_RECHARGE}`,
      });
    }

    const amountPaise = Math.round(amount * 100);
    const merchantOrderId = phonepe.generateMerchantOrderId();

    const order = await PaymentOrder.create({
      userId: req.user.id,
      merchantOrderId,
      amount,
      amountPaise,
      status: "PENDING",
    });

    const payment = await phonepe.createCheckoutPayment({
      amountPaise,
      merchantOrderId,
    });

    order.phonepeOrderId = payment.phonepeOrderId;
    order.phonepeState = payment.phonepeState;
    await order.save();

    res.status(200).json({
      success: true,
      merchantOrderId,
      amount,
      redirectUrl: payment.redirectUrl,
    });
  } catch (error) {
    console.error("INITIATE PAYMENT ERROR 👉", error);
    res.status(500).json({
      message: error.message || "Failed to initiate payment",
    });
  }
};

/* GET /wallet/payment/status/:merchantOrderId */
const getPaymentStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;
    const order = await PaymentOrder.findOne({
      merchantOrderId,
      userId: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    if (order.status === "PENDING" && phonepe.isPhonePeConfigured()) {
      try {
        await syncOrderFromPhonePe(order);
      } catch (syncErr) {
        console.error("SYNC PAYMENT STATUS ERROR 👉", syncErr);
      }
    }

    const fresh = await PaymentOrder.findById(order._id);
    res.status(200).json({
      merchantOrderId: fresh.merchantOrderId,
      amount: fresh.amount,
      status: fresh.status,
      phonepeState: fresh.phonepeState,
    });
  } catch (error) {
    console.error("PAYMENT STATUS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* POST /wallet/payment/callback — PhonePe webhook (public) */
const phonePeCallback = async (req, res) => {
  try {
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const authorization = req.headers.authorization || "";

    let callbackData;
    try {
      callbackData = phonepe.validateWebhook(authorization, rawBody);
    } catch (err) {
      console.error("CALLBACK VALIDATION FAILED 👉", err);
      return res.status(401).json({ message: "Invalid callback" });
    }

    const payload = callbackData.payload || callbackData;
    const merchantOrderId =
      payload.originalMerchantOrderId || payload.merchantOrderId;

    if (!merchantOrderId) {
      return res.status(200).json({ received: true });
    }

    const order = await PaymentOrder.findOne({ merchantOrderId });
    if (!order) {
      return res.status(200).json({ received: true });
    }

    if (phonepe.isPaymentSuccessState(payload.state)) {
      await creditWalletForOrder(order, payload.orderId || merchantOrderId);
    } else if (
      ["FAILED", "CHECKOUT_ORDER_FAILED"].includes(String(payload.state))
    ) {
      await markOrderFailed(order, payload.state);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("PHONEPE CALLBACK ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* GET /wallet/payment/redirect — user returns after PhonePe checkout */
const paymentRedirect = async (req, res) => {
  try {
    const { merchantOrderId } = req.query;
    if (!merchantOrderId) {
      return res.status(400).send("Missing order id");
    }

    const order = await PaymentOrder.findOne({ merchantOrderId });
    if (!order) {
      return res.status(404).send("Order not found");
    }

    let finalStatus = order.status;
    if (order.status === "PENDING" && phonepe.isPhonePeConfigured()) {
      try {
        const synced = await syncOrderFromPhonePe(order);
        finalStatus = synced.order.status;
      } catch (syncErr) {
        console.error("REDIRECT SYNC ERROR 👉", syncErr);
      }
    } else {
      finalStatus = order.status;
    }

    const appScheme = process.env.APP_SCHEME || "courtkutchery";
    const deepLink = `${appScheme}://wallet?payment=${finalStatus === "SUCCESS" ? "success" : "pending"}&merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

    const title =
      finalStatus === "SUCCESS"
        ? "Payment Successful"
        : finalStatus === "FAILED"
          ? "Payment Failed"
          : "Payment Processing";

    const message =
      finalStatus === "SUCCESS"
        ? `₹${order.amount} has been added to your wallet.`
        : finalStatus === "FAILED"
          ? "Your payment could not be completed. Please try again."
          : "We are confirming your payment. Return to the app to refresh your balance.";

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 40px 20px; background: #f3f7ff; }
    .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 400px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    h1 { color: #1e3a8a; font-size: 22px; }
    p { color: #475569; line-height: 1.5; }
    a { display: inline-block; margin-top: 20px; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${deepLink}">Return to Court Kuchery</a>
  </div>
  <script>setTimeout(function(){ window.location.href = "${deepLink}"; }, 1500);</script>
</body>
</html>`);
  } catch (error) {
    console.error("PAYMENT REDIRECT ERROR 👉", error);
    res.status(500).send("Something went wrong");
  }
};

module.exports = {
  initiatePayment,
  getPaymentStatus,
  phonePeCallback,
  paymentRedirect,
};
