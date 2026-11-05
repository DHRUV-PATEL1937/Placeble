import mongoose, { type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const userRoles = ["student", "tpo", "recruiter", "faculty", "platform_admin", "university_admin", "principal"] as const;
export type UserRole = typeof userRoles[number];

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String },
  role: { type: String, enum: userRoles, required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  universityId: { type: Schema.Types.ObjectId, ref: "University", default: null, index: true },
  // Switches a university TPO can flip for each institute TPO. Only applies to role "tpo"; all default to on.
  tpoPermissions: {
    roster: { type: Boolean, default: true },
    approvals: { type: Boolean, default: true },
    recruiters: { type: Boolean, default: true },
    settings: { type: Boolean, default: true },
    messaging: { type: Boolean, default: true },
  },
  recruiterOrgId: { type: Schema.Types.ObjectId, ref: "RecruiterOrganization", default: null, index: true },
  studentVerificationStatus: { type: String, enum: ["pending_tpo_approval", "approved", "rejected", "roster_matched", "pending_domain_approval"], default: null, index: true },
  authProvider: { type: String, enum: ["password", "google"], default: "password" },
  status: { type: String, enum: ["pending", "active", "suspended"], default: "active", index: true },
  emailVerified: { type: Boolean, default: false },
  // Students are created by their institute with a temporary password they must replace at first sign-in.
  mustChangePassword: { type: Boolean, default: false },
  // Set from the student's batch. After batchEndsAt: graduate notice + read-only; after the grace period: no sign-in.
  batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null, index: true },
  batchEndsAt: { type: Date, default: null },
  credentialsSentAt: { type: Date, default: null },
  firstLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date },
  lastLoginAt: { type: Date },
}, { timestamps: true });

userSchema.set("toJSON", {
  transform: (_document, returned) => {
    delete returned.passwordHash;
    return returned;
  },
});

type UserShape = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserShape>;
export const User = (models.User as Model<UserShape> | undefined) ?? model<UserShape>("User", userSchema);
