
const bcrypt = require("bcryptjs");
const User = require("../modals/authModal");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const {
  createAndSendOtp,
  verifyOtpCode,
  normalizePhone,
} = require("../services/otpService");

/** Find user by phone across common stored formats */
async function findUserByPhone(phone10) {
  return User.findOne({
    $or: [
      { phone: phone10 },
      { phone: `+91${phone10}` },
      { phone: `91${phone10}` },
      { phone: `0${phone10}` },
    ],
  }).select("+password");
}

async function issueUserTokens(user) {
  const accessToken = generateAccessToken({
    id: user._id,
    role: user.role,
  });
  const refreshToken = generateRefreshToken({
    id: user._id,
    role: user.role,
  });

  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isPhoneVerified: user.isPhoneVerified,
    },
  };
}

const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: String(email).toLowerCase().trim() },
        { phone: normalizedPhone },
        { phone: `+91${normalizedPhone}` },
        { phone: `91${normalizedPhone}` },
      ],
    });

    if (existingUser) {
      if (!existingUser.isPhoneVerified) {
        const sameEmail =
          existingUser.email === String(email).toLowerCase().trim();
        const samePhone =
          normalizePhone(existingUser.phone) === normalizedPhone;

        if (sameEmail && samePhone) {
          try {
            await createAndSendOtp(normalizedPhone, "SIGNUP");
          } catch (smsErr) {
            if (smsErr.statusCode === 429) {
              return res.status(429).json({ message: smsErr.message });
            }
            console.error("RESEND SIGNUP OTP ERROR 👉", smsErr.message, smsErr.details || "");
            return res.status(smsErr.statusCode || 500).json({
              message: smsErr.message || "Failed to send OTP",
              needsVerification: true,
              phone: normalizedPhone,
            });
          }

          return res.status(200).json({
            message: "Account pending verification. OTP sent to your phone.",
            needsVerification: true,
            phone: normalizedPhone,
          });
        }
      }

      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone: normalizedPhone,
      isPhoneVerified: false,
    });

    try {
      await createAndSendOtp(normalizedPhone, "SIGNUP");
    } catch (smsErr) {
      console.error("SIGNUP OTP SEND ERROR 👉", smsErr.message, smsErr.details || "");
      return res.status(201).json({
        message:
          "Account created, but OTP could not be sent. Please tap Resend OTP.",
        needsVerification: true,
        phone: normalizedPhone,
        otpError: smsErr.message,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
      });
    }

    res.status(201).json({
      message: "Account created. Please verify the OTP sent to your phone.",
      needsVerification: true,
      phone: normalizedPhone,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const login = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const user = await findUserByPhone(phone);
    if (!user) {
      return res.status(404).json({
        message: "No account found with this phone number. Please sign up first.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    try {
      await createAndSendOtp(phone, "LOGIN");
    } catch (smsErr) {
      if (smsErr.statusCode === 429) {
        return res.status(429).json({ message: smsErr.message });
      }
      console.error("LOGIN OTP SEND ERROR 👉", smsErr.message, smsErr.details || "");
      return res.status(500).json({
        message: smsErr.message || "Failed to send login OTP",
      });
    }

    res.status(200).json({
      message: "OTP sent to your phone. Please verify to continue.",
      needsOtp: true,
      phone,
    });
  } catch (error) {
    console.error("LOGIN ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};



const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
    });

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // verify refresh token signature
    const decoded = verifyRefreshToken(refreshToken);

    // check token exists in DB
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // issue new access token
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};


const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const userId = req.user.id;

    const update = { name };
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Valid 10-digit phone number is required" });
      }
      update.phone = normalizedPhone;
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const sendSignupOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const purpose =
      String(req.body.purpose || "SIGNUP").toUpperCase() === "LOGIN"
        ? "LOGIN"
        : "SIGNUP";

    if (!phone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const user = await findUserByPhone(phone);
    if (!user) {
      return res.status(404).json({
        message: "No account found with this phone number. Please sign up first.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    if (purpose === "SIGNUP" && user.isPhoneVerified) {
      return res.status(400).json({ message: "Phone already verified. Please login." });
    }

    const result = await createAndSendOtp(phone, purpose);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      phone: result.phone,
      purpose,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    console.error("SEND OTP ERROR 👉", error.message, error.details || "");
    res.status(error.statusCode || 500).json({
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
};

const verifySignupOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || "").trim();
    const purpose =
      String(req.body.purpose || "SIGNUP").toUpperCase() === "LOGIN"
        ? "LOGIN"
        : "SIGNUP";

    try {
      await verifyOtpCode(phone, otp, purpose);
    } catch (verifyErr) {
      return res.status(verifyErr.statusCode || 400).json({
        message: verifyErr.message || "Invalid OTP",
      });
    }

    const user = await findUserByPhone(phone);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    user.isPhoneVerified = true;
    user.phone = phone;
    const tokens = await issueUserTokens(user);

    res.status(200).json({
      message:
        purpose === "LOGIN"
          ? "Login successful"
          : "Phone verified successfully",
      ...tokens,
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  logout,
  refreshAccessToken,
  getProfile,
  updateProfile,
  changePassword,
  sendSignupOtp,
  verifySignupOtp,
};
