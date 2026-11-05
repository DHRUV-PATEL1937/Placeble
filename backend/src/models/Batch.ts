import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/**
 * A batch is one intake of a branch, e.g. MCA 2025–2027 (June 2025 to May 2027).
 * Students belong to a batch; when it ends they get a graduate notice, then lose access after a grace period.
 */
const batchSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
  startYear: { type: Number, required: true, min: 2000, max: 2100 },
  startMonth: { type: Number, required: true, min: 1, max: 12 },
  endYear: { type: Number, required: true, min: 2000, max: 2100 },
  endMonth: { type: Number, required: true, min: 1, max: 12 },
  /** End of the last day of the end month. Login stops this + the grace period. Recomputed whenever the TPO changes the dates. */
  endsAt: { type: Date, required: true, index: true },
}, { timestamps: true });

batchSchema.index({ institutionId: 1, branchId: 1, startYear: 1, startMonth: 1, endYear: 1, endMonth: 1 }, { unique: true });

export type BatchDocument = InferSchemaType<typeof batchSchema>;
export const Batch = (models.Batch as Model<BatchDocument> | undefined) ?? model<BatchDocument>("Batch", batchSchema);

/** Days after a batch ends during which a graduate can still sign in (read-only) to save their resume and reports. */
export const GRACE_DAYS = 30;

/** Last millisecond of the given month (month is 1-12). */
export const endOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 1) - 1);

export type BatchState = "upcoming" | "active" | "graduated" | "closed";
export function batchState(batch: { startYear: number; startMonth: number; endsAt: Date }, now = new Date()): BatchState {
  if (now.getTime() < Date.UTC(batch.startYear, batch.startMonth - 1, 1)) return "upcoming";
  if (now.getTime() <= batch.endsAt.getTime()) return "active";
  return now.getTime() <= batch.endsAt.getTime() + GRACE_DAYS * 86_400_000 ? "graduated" : "closed";
}
/** open = studying, graduate = batch over but still in the grace period (read-only), closed = access has ended. */
export function studentAccess(batchEndsAt: Date | null | undefined, now = new Date()): "open" | "graduate" | "closed" {
  if (!batchEndsAt) return "open";
  if (now.getTime() <= batchEndsAt.getTime()) return "open";
  return now.getTime() <= batchEndsAt.getTime() + GRACE_DAYS * 86_400_000 ? "graduate" : "closed";
}
export const closesAt = (batchEndsAt: Date) => new Date(batchEndsAt.getTime() + GRACE_DAYS * 86_400_000);

export const monthName = (month: number) => new Date(2000, month - 1, 1).toLocaleString("en", { month: "short" });
export const batchLabel = (batch: { startYear: number; endYear: number }) => `${batch.startYear}–${batch.endYear}`;
export const batchPeriod = (batch: { startYear: number; startMonth: number; endYear: number; endMonth: number }) => `${monthName(batch.startMonth)} ${batch.startYear} – ${monthName(batch.endMonth)} ${batch.endYear}`;
