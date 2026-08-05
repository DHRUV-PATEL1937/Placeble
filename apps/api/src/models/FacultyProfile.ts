import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const facultyProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  department: { type: String, default: "" },
  cohortLabels: [{ type: String }],
}, { timestamps: true });

type FacultyProfileShape = InferSchemaType<typeof facultyProfileSchema>;
export const FacultyProfile = (models.FacultyProfile as Model<FacultyProfileShape> | undefined) ?? model<FacultyProfileShape>("FacultyProfile", facultyProfileSchema);
