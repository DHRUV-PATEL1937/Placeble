import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const messageSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  senderRole: { type: String, enum: ["student", "tpo"], required: true },
  body: { type: String, required: true, maxlength: 2000 },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ institutionId: 1, studentId: 1, _id: -1 });
messageSchema.index({ institutionId: 1, senderRole: 1, readAt: 1 });

type MessageShape = InferSchemaType<typeof messageSchema>;
export const InstitutionMessage = (models.InstitutionMessage as Model<MessageShape> | undefined) ?? model<MessageShape>("InstitutionMessage", messageSchema);

