const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Otp = require("../modals/Otp");
const { sendOtpSms, normalizePhone } = require("./smsService");

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Create + SMS send OTP for a purpose (SIGNUP | LAWYER_SIGNUP)
 */
async function createAndSendOtp(phone, purpose = "SIGNUP") {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    const err = new Error("Valid 10-digit phone number is required");
    err.statusCode = 400;
    throw err;
  }

  const existing = await Otp.findOne({ phone: normalized, purpose }).sort({
    createdAt: -1,
  });
  if (
    existing &&
    Date.now() - new Date(existing.createdAt).getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    const waitSec = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS -
        (Date.now() - new Date(existing.createdAt).getTime())) /
        1000
    );
    const err = new Error(
      `Please wait ${waitSec}s before requesting another OTP`
    );
    err.statusCode = 429;
    throw err;
  }

  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, 10);

  await Otp.deleteMany({ phone: normalized, purpose });
  await Otp.create({
    phone: normalized,
    otpHash,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendOtpSms(normalized, otp);

  return {
    phone: normalized,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
  };
}

/**
 * Verify OTP for a purpose. Throws on failure. Deletes OTP on success.
 */
async function verifyOtpCode(phone, otp, purpose = "SIGNUP") {
  const normalized = normalizePhone(phone);
  const code = String(otp || "").trim();

  if (!normalized) {
    const err = new Error("Valid 10-digit phone number is required");
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{6}$/.test(code)) {
    const err = new Error("Enter the 6-digit OTP");
    err.statusCode = 400;
    throw err;
  }

  const record = await Otp.findOne({ phone: normalized, purpose }).sort({
    createdAt: -1,
  });
  if (!record) {
    const err = new Error(
      "OTP expired or not found. Please request a new one."
    );
    err.statusCode = 400;
    throw err;
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await Otp.deleteMany({ phone: normalized, purpose });
    const err = new Error("OTP expired. Please request a new one.");
    err.statusCode = 400;
    throw err;
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteMany({ phone: normalized, purpose });
    const err = new Error(
      "Too many invalid attempts. Please request a new OTP."
    );
    err.statusCode = 429;
    throw err;
  }

  const isMatch = await bcrypt.compare(code, record.otpHash);
  if (!isMatch) {
    record.attempts += 1;
    await record.save();
    const err = new Error("Invalid OTP");
    err.statusCode = 401;
    throw err;
  }

  await Otp.deleteMany({ phone: normalized, purpose });
  return { phone: normalized };
}

module.exports = {
  createAndSendOtp,
  verifyOtpCode,
  normalizePhone,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_ATTEMPTS,
};
