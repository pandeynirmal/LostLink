import mongoose, { Document, Model, Schema } from "mongoose";

// Three-Layer Escrow States
// Layer 1: Funding - funded, awaiting_delivery
// Layer 2: Verification - item_delivered, awaiting_confirmation
// Layer 3: Resolution - released, refunded, disputed
export type EscrowState =
  | "funded"           // Layer 1: Funds locked, waiting for finder
  | "claim_assigned"   // Layer 1: Finder assigned, waiting for delivery
  | "awaiting_delivery"// Layer 2: Item in transit/handover
  | "item_delivered"   // Layer 2: Item delivered, awaiting owner confirmation
  | "awaiting_confirmation" // Layer 2: Waiting for final confirmations
  | "disputed"         // Layer 3: Dispute raised
  | "released"         // Layer 3: Funds released to finder
  | "refunded";        // Layer 3: Funds refunded to owner

export interface IEscrowCase extends Document {
  itemId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  finderId?: mongoose.Types.ObjectId;
  contactRequestId?: mongoose.Types.ObjectId;
  amountEth: number;
  holdSource: "contract" | "project_wallet" | "manual" | "external_escrow";
  holdTxHash?: string;
  paymentMethod?: "offchain" | "onchain";
  state: EscrowState;
  
  // Layer 2: Delivery & Verification
  deliveryMethod?: "in_person" | "shipping" | "drop_off";
  deliveryTrackingId?: string;
  deliveryNotes?: string;
  deliveryPhotos?: string[]; // URLs to photos
  itemDeliveredAt?: Date;
  itemDeliveredBy?: mongoose.Types.ObjectId; // finder who marked delivered
  
  // Confirmations
  ownerItemReceived: boolean;
  ownerItemReceivedAt?: Date;
  finderFundReceived: boolean;
  finderFundReceivedAt?: Date;
  
  // Layer 3: Multi-sig Release (2-of-3)
  ownerReleaseApproved: boolean;
  ownerReleaseApprovedAt?: Date;
  finderReleaseApproved: boolean;
  finderReleaseApprovedAt?: Date;
  adminReleaseApproved: boolean;
  adminReleaseApprovedAt?: Date;
  
  // Time-lock auto-release
  autoReleaseAt?: Date;
  autoReleaseTriggered: boolean;
  
  // Transaction hashes
  releaseTxHash?: string;
  refundTxHash?: string;
  
  // Dispute
  disputeReason?: string;
  disputeRaisedBy?: mongoose.Types.ObjectId;
  disputeRaisedAt?: Date;
  disputeResolvedAt?: Date;
  disputeResolution?: "release_to_finder" | "refund_to_owner" | "split";
  
  // Timestamps
  deadlineAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowCaseSchema = new Schema<IEscrowCase>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    finderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    contactRequestId: {
      type: Schema.Types.ObjectId,
      ref: "ContactRequest",
      index: true,
    },
    amountEth: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["offchain", "onchain"],
      default: "offchain",
    },
    holdSource: {
      type: String,
      enum: ["contract", "project_wallet", "manual", "external_escrow"],
      default: "project_wallet",
    },
    holdTxHash: {
      type: String,
    },
    state: {
      type: String,
      enum: [
        "funded",
        "claim_assigned",
        "awaiting_delivery",
        "item_delivered",
        "awaiting_confirmation",
        "disputed",
        "released",
        "refunded",
      ],
      default: "funded",
      index: true,
    },
    
    // Layer 2: Delivery & Verification
    deliveryMethod: {
      type: String,
      enum: ["in_person", "shipping", "drop_off"],
    },
    deliveryTrackingId: {
      type: String,
      trim: true,
    },
    deliveryNotes: {
      type: String,
      trim: true,
    },
    deliveryPhotos: [{
      type: String,
    }],
    itemDeliveredAt: {
      type: Date,
    },
    itemDeliveredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Confirmations
    ownerItemReceived: {
      type: Boolean,
      default: false,
    },
    ownerItemReceivedAt: {
      type: Date,
    },
    finderFundReceived: {
      type: Boolean,
      default: false,
    },
    finderFundReceivedAt: {
      type: Date,
    },
    
    // Layer 3: Multi-sig Release
    ownerReleaseApproved: {
      type: Boolean,
      default: false,
    },
    ownerReleaseApprovedAt: {
      type: Date,
    },
    finderReleaseApproved: {
      type: Boolean,
      default: false,
    },
    finderReleaseApprovedAt: {
      type: Date,
    },
    adminReleaseApproved: {
      type: Boolean,
      default: false,
    },
    adminReleaseApprovedAt: {
      type: Date,
    },
    
    // Time-lock auto-release
    autoReleaseAt: {
      type: Date,
    },
    autoReleaseTriggered: {
      type: Boolean,
      default: false,
    },
    releaseTxHash: {
      type: String,
    },
    refundTxHash: {
      type: String,
    },
    disputeReason: {
      type: String,
      trim: true,
    },
    disputeRaisedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    disputeRaisedAt: {
      type: Date,
    },
    disputeResolvedAt: {
      type: Date,
    },
    disputeResolution: {
      type: String,
      enum: ["release_to_finder", "refund_to_owner", "split"],
    },
    deadlineAt: {
      type: Date,
    },
    releasedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

EscrowCaseSchema.index({ itemId: 1, createdAt: -1 });
EscrowCaseSchema.index({ ownerId: 1, createdAt: -1 });
EscrowCaseSchema.index({ finderId: 1, createdAt: -1 });
EscrowCaseSchema.index({ state: 1, createdAt: -1 });

const EscrowCase: Model<IEscrowCase> =
  mongoose.models.EscrowCase ||
  mongoose.model<IEscrowCase>("EscrowCase", EscrowCaseSchema);

export default EscrowCase;
