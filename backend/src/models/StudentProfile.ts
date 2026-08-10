import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const studentProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  degree: { type: String, default: "" },
  graduationYear: { type: Number },
  skills: [{ type: String }],
  preferredRoles: [{ type: String }],
  profileVersion: { type: Number, min: 1, default: 1 },
  embedding: { type: [Number], default: [] },
  embeddingUpdatedAt: { type: Date },
  embeddingProfileVersion: { type: Number, min: 0, default: 0 },
  dismissedJobIds: [{ type: Schema.Types.ObjectId, ref: "Job" }],
  onboardingCompleted: { type: Boolean, default: false },
}, { timestamps: true });

type StudentProfileShape = InferSchemaType<typeof studentProfileSchema>;
export const StudentProfile = (models.StudentProfile as Model<StudentProfileShape> | undefined) ?? model<StudentProfileShape>("StudentProfile", studentProfileSchema);
