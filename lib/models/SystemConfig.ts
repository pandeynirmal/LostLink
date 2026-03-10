import mongoose, { Document, Model, Schema } from "mongoose";

export interface ISystemConfig extends Document {
  key: string;
  valueNumber?: number;
  valueText?: string;
  updatedAt: Date;
  createdAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    valueNumber: {
      type: Number,
    },
    valueText: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const SystemConfig: Model<ISystemConfig> =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>("SystemConfig", SystemConfigSchema);

export default SystemConfig;
