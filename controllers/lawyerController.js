const bcrypt = require("bcryptjs");
const Lawyer = require("../modals/Lawyer");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require("../utils/jwt");
const Payout = require("../modals/Payout");
const WalletTransaction = require("../modals/WalletTransaction");
const SystemSettings = require("../modals/SystemSettings");
const mongoose = require("mongoose");
const { acquireLock, releaseLock } = require("../utils/lock");
const {
  createAndSendOtp,
  verifyOtpCode,
  normalizePhone,
} = require("../services/otpService");
const { emitLawyerAvailability } = require("../socket/socket");

const LAWYER_OTP_PURPOSE = "LAWYER_SIGNUP";

async function findLawyerByPhone(phone10) {
  return Lawyer.findOne({
    $or: [
      { phone: phone10 },
      { phone: `+91${phone10}` },
      { phone: `91${phone10}` },
      { phone: `0${phone10}` },
    ],
  }).select("+password");
}

async function issueLawyerTokens(lawyer) {
  const accessToken = generateAccessToken({
    id: lawyer._id,
    role: "LAWYER",
  });
  const refreshToken = generateRefreshToken({
    id: lawyer._id,
    role: "LAWYER",
  });

  lawyer.refreshToken = refreshToken;
  lawyer.isOnline = true;
  await lawyer.save();

  emitLawyerAvailability(lawyer._id, true);

  return {
    accessToken,
    refreshToken,
    lawyer: {
      id: lawyer._id,
      name: lawyer.name,
      email: lawyer.email,
      phone: lawyer.phone,
      profileCompleted: lawyer.profileCompleted,
      isOnline: lawyer.isOnline,
      isVerified: lawyer.isVerified,
      courtType: lawyer.courtType,
      isPhoneVerified: lawyer.isPhoneVerified,
      profileImage: lawyer.profileImage,
    },
  };
}

/* REGISTER LAWYER */
const registerLawyer = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const existing = await Lawyer.findOne({
      $or: [
        { email: String(email).toLowerCase().trim() },
        { phone: normalizedPhone },
        { phone: `+91${normalizedPhone}` },
        { phone: `91${normalizedPhone}` },
      ],
    });

    if (existing) {
      if (!existing.isPhoneVerified) {
        const sameEmail =
          existing.email === String(email).toLowerCase().trim();
        const samePhone = normalizePhone(existing.phone) === normalizedPhone;

        if (sameEmail && samePhone) {
          try {
            await createAndSendOtp(normalizedPhone, LAWYER_OTP_PURPOSE);
          } catch (smsErr) {
            if (smsErr.statusCode === 429) {
              return res.status(429).json({ message: smsErr.message });
            }
            console.error("LAWYER RESEND OTP ERROR 👉", smsErr.message, smsErr.details || "");
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

      return res.status(400).json({ message: "Lawyer already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const lawyer = await Lawyer.create({
      name,
      email,
      phone: normalizedPhone,
      password: hashedPassword,
      isVerified: false,
      isPhoneVerified: false,
      profileCompleted: false,
    });

    try {
      await createAndSendOtp(normalizedPhone, LAWYER_OTP_PURPOSE);
    } catch (smsErr) {
      console.error("LAWYER SIGNUP OTP SEND ERROR 👉", smsErr.message, smsErr.details || "");
      return res.status(201).json({
        message:
          "Account created, but OTP could not be sent. Please tap Resend OTP.",
        needsVerification: true,
        phone: normalizedPhone,
        otpError: smsErr.message,
        lawyer: {
          id: lawyer._id,
          name: lawyer.name,
          email: lawyer.email,
          phone: lawyer.phone,
          profileCompleted: lawyer.profileCompleted,
        },
      });
    }

    res.status(201).json({
      message: "Account created. Please verify the OTP sent to your phone.",
      needsVerification: true,
      phone: normalizedPhone,
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
        phone: lawyer.phone,
        profileCompleted: lawyer.profileCompleted,
      },
    });
  } catch (error) {
    console.error("REGISTER LAWYER ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const sendLawyerSignupOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const purpose =
      String(req.body.purpose || "LAWYER_SIGNUP").toUpperCase() === "LAWYER_LOGIN" ||
      String(req.body.purpose || "").toUpperCase() === "LOGIN"
        ? "LAWYER_LOGIN"
        : "LAWYER_SIGNUP";

    if (!phone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const lawyer = await findLawyerByPhone(phone);
    if (!lawyer) {
      return res.status(404).json({
        message: "No account found with this phone number. Please sign up first.",
      });
    }
    if (lawyer.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }
    if (purpose === "LAWYER_SIGNUP" && lawyer.isPhoneVerified) {
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
    console.error("SEND LAWYER OTP ERROR 👉", error.message, error.details || "");
    res.status(error.statusCode || 500).json({
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
};

const verifyLawyerSignupOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || "").trim();
    const purpose =
      String(req.body.purpose || "LAWYER_SIGNUP").toUpperCase() === "LAWYER_LOGIN" ||
      String(req.body.purpose || "").toUpperCase() === "LOGIN"
        ? "LAWYER_LOGIN"
        : "LAWYER_SIGNUP";

    try {
      await verifyOtpCode(phone, otp, purpose);
    } catch (verifyErr) {
      return res.status(verifyErr.statusCode || 400).json({
        message: verifyErr.message || "Invalid OTP",
      });
    }

    const lawyer = await findLawyerByPhone(phone);
    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }
    if (lawyer.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    lawyer.isPhoneVerified = true;
    lawyer.phone = phone;
    const tokens = await issueLawyerTokens(lawyer);

    res.status(200).json({
      message:
        purpose === "LAWYER_LOGIN"
          ? "Login successful"
          : "Phone verified successfully",
      ...tokens,
    });
  } catch (error) {
    console.error("VERIFY LAWYER OTP ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* GET LAWYER PROFILE */
const getLawyerById = async (req, res) => {
  try {
    const lawyer = await Lawyer.findById(req.params.lawyerId).select(
      "-password"
    );

    if (!lawyer || !lawyer.isVerified) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({ lawyer });
  } catch (error) {
    res.status(500).json({ message: "Server errorrrr" });
  }
};

/* UPDATE AVAILABILITY */
const updateAvailability = async (req, res) => {
  try {
    const { isOnline } = req.body;

    const lawyer = await Lawyer.findByIdAndUpdate(
      req.user.id,
      { isOnline: !!isOnline },
      { new: true }
    ).select("-password");

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    emitLawyerAvailability(lawyer._id, lawyer.isOnline);

    res.status(200).json({
      message: "Availability updated",
      isOnline: lawyer.isOnline,
      lawyer,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({ message: "Server error" });
  }
};

const verifyLawyer = async (req, res) => {

  try {
    const { lawyerId } = req.params;

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      { isVerified: true },
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      message: "Lawyer verified successfully",
      lawyerId: lawyer._id,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({ message: "Server error" });
  }
};

const lawyerLogin = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }

    const lawyer = await findLawyerByPhone(phone);

    if (!lawyer) {
      return res.status(404).json({
        message: "No account found with this phone number. Please sign up first.",
      });
    }

    if (lawyer.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    try {
      await createAndSendOtp(phone, "LAWYER_LOGIN");
    } catch (smsErr) {
      if (smsErr.statusCode === 429) {
        return res.status(429).json({ message: smsErr.message });
      }
      console.error("LAWYER LOGIN OTP SEND ERROR 👉", smsErr.message, smsErr.details || "");
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
    console.error("LAWYER LOGIN ERROR 👉", error);
    res.status(500).json({ message: error.message });
  }
};

const lawyerLogout = async (req, res) => {
  try {
    const lawyerId = req.user.id;

    await Lawyer.findByIdAndUpdate(lawyerId, {
      refreshToken: null,
      isOnline: false, // Auto set offline on logout
    });

    emitLawyerAvailability(lawyerId, false);

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("LAWYER LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getLawyers = async (req, res) => {
  try {
    const {
      specialization,
      sort,
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      onlineOnly,
      courtType,
      latitude,
      longitude,
      district,
      state,
    } = req.query;

    let lawyers = [];
    let total = 0;
    const skip = (Number(page) - 1) * Number(limit);

    const getAggregation = (matchQuery, nearCoords = null) => {
      const p = [];
      if (nearCoords) {
        p.push({
          $geoNear: {
            near: { type: "Point", coordinates: nearCoords },
            distanceField: "distance",
            spherical: true,
            query: { isVerified: true, ...matchQuery },
            distanceMultiplier: 0.001,
          },
        });
      } else {
        p.push({ $match: { isVerified: true, ...matchQuery } });
      }

      // Add common filters
      const filterMatch = {};
      if (specialization) {
        filterMatch.specialization = String(specialization).toLowerCase().trim();
      }
      if (courtType) filterMatch.courtType = { $in: courtType.split(",") };
      if (minPrice || maxPrice) {
        filterMatch.ratePerMinute = {};
        if (minPrice) filterMatch.ratePerMinute.$gte = Number(minPrice);
        if (maxPrice) filterMatch.ratePerMinute.$lte = Number(maxPrice);
      }
      if (onlineOnly === "true") filterMatch.isOnline = true;
      if (Object.keys(filterMatch).length > 0) p.push({ $match: filterMatch });

      // Default sort for non-proximity
      if (!nearCoords) {
        let sortOption = { rating: -1, createdAt: -1 };
        if (sort === "price_low") sortOption = { ratePerMinute: 1 };
        else if (sort === "price_high") sortOption = { ratePerMinute: -1 };
        else if (sort === "experience") sortOption = { experienceYears: -1 };
        p.push({ $sort: sortOption });
      }

      return p;
    };

    // TIER 1: Proximity
    if (latitude && longitude) {
      const p = getAggregation({}, [parseFloat(longitude), parseFloat(latitude)]);
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // TIER 2: District
    if (lawyers.length === 0 && district) {
      const p = getAggregation({ district });
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // TIER 3: State
    if (lawyers.length === 0 && state) {
      const p = getAggregation({ state });
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      if (lawyers.length > 0) {
        const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
        total = countRes[0]?.total || 0;
      }
    }

    // FINAL FALLBACK: All verified (if still nothing found)
    if (lawyers.length === 0) {
      const p = getAggregation({});
      lawyers = await Lawyer.aggregate([...p, { $skip: skip }, { $limit: Number(limit) }, { $project: { password: 0, refreshToken: 0 } }]);
      const countRes = await Lawyer.aggregate([...p, { $count: "total" }]);
      total = countRes[0]?.total || 0;
    }

    res.status(200).json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      lawyers,
    });


  } catch (error) {
    console.error("GET LAWYERS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const refreshLawyerAccessToken = async (req, res) => {

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // verify refresh token signature
    const decoded = verifyRefreshToken(refreshToken);

    // check token exists in DB
    const user = await Lawyer.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // issue new access token
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: "LAWYER",
    });

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.log(error);

    return res.status(401).json({ message: "Invalid or expired refresh token" }, error);

  }
};


const getLawyerProfile = async (req, res) => {
  console.log("/meeee called ");

  try {
    const lawyer = await Lawyer.findById(req.user.id).select("-password");
    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }
    res.status(200).json({ success: true, lawyer });
  } catch (error) {
    res.status(500).json({ message: "Server errorrrr", error });
    console.log(error);

  }
};

const getLawyerStats = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const ConsultSession = require("../modals/consultSession");

    const lawyer = await Lawyer.findById(lawyerId);
    if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });

    // 1. Withdrawal Stats
    const payoutStats = await Payout.aggregate([
      { $match: { lawyerId: new mongoose.Types.ObjectId(lawyerId), status: "PAID" } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } }
    ]);

    const totalPaidToBank = payoutStats[0]?.totalPaid || 0;

    // 2. Total Consultations
    const consultCount = await ConsultSession.countDocuments({ lawyerId });

    // 3. Total Clients
    const clientCount = (await ConsultSession.distinct("userId", { lawyerId })).length;

    res.status(200).json({
      success: true,
      stats: {
        totalEarnings: lawyer.totalEarnings || 0,
        availableBalance: lawyer.availableBalance || 0,
        pendingBalance: lawyer.pendingBalance || 0,
        paidToBank: totalPaidToBank,
        totalConsultations: consultCount,
        totalClients: clientCount
      }
    });
  } catch (error) {
    console.error("GET LAWYER STATS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* REQUEST WITHDRAWAL — admin pays manually via bank transfer */
const withdrawFunds = async (req, res) => {
  const lawyerId = req.user.id;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid withdrawal amount" });
  }

  const settings = await SystemSettings.findOne();
  const minWithdrawal = settings?.minWithdrawalAmount ?? 500;
  if (amount < minWithdrawal) {
    return res.status(400).json({
      message: `Minimum withdrawal request is ₹${minWithdrawal}`,
    });
  }

  const lockKey = `withdraw_lock:${lawyerId}`;
  const hasLock = await acquireLock(lockKey, 30);
  if (!hasLock) {
    return res.status(429).json({ message: "A withdrawal request is already being processed. Please wait." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lawyer = await Lawyer.findById(lawyerId).session(session);
    if (!lawyer) {
      await session.abortTransaction();
      await releaseLock(lockKey);
      return res.status(404).json({ message: "Lawyer not found" });
    }

    const bank = lawyer.bankDetails || {};
    if (!bank.accountNumber || !bank.ifscCode || !bank.accountHolder) {
      await session.abortTransaction();
      await releaseLock(lockKey);
      return res.status(400).json({
        message: "Add your bank details in profile before requesting a withdrawal.",
      });
    }

    const existingPending = await Payout.findOne({
      lawyerId,
      status: "PENDING",
    }).session(session);
    if (existingPending) {
      await session.abortTransaction();
      await releaseLock(lockKey);
      return res.status(400).json({
        message: "You already have a pending withdrawal request. Wait for admin approval.",
      });
    }

    if (lawyer.availableBalance < amount) {
      await session.abortTransaction();
      await releaseLock(lockKey);
      return res.status(400).json({ message: "Insufficient available balance" });
    }

    lawyer.availableBalance -= amount;
    await lawyer.save({ session });

    const payout = await Payout.create(
      [
        {
          lawyerId,
          amount,
          status: "PENDING",
        },
      ],
      { session }
    );

    const payoutId = payout[0]._id.toString();

    await WalletTransaction.create(
      [
        {
          userId: lawyerId,
          type: "DEBIT",
          amount,
          reason: "LAWYER_WITHDRAWAL",
          balanceAfter: lawyer.availableBalance,
          referenceId: `PAYOUT_REQUEST:${payoutId}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    await releaseLock(lockKey);

    res.status(200).json({
      success: true,
      message:
        "Withdrawal request submitted. Admin will transfer funds to your bank account manually.",
      payout: payout[0],
    });
  } catch (error) {
    await session.abortTransaction();
    await releaseLock(lockKey);
    console.error("WITHDRAWAL REQUEST ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    session.endSession();
  }
};

const getLawyerPayouts = async (req, res) => {
  try {
    const payouts = await Payout.find({ lawyerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.status(200).json({ success: true, payouts });
  } catch (error) {
    console.error("GET LAWYER PAYOUTS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const completeLawyerProfile = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { specialization, ratePerMinute, experienceYears, bio, barCouncilId, barCouncilIdPhoto, bankDetails, courtType, location, address, district, state } = req.body;

    if (!specialization || !ratePerMinute || !experienceYears || !barCouncilId || !bankDetails) {
      return res.status(400).json({ message: "All professional and bank details are required" });
    }

    const normalizedCourtType = Array.isArray(courtType)
      ? courtType
      : typeof courtType === "string" && courtType.trim()
        ? [courtType.trim()]
        : undefined;

    const validLocation =
      location &&
      location.type === "Point" &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2
        ? location
        : undefined;

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      {
        specialization,
        ratePerMinute,
        experienceYears,
        bio,
        barCouncilId,
        barCouncilIdPhoto,
        bankDetails,
        courtType: normalizedCourtType,
        profileCompleted: true,
        ...(validLocation ? { location: validLocation } : {}),
        address,
        district,
        state,
      },
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      lawyer: {
        id: lawyer._id,
        profileCompleted: lawyer.profileCompleted,
      }
    });
  } catch (error) {
    console.error("COMPLETE PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateLawyerProfile = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { name, bio, specialization, ratePerMinute, experienceYears, phone, courtType, location, address, district, state, profileImage } = req.body;

    const normalizedCourtType = Array.isArray(courtType)
      ? courtType
      : typeof courtType === "string" && courtType.trim()
        ? [courtType.trim()]
        : undefined;

    const validLocation =
      location &&
      location.type === "Point" &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2
        ? location
        : undefined;

    const updateFields = {
      name,
      bio,
      specialization,
      ratePerMinute,
      experienceYears,
      phone,
      address,
      district,
      state,
    };
    if (normalizedCourtType) updateFields.courtType = normalizedCourtType;
    if (validLocation) updateFields.location = validLocation;
    if (profileImage !== undefined) updateFields.profileImage = profileImage;

    const lawyer = await Lawyer.findByIdAndUpdate(
      lawyerId,
      updateFields,
      { new: true }
    );

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      lawyer: {
        id: lawyer._id,
        name: lawyer.name,
        email: lawyer.email,
        phone: lawyer.phone,
        specialization: lawyer.specialization,
        ratePerMinute: lawyer.ratePerMinute,
        experienceYears: lawyer.experienceYears,
        bio: lawyer.bio,
        courtType: lawyer.courtType,
        location: lawyer.location,
        address: lawyer.address,
        district: lawyer.district,
        state: lawyer.state,
        profileImage: lawyer.profileImage,
      },
    });
  } catch (error) {
    console.error("UPDATE LAWYER PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const changeLawyerPassword = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }

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

    const lawyer = await Lawyer.findById(req.user.id).select("+password");
    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, lawyer.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    lawyer.password = await bcrypt.hash(newPassword, 10);
    await lawyer.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("CHANGE LAWYER PASSWORD ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerLawyer,
  sendLawyerSignupOtp,
  verifyLawyerSignupOtp,
  getLawyers,
  getLawyerById,
  updateAvailability,
  verifyLawyer,
  lawyerLogin,
  lawyerLogout,
  refreshLawyerAccessToken,
  getLawyerProfile,
  getLawyerStats,
  withdrawFunds,
  getLawyerPayouts,
  completeLawyerProfile,
  updateLawyerProfile,
  changeLawyerPassword,
};

