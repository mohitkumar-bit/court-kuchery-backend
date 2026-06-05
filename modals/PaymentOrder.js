const mongoose = require("mongoose");

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    merchantOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 100,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    phonepeOrderId: String,
    phonepeState: String,
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PaymentOrder ||
  mongoose.model("PaymentOrder", paymentOrderSchema);
