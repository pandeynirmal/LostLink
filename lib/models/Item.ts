import mongoose, { Schema, Document, Model } from "mongoose";

export interface IItem extends Document {
  type: "lost" | "found";
  description: string;
  imageUrl: string;
  embedding: number[];
  userId?: mongoose.Types.ObjectId;
  status: "pending" | "matched" | "resolved";
  matchedItemId?: mongoose.Types.ObjectId;
  matchScore?: number;
  blockchain?: {
    txHash?: string;
    network?: string;
    contractAddress?: string;
    action?: "register" | "match" | "verify";
    verifiedAt?: Date;
  };
  createdAt: Date;
  // Location fields
  latitude?: number;
  longitude?: number;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  // QR code fields
  qrCodeHash?: string;
  qrCodeUrl?: string;
  // Reward fields
  rewardAmount?: number;
  rewardPaymentMethod?: "offchain" | "onchain";
  contactPhone?: string;
  isClaimed?: boolean;
  rewardTxHash?: string;
  removedByAdmin?: boolean;
  removedAt?: Date;
}

const ItemSchema = new Schema<IItem>({
  type: {
    type: String,
    enum: ["lost", "found"],
    required: true,
  },
  description: {
    type: String,
    required: [true, "Please provide a description"],
  },
  imageUrl: {
    type: String,
    required: [true, "Image URL is required"],
  },
  embedding: {
    type: [Number],
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  status: {
    type: String,
    enum: ["pending", "matched", "resolved"],
    default: "pending",
  },
  matchedItemId: {
    type: Schema.Types.ObjectId,
    ref: "Item",
  },
  matchScore: {
    type: Number,
  },
  blockchain: {
    txHash: { type: String },
    network: { type: String },
    contractAddress: { type: String },
    action: { type: String, enum: ["register", "match", "verify"] },
    verifiedAt: { type: Date },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Location fields
  latitude: {
    type: Number,
    required: false,
  },
  longitude: {
    type: Number,
    required: false,
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    },
  },
  // QR code fields
  qrCodeHash: {
    type: String,
    unique: true,
    sparse: true,
  },
  qrCodeUrl: {
    type: String,
  },
  // Reward fields
  rewardAmount: {
    type: Number,
    default: 0,
  },
  rewardPaymentMethod: {
    type: String,
    enum: ["offchain", "onchain"],
    default: "offchain",
  },
  contactPhone: {
    type: String,
    trim: true,
  },
  isClaimed: {
    type: Boolean,
    default: false,
  },
  rewardTxHash: {
    type: String,
  },
  // Admin soft delete fields
  removedByAdmin: {
    type: Boolean,
    default: false,
  },
  removedAt: {
    type: Date,
  },
});

// Create geospatial index for location-based queries
ItemSchema.index({ location: "2dsphere" });

// Create index on QR code hash for fast lookups
ItemSchema.index({ qrCodeHash: 1 });

// Performance indexes for common queries
ItemSchema.index({ userId: 1, createdAt: -1 });
ItemSchema.index({ type: 1, removedByAdmin: 1, createdAt: -1 });
ItemSchema.index({ status: 1 });
ItemSchema.index({ removedByAdmin: 1, createdAt: -1 });
ItemSchema.index({ matchedItemId: 1 });
ItemSchema.index({ isClaimed: 1 });

// Pre-save hook to sync location fields
ItemSchema.pre("save", function (next) {
  if (this.latitude !== undefined && this.longitude !== undefined) {
    this.location = {
      type: "Point",
      coordinates: [this.longitude, this.latitude],
    };
  }
  next();
});

const Item: Model<IItem> =
  mongoose.models.Item || mongoose.model<IItem>("Item", ItemSchema);

export default Item;
