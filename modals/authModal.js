const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },

    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    // Existing accounts default to verified; new signups set this to false
    isPhoneVerified: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
    },

    expoPushTokens: [
      {
        token: { type: String, required: true },
        platform: { type: String, default: "unknown" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true, // 👈 adds createdAt & updatedAt automatically
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
