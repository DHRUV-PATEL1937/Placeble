import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const submissionStatuses = ["accepted", "wrong_answer", "runtime_error", "time_limit_exceeded"] as const;
export type SubmissionStatus = typeof submissionStatuses[number];

const testResultSchema = new Schema({
  caseIndex: { type: Number, required: true },
  passed: { type: Boolean, required: true },
  input: { type: String, default: "" },
  expectedOutput: { type: String, default: "" },
  actualOutput: { type: String, default: "" },
  status: { type: String, default: "" },
  error: { type: String, default: "" },
  executionTimeMs: { type: Number, default: 0 },
}, { _id: false });

const codingSubmissionSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  questionId: { type: Schema.Types.ObjectId, ref: "AptitudeQuestion", required: true, index: true },
  language: { type: String, required: true },
  code: { type: String, required: true, maxlength: 60000 },
  status: { type: String, enum: submissionStatuses, required: true, index: true },
  passedTestCases: { type: Number, required: true, min: 0 },
  totalTestCases: { type: Number, required: true, min: 0 },
  runtimeMs: { type: Number, default: 0 },
  results: { type: [testResultSchema], default: [] },
}, { timestamps: true });

codingSubmissionSchema.index({ studentId: 1, questionId: 1, status: 1 });
codingSubmissionSchema.index({ studentId: 1, createdAt: -1 });

type CodingSubmissionShape = InferSchemaType<typeof codingSubmissionSchema>;
export const CodingSubmission = (models.CodingSubmission as Model<CodingSubmissionShape> | undefined) ?? model<CodingSubmissionShape>("CodingSubmission", codingSubmissionSchema);
