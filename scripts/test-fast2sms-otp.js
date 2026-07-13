/**
 * Fast2SMS connectivity test
 * Usage: node scripts/test-fast2sms-otp.js [phone]
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const phoneArg = process.argv[2] || "6203889782";
const API_KEY = process.env.FAST2SMS_API_KEY;
const TEMPLATE_ID = process.env.FAST2SMS_TEMPLATE_ID || process.env.FAST2SMS_OTP_ID;
const SENDER_ID = (process.env.FAST2SMS_SENDER_ID || "ASSCKY").replace(/\*/g, "");

const MESSAGE_TEMPLATE =
  "Dear User, Your OTP for login to Court Kutchery app is {#var#}. Powered by ASS REVOLUTION PRIVATE LIMITED.";

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.slice(-10);
}

async function main() {
  const mobile = normalizePhone(phoneArg);
  const testOtp = String(Math.floor(100000 + Math.random() * 900000));
  const message = MESSAGE_TEMPLATE.replace("{#var#}", testOtp);

  console.log("\n=== Fast2SMS DLT Manual Test ===");
  console.log("Phone     :", mobile);
  console.log("Sender ID :", SENDER_ID);
  console.log("Template  :", TEMPLATE_ID);
  console.log("OTP       :", testOtp);

  const body = {
    route: "dlt_manual",
    sender_id: SENDER_ID,
    message,
    template_id: TEMPLATE_ID,
    numbers: mobile,
  };

  const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  console.log("HTTP", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.return === true) {
    console.log(`\nSUCCESS ✅ SMS sent to ${mobile}. OTP in SMS: ${testOtp}`);
  } else {
    console.log("\nFAILED ❌", data.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
