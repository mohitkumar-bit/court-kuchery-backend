/**
 * Create or update an admin user (email + password).
 *
 * Usage:
 *   node scripts/create-admin.js admin@court.com YourStrongPassword "Admin Name"
 *
 * Or with env:
 *   ADMIN_EMAIL=admin@court.com ADMIN_PASSWORD=secret ADMIN_NAME="Admin" node scripts/create-admin.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../modals/authModal");

async function main() {
  const email = (
    process.argv[2] ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .toLowerCase()
    .trim();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || "";
  const name = process.argv[4] || process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error(
      "Usage: node scripts/create-admin.js <email> <password> [name]"
    );
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  const mongoUri = process.env.URL_DB || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("URL_DB missing in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.password = hashedPassword;
    existing.role = "ADMIN";
    existing.name = name;
    existing.isBlocked = false;
    existing.isPhoneVerified = true;
    await existing.save();
    console.log(`Updated existing user to ADMIN: ${email}`);
  } else {
    await User.create({
      name,
      email,
      password: hashedPassword,
      role: "ADMIN",
      isPhoneVerified: true,
    });
    console.log(`Created ADMIN: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
