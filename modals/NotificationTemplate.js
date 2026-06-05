const mongoose = require("mongoose");

const notificationTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: ["CLIENT", "LAWYER", "BOTH"],
      default: "BOTH",
    },
    category: {
      type: String,
      enum: ["SYSTEM", "PROMO", "WALLET", "CONSULT", "GENERAL"],
      default: "GENERAL",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NotificationTemplate ||
  mongoose.model("NotificationTemplate", notificationTemplateSchema);
