import mongoose, { type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const userRoles = ["student", "tpo", "recruiter", "faculty"] as const;
export type UserRole = typeof userRoles[number];

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String },
  role: { type: String, enum: userRoles, required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  authProvider: { type: String, enum: ["password", "google"], default: "password" },
  status: { type: String, enum: ["pending", "active", "suspended"], default: "active", index: true },
  emailVerified: { type: Boolean, default: false },
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
