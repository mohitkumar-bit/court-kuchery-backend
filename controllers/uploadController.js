const { uploadImageBuffer } = require("../services/cloudinaryService");
const User = require("../modals/authModal");
const Lawyer = require("../modals/Lawyer");

const uploadClientProfileImage = async (req, res) => {
  try {
    if (req.user.role !== "USER") {
      return res.status(403).json({ message: "Client access only" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const uploaded = await uploadImageBuffer(req.file.buffer, {
      folder: "court-kutchery/clients",
      publicId: `client_${req.user.id}`,
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profileImage: uploaded.secure_url },
      { new: true }
    ).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile image updated",
      profileImage: uploaded.secure_url,
      user,
    });
  } catch (error) {
    console.error("CLIENT PROFILE IMAGE UPLOAD ERR 👉", error);
    res.status(500).json({
      message: error.message || "Failed to upload profile image",
    });
  }
};

const uploadLawyerProfileImage = async (req, res) => {
  try {
    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ message: "Lawyer access only" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const uploaded = await uploadImageBuffer(req.file.buffer, {
      folder: "court-kutchery/lawyers",
      publicId: `lawyer_${req.user.id}`,
    });

    const lawyer = await Lawyer.findByIdAndUpdate(
      req.user.id,
      { profileImage: uploaded.secure_url },
      { new: true }
    ).select("-password -refreshToken");

    if (!lawyer) {
      return res.status(404).json({ message: "Lawyer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile image updated",
      profileImage: uploaded.secure_url,
      lawyer,
    });
  } catch (error) {
    console.error("LAWYER PROFILE IMAGE UPLOAD ERR 👉", error);
    res.status(500).json({
      message: error.message || "Failed to upload profile image",
    });
  }
};

/** Generic authenticated image upload (e.g. bar council ID photo) */
const uploadImage = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const folder =
      req.body.folder === "documents"
        ? "court-kutchery/documents"
        : "court-kutchery/uploads";

    const uploaded = await uploadImageBuffer(req.file.buffer, { folder });

    res.status(200).json({
      success: true,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
    });
  } catch (error) {
    console.error("IMAGE UPLOAD ERR 👉", error);
    res.status(500).json({
      message: error.message || "Failed to upload image",
    });
  }
};

module.exports = {
  uploadClientProfileImage,
  uploadLawyerProfileImage,
  uploadImage,
};
