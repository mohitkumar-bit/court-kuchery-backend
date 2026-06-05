const mongoose = require("mongoose");
const WalletTransaction = require("../modals/WalletTransaction");

/**
 * One wallet ledger row per consultation session (referenceId = sessionId).
 * Each billing tick adds to the same row instead of creating duplicates.
 */
async function addConsultationDebit(userId, sessionIdStr, amount, balanceAfter) {
  if (!amount || amount <= 0) return null;

  const filter = {
    userId,
    type: "DEBIT",
    reason: "CONSULTATION",
    referenceId: sessionIdStr,
  };

  const existing = await WalletTransaction.findOne(filter);
  if (existing) {
    existing.amount = Math.round((existing.amount + amount) * 100) / 100;
    existing.balanceAfter = balanceAfter;
    await existing.save();
    return existing;
  }

  return WalletTransaction.create({
    userId,
    type: "DEBIT",
    amount: Math.round(amount * 100) / 100,
    reason: "CONSULTATION",
    referenceId: sessionIdStr,
    balanceAfter,
  });
}

/**
 * Groups per-minute consultation debits into one row per session (for wallet history).
 */
async function getAggregatedWalletTransactions(userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const rows = await WalletTransaction.aggregate([
    { $match: { userId: userObjectId } },
    { $sort: { createdAt: 1 } },
    {
      $addFields: {
        groupKey: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$reason", "CONSULTATION"] },
                { $eq: ["$type", "DEBIT"] },
                { $ne: [{ $ifNull: ["$referenceId", ""] }, ""] },
              ],
            },
            then: { $concat: ["consult:", "$referenceId"] },
            else: { $toString: "$_id" },
          },
        },
      },
    },
    {
      $group: {
        _id: "$groupKey",
        userId: { $first: "$userId" },
        type: { $first: "$type" },
        amount: { $sum: "$amount" },
        reason: { $first: "$reason" },
        referenceId: { $first: "$referenceId" },
        balanceAfter: { $last: "$balanceAfter" },
        createdAt: { $last: "$createdAt" },
        docId: { $first: "$_id" },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        _id: "$docId",
        userId: 1,
        type: 1,
        amount: { $round: ["$amount", 2] },
        reason: 1,
        referenceId: 1,
        balanceAfter: 1,
        createdAt: 1,
      },
    },
  ]);

  return rows;
}

module.exports = {
  addConsultationDebit,
  getAggregatedWalletTransactions,
};
