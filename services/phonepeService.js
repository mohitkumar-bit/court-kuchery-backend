const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
} = require("@phonepe-pg/pg-sdk-node");

let clientInstance = null;

const isPhonePeConfigured = () =>
  Boolean(
    process.env.PHONEPE_CLIENT_ID &&
      process.env.PHONEPE_CLIENT_SECRET &&
      process.env.PHONEPE_CALLBACK_BASE_URL
  );

const getPhonePeClient = () => {
  if (!isPhonePeConfigured()) {
    throw new Error("PhonePe is not configured on the server");
  }
  if (!clientInstance) {
    const env =
      process.env.PHONEPE_ENV === "PRODUCTION"
        ? Env.PRODUCTION
        : Env.SANDBOX;
    clientInstance = StandardCheckoutClient.getInstance(
      process.env.PHONEPE_CLIENT_ID,
      process.env.PHONEPE_CLIENT_SECRET,
      Number(process.env.PHONEPE_CLIENT_VERSION || 1),
      env
    );
  }
  return clientInstance;
};

const getPublicBaseUrl = () =>
  (process.env.PHONEPE_CALLBACK_BASE_URL || "").replace(/\/$/, "");

const isPaymentSuccessState = (state) =>
  ["COMPLETED", "CHECKOUT_ORDER_COMPLETED", "SUCCESS"].includes(
    String(state || "").toUpperCase()
  );

const createCheckoutPayment = async ({ amountPaise, merchantOrderId }) => {
  const client = getPhonePeClient();
  const baseUrl = getPublicBaseUrl();
  const redirectUrl = `${baseUrl}/wallet/payment/redirect?merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(amountPaise)
    .redirectUrl(redirectUrl)
    .build();

  const response = await client.pay(request);
  return {
    redirectUrl: response.redirectUrl,
    phonepeOrderId: response.orderId,
    phonepeState: response.state,
  };
};

const fetchOrderStatus = async (merchantOrderId) => {
  const client = getPhonePeClient();
  return client.getOrderStatus(merchantOrderId);
};

const validateWebhook = (authorization, rawBody) => {
  const username = process.env.PHONEPE_WEBHOOK_USERNAME;
  const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!username || !password) {
    return JSON.parse(rawBody);
  }
  const client = getPhonePeClient();
  return client.validateCallback(username, password, authorization, rawBody);
};

const generateMerchantOrderId = () => `CK_${randomUUID().replace(/-/g, "")}`;

module.exports = {
  isPhonePeConfigured,
  isPaymentSuccessState,
  createCheckoutPayment,
  fetchOrderStatus,
  validateWebhook,
  generateMerchantOrderId,
  getPublicBaseUrl,
};
