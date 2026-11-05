import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/**
 * A programme (branch) students and institutes can choose, e.g. MCA or MBA. Managed by the superadmin.
 * Programmes are never deleted, only made inactive, so branches and students already using one keep working.
 */
const programSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  durationYears: { type: Number, required: true, min: 1, max: 8 },
  interviewStyle: { type: String, enum: ["technical", "business", "mixed"], default: "mixed" },
  /** Suggested target roles shown during setup. Students can still add their own. */
  roles: [{ type: String, trim: true, maxlength: 80 }],
  /** Whether students of this programme get the Coding practice tool. */
  coding: { type: Boolean, default: false },
  active: { type: Boolean, default: true, index: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

export type ProgramDocument = InferSchemaType<typeof programSchema>;
export const ProgramModel = (models.Program as Model<ProgramDocument> | undefined) ?? model<ProgramDocument>("Program", programSchema);
