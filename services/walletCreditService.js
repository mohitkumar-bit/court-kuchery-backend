const User = require("../modals/authModal");
const WalletTransaction = require("../modals/WalletTransaction");
const PaymentOrder = require("../modals/PaymentOrder");

const creditWalletForOrder = async (order, referenceId) => {
  if (order.status === "SUCCESS") {
    return { alreadyCredited: true, order };
  }

  const user = await User.findById(order.userId);
  if (!user) {
    throw new Error("User not found");
  }

  const newBalance = (user.walletBalance || 0) + order.amount;

  await WalletTransaction.create({
    userId: user._id,
    type: "CREDIT",
    amount: order.amount,
    reason: "RECHARGE",
    referenceId: referenceId || order.merchantOrderId,
    balanceAfter: newBalance,
  });

  user.walletBalance = newBalance;
  await user.save();

  order.status = "SUCCESS";
  order.phonepeState = order.phonepeState || "COMPLETED";
  await order.save();

  return { alreadyCredited: false, order, balance: newBalance };
};

const markOrderFailed = async (order, phonepeState) => {
  if (order.status === "SUCCESS") return order;
  order.status = "FAILED";
  order.phonepeState = phonepeState || "FAILED";
  await order.save();
  return order;
};

module.exports = {
  creditWalletForOrder,
  markOrderFailed,
  PaymentOrder,
};
