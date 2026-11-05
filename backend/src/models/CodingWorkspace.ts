import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;
const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  questionId: { type: Schema.Types.ObjectId, ref: 'AptitudeQuestion', required: true },
  language: { type: String, required: true },
  codePerLanguage: { type: Map, of: String, default: {} },
}, { timestamps: true });
schema.index({ studentId: 1, questionId: 1 }, { unique: true });
type Shape = InferSchemaType<typeof schema>;
export const CodingWorkspace = (models.CodingWorkspace as Model<Shape> | undefined) ?? model<Shape>('CodingWorkspace', schema);
