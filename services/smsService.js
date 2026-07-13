/**
 * Fast2SMS DLT Manual SMS for OTP
 * (Smart OTP /dev/otp/send needs a separate otp_id from Smart OTP panel —
 *  DLT Content Template ID does NOT work there.)
 *
 * Docs: https://docs.fast2sms.com/reference/dlt-manual
 */

const BULK_URL = "https://www.fast2sms.com/dev/bulkV2";

const OTP_MESSAGE_TEMPLATE =
  "Dear User, Your OTP for login to Court Kutchery app is {#var#}. Powered by ASS REVOLUTION PRIVATE LIMITED.";

function getApiKey() {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) throw new Error("FAST2SMS_API_KEY is not configured");
  return apiKey;
}

function getSenderId() {
  return (process.env.FAST2SMS_SENDER_ID || "ASSCKY").replace(/\*/g, "");
}

function getTemplateId() {
  const id = process.env.FAST2SMS_TEMPLATE_ID || process.env.FAST2SMS_OTP_ID;
  if (!id) throw new Error("FAST2SMS_TEMPLATE_ID is not configured");
  return id;
}

function buildOtpMessage(otp) {
  return OTP_MESSAGE_TEMPLATE.replace("{#var#}", String(otp));
}

/**
 * Normalize Indian mobile numbers to 10 digits.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

function extractErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  return fallback;
}

/**
 * Send OTP SMS via DLT Manual (requires sender_id + template_id + exact approved message).
 */
async function sendOtpSms(phone, otp) {
  const numbers = normalizePhone(phone);
  if (!numbers) throw new Error("Invalid phone number");

  const body = {
    route: "dlt_manual",
    sender_id: getSenderId(),
    message: buildOtpMessage(otp),
    template_id: getTemplateId(),
    numbers,
  };

  if (process.env.FAST2SMS_ENTITY_ID) {
    body.entity_id = process.env.FAST2SMS_ENTITY_ID;
  }

  const response = await fetch(BULK_URL, {
    method: "POST",
    headers: {
      // Fast2SMS expects lowercase `authorization` with raw API key (no Bearer)
      authorization: getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.return === false) {
    const error = new Error(extractErrorMessage(data, "Failed to send SMS"));
    error.statusCode = data.status_code || response.status || 500;
    error.details = data;
    throw error;
  }

  return {
    phone: numbers,
    requestId: data.request_id,
    message: extractErrorMessage(data, "SMS sent successfully"),
  };
}

module.exports = {
  normalizePhone,
  buildOtpMessage,
  sendOtpSms,
};
