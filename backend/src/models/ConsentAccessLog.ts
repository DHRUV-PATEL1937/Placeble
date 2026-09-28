import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const consentAccessLogSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorRole: { type: String, required: true },
  action: { type: String, enum: ["profile_viewed", "resume_viewed", "candidate_shortlisted", "drive_access_granted"], required: true, index: true },
  purpose: { type: String, required: true, maxlength: 240 },
  driveId: { type: Schema.Types.ObjectId, ref: "Drive", default: null, index: true },
}, { timestamps: true });
consentAccessLogSchema.index({ studentId: 1, createdAt: -1 });
type ConsentAccessLogShape = InferSchemaType<typeof consentAccessLogSchema>;
export const ConsentAccessLog = (models.ConsentAccessLog as Model<ConsentAccessLogShape> | undefined) ?? model<ConsentAccessLogShape>("ConsentAccessLog", consentAccessLogSchema);
