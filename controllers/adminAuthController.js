const bcrypt = require("bcryptjs");
const User = require("../modals/authModal");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

function toAdminUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

async function issueAdminTokens(user) {
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
    user: toAdminUser(user),
  };
}

/* ADMIN LOGIN — email + password only (no OTP) */
const adminLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .toLowerCase()
      .trim();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || user.role !== "ADMIN") {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const tokens = await issueAdminTokens(user);

    res.status(200).json({
      message: "Admin login successful",
      ...tokens,
    });
  } catch (error) {
    console.error("ADMIN LOGIN ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ADMIN REFRESH */
const adminRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.id);
    if (
      !user ||
      user.role !== "ADMIN" ||
      user.refreshToken !== refreshToken
    ) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });

    res.status(200).json({ accessToken });
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Invalid or expired refresh token" });
  }
};

/* ADMIN LOGOUT */
const adminLogout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("ADMIN LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  adminLogin,
  adminRefresh,
  adminLogout,
};
