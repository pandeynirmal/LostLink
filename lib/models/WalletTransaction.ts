import mongoose, { Document, Model, Schema } from "mongoose";

export interface IWalletTransaction extends Document {
  fromUserId: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  itemId?: mongoose.Types.ObjectId;
  contactRequestId?: mongoose.Types.ObjectId;
  paymentMethod: "onchain" | "razorpay" | "metamask" | "offchain";
  fromAddress: string;
  toAddress: string;
  amountEth: number;
  txHash: string;
  anchorTxHash?: string;
  settlementProofTxHash?: string;
  network?: string;
  externalPaymentId?: string;
  status: "completed" | "failed";
  createdAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>({
  fromUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  toUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemId: {
    type: Schema.Types.ObjectId,
    ref: "Item",
  },
  contactRequestId: {
    type: Schema.Types.ObjectId,
    ref: "ContactRequest",
  },
  paymentMethod: {
    type: String,
    enum: ["onchain", "razorpay", "metamask", "offchain"],
    required: true,
    default: "onchain",
  },
  fromAddress: {
    type: String,
    required: true,
  },
  toAddress: {
    type: String,
    required: true,
  },
  amountEth: {
    type: Number,
    required: true,
  },
  txHash: {
    type: String,
    required: true,
    index: true,
  },
  anchorTxHash: {
    type: String,
    index: true,
  },
  settlementProofTxHash: {
    type: String,
    index: true,
  },
  network: {
    type: String,
  },
  externalPaymentId: {
    type: String,
  },
  status: {
    type: String,
    enum: ["completed", "failed"],
    default: "completed",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

WalletTransactionSchema.index({ fromUserId: 1, createdAt: -1 });
WalletTransactionSchema.index({ toUserId: 1, createdAt: -1 });

const WalletTransaction: Model<IWalletTransaction> =
  mongoose.models.WalletTransaction ||
  mongoose.model<IWalletTransaction>("WalletTransaction", WalletTransactionSchema);

export default WalletTransaction;
