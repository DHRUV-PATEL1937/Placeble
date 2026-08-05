import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const recruiterProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  companyName: { type: String, required: true },
  institutionIds: [{ type: Schema.Types.ObjectId, ref: "Institution", required: true }],
  driveIds: [{ type: String }],
}, { timestamps: true });

type RecruiterProfileShape = InferSchemaType<typeof recruiterProfileSchema>;
export const RecruiterProfile = (models.RecruiterProfile as Model<RecruiterProfileShape> | undefined) ?? model<RecruiterProfileShape>("RecruiterProfile", recruiterProfileSchema);
