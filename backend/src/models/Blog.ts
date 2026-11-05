import { Schema, model, type InferSchemaType } from "mongoose";

export const blogTags = ["Update", "Tip", "Announcement", "Story", "Event"] as const;

const blogSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  summary: { type: String, default: "", trim: true, maxlength: 240 },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  tag: { type: String, enum: blogTags, default: "Update" },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  publishedAt: { type: Date, default: null, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, default: "Placeble team" },
  // The picture lives in the database so posts work without any file storage set up.
  hasImage: { type: Boolean, default: false },
  imageVersion: { type: Number, default: 0 },
  image: { type: { data: Buffer, contentType: String }, select: false, default: undefined },
}, { timestamps: true, versionKey: false });

export type BlogDocument = InferSchemaType<typeof blogSchema>;
export const Blog = model("Blog", blogSchema);
