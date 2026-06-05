const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ["CLIENT", "LAWYER"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lawyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lawyer",
      default: null,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: ["SYSTEM", "PROMO", "WALLET", "CONSULT", "GENERAL"],
      default: "GENERAL",
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PushCampaign",
      default: null,
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ lawyerId: 1, createdAt: -1 });

module.exports =
  mongoose.models.UserNotification ||
  mongoose.model("UserNotification", userNotificationSchema);
