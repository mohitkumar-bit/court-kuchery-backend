const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");
const WalletTransaction = require("../modals/WalletTransaction");
const { getAggregatedWalletTransactions } = require("../utils/consultWalletTxn");

/* GET WALLET BALANCE */
const getWalletBalance = async (req, res) => {
  try {
    const { id, role } = req.user;
    const normalizedRole = String(role || "").toUpperCase();

    // Lawyer tokens always use Lawyer collection; also fall back if role is missing
    if (normalizedRole === "LAWYER") {
      const lawyer = await Lawyer.findById(id);
      if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });
      return res.status(200).json({
        balance: lawyer.availableBalance || 0,
        pending: lawyer.pendingBalance || 0,
        availableBalance: lawyer.availableBalance || 0,
        pendingBalance: lawyer.pendingBalance || 0,
        totalEarnings: lawyer.totalEarnings || 0,
      });
    }

    const lawyerFallback = await Lawyer.findById(id);
    if (lawyerFallback) {
      return res.status(200).json({
        balance: lawyerFallback.availableBalance || 0,
        pending: lawyerFallback.pendingBalance || 0,
        availableBalance: lawyerFallback.availableBalance || 0,
        pendingBalance: lawyerFallback.pendingBalance || 0,
        totalEarnings: lawyerFallback.totalEarnings || 0,
      });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      balance: user.walletBalance,
    });
  } catch (error) {
    console.error("WALLET BALANCE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* GET WALLET TRANSACTIONS */
const getWalletTransactions = async (req, res) => {
  try {
    const { id, role } = req.user;
    const normalizedRole = String(role || "").toUpperCase();

    // Lawyer earnings ledger (not client WalletTransaction rows)
    const isLawyer =
      normalizedRole === "LAWYER" || !!(await Lawyer.findById(id).select("_id"));

    if (isLawyer) {
      const LawyerEarning = require("../modals/LawyerEarning");
      const earnings = await LawyerEarning.find({ lawyerId: id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const transactions = earnings.map((e) => ({
        _id: e._id,
        type: "CREDIT",
        amount: e.lawyerAmount || 0,
        reason: "CONSULTATION",
        referenceId: String(e.sessionId),
        status: e.status,
        createdAt: e.createdAt,
      }));

      return res.status(200).json({ transactions });
    }

    const transactions = await getAggregatedWalletTransactions(id);
    res.status(200).json({ transactions });
  } catch (error) {
    console.error("WALLET TRANSACTIONS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const dummyRecharge = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.user.id);

    const newBalance = user.walletBalance + amount;

    await WalletTransaction.create({
      userId: user._id,
      type: "CREDIT",
      amount,
      reason: "RECHARGE",
      referenceId: "DUMMY_PAYMENT",
      balanceAfter: newBalance,
    });

    user.walletBalance = newBalance;
    await user.save();

    res.status(200).json({
      message: "Wallet recharged (dummy)",
      balance: newBalance,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getWalletBalance,
  getWalletTransactions,
  dummyRecharge
};
