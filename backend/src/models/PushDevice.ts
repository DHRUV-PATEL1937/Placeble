import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const pushDeviceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  token: { type: String, required: true, unique: true, maxlength: 200 },
  platform: { type: String, enum: ["android", "ios"], default: "android" },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });
type PushDeviceShape = InferSchemaType<typeof pushDeviceSchema>;
export const PushDevice = (models.PushDevice as Model<PushDeviceShape> | undefined) ?? model<PushDeviceShape>("PushDevice", pushDeviceSchema);
