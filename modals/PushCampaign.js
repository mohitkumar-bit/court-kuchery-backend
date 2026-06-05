const mongoose = require("mongoose");

const pushCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ["CLIENT", "LAWYER", "BOTH"],
      required: true,
    },
    category: {
      type: String,
      enum: ["SYSTEM", "PROMO", "WALLET", "CONSULT", "GENERAL"],
      default: "GENERAL",
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NotificationTemplate",
      default: null,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    stats: {
      clientRecipients: { type: Number, default: 0 },
      lawyerRecipients: { type: Number, default: 0 },
      pushSent: { type: Number, default: 0 },
      pushFailed: { type: Number, default: 0 },
      inboxCreated: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PushCampaign ||
  mongoose.model("PushCampaign", pushCampaignSchema);
