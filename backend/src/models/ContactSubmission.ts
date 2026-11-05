import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

// Messages sent from the public marketing site (placeble.in/contact and the "Book a demo" variant).
const contactSubmissionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: "", trim: true },
  organisation: { type: String, required: true, trim: true },
  role: { type: String, enum: ["Student", "TPO", "Principal", "University", "Recruiter", "Other"], required: true },
  message: { type: String, required: true, trim: true },
  topic: { type: String, enum: ["general", "demo"], default: "general", index: true },
  consentAt: { type: Date, required: true },
  status: { type: String, enum: ["new", "replied", "closed"], default: "new", index: true },
  // A one-way hash, so repeat senders can be spotted without keeping the raw address.
  ipHash: { type: String, default: "" },
  userAgent: { type: String, default: "" },
}, { timestamps: true });

type ContactSubmissionShape = InferSchemaType<typeof contactSubmissionSchema>;
export const ContactSubmission = (models.ContactSubmission as Model<ContactSubmissionShape> | undefined) ?? model<ContactSubmissionShape>("ContactSubmission", contactSubmissionSchema);
