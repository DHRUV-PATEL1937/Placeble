import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const recruiterShortlistSchema = new Schema({
  recruiterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  candidateId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
}, { timestamps: true });

recruiterShortlistSchema.index({ recruiterId: 1, candidateId: 1 }, { unique: true });

type RecruiterShortlistShape = InferSchemaType<typeof recruiterShortlistSchema>;
export const RecruiterShortlist = (models.RecruiterShortlist as Model<RecruiterShortlistShape> | undefined) ?? model<RecruiterShortlistShape>("RecruiterShortlist", recruiterShortlistSchema);
