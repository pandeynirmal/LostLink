import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
  },

  email: {
    type: String,
    required: [true, "Please provide an email"],
    unique: true,
  },

  password: {
    type: String,
  },

  organization: {
    type: String,
  },

  //  OTP Fields
  otp: {
    type: String,
  },

  otpExpires: {
    type: Date,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ["active", "resolved", "removed"],
    default: "active",
  },

  removedByAdmin: {
    type: Boolean,
    default: false,
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
  },
  walletPrivateKeyEncrypted: {
    type: String,
  },
  walletCreatedAt: {
    type: Date,
  },
  // Persistent off-chain balance stored in DB (never resets)
  offchainBalance: {
    type: Number,
    default: 0,
  },
});

// Performance indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isVerified: 1, removedByAdmin: 1 });
UserSchema.index({ createdAt: -1 });

export default mongoose.models.User || mongoose.model("User", UserSchema);

