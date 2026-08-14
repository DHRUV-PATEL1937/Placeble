import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const driveSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  title: { type: String, required: true, trim: true },
  companyName: { type: String, required: true, trim: true },
  status: { type: String, enum: ["draft", "published", "closed"], default: "published", index: true },
  startsAt: { type: Date, default: null },
}, { timestamps: true });

driveSchema.index({ institutionId: 1, title: 1, companyName: 1 }, { unique: true });
type DriveShape = InferSchemaType<typeof driveSchema>;
export const Drive = (models.Drive as Model<DriveShape> | undefined) ?? model<DriveShape>("Drive", driveSchema);
