import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { Blog, blogTags } from "../models/Blog";
import { User } from "../models/User";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (_request, file, callback) => callback(null, IMAGE_TYPES.includes(file.mimetype)) });
const takeImage = (request: Request, response: Response, next: NextFunction) => upload.single("image")(request, response, error => {
  if (!error) return next();
  return response.status(400).json({ message: (error as { code?: string }).code === "LIMIT_FILE_SIZE" ? "That picture is over 2 MB. Choose a smaller one." : "Could not read that picture." });
});

export const present = (post: { _id: unknown; title: string; summary?: string | null; body: string; tag?: string | null; status?: string | null; publishedAt?: Date | null; authorName?: string | null; hasImage?: boolean | null; imageVersion?: number | null; updatedAt?: Date }) => ({
  id: String(post._id), title: post.title, summary: post.summary ?? "", body: post.body, tag: post.tag ?? "Update", status: post.status ?? "draft",
  publishedAt: post.publishedAt ?? null, updatedAt: post.updatedAt ?? null, authorName: post.authorName ?? "Placeble team",
  imagePath: post.hasImage ? `/blogs/${String(post._id)}/image?v=${post.imageVersion ?? 0}` : null,
});

/* ───────── Reading: any signed-in person ───────── */
export const blogRouter = Router();

// Pictures are loaded by <img>, which can't send a sign-in header. The id is unguessable and the content is made for sharing.
blogRouter.get("/:id/image", async (request, response) => {
  const id = String(request.params.id);
  if (!mongoose.isValidObjectId(id)) return response.status(404).end();
  const post = await Blog.findOne({ _id: id, status: "published", hasImage: true }).select("+image").lean();
  if (!post?.image?.data) return response.status(404).end();
  response.setHeader("Content-Type", post.image.contentType || "image/jpeg");
  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.send(Buffer.from(post.image.data.buffer ?? post.image.data));
});

blogRouter.get("/", requireAuth, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 6, 1), 30);
  const posts = await Blog.find({ status: "published" }).sort({ publishedAt: -1 }).limit(limit).lean();
  return response.json({ posts: posts.map(present) });
});

blogRouter.get("/:id", requireAuth, async (request, response) => {
  const id = String(request.params.id);
  if (!mongoose.isValidObjectId(id)) return response.status(404).json({ message: "That post doesn’t exist." });
  const post = await Blog.findOne({ _id: id, status: "published" }).lean();
  if (!post) return response.status(404).json({ message: "That post doesn’t exist or isn’t published." });
  return response.json({ post: present(post) });
});

/* ───────── Writing: platform admin ───────── */
export const blogAdminRouter = Router();
blogAdminRouter.use(requireAuth, requireRole("platform_admin"));

const fields = z.object({
  title: z.string().trim().min(3, "Give the post a title.").max(120),
  summary: z.string().trim().max(240).default(""),
  body: z.string().trim().min(10, "Write at least a sentence.").max(4000),
  tag: z.enum(blogTags).default("Update"),
  published: z.enum(["true", "false"]).default("false"),
  removeImage: z.enum(["true", "false"]).default("false"),
});

blogAdminRouter.get("/", async (_request, response) => {
  const posts = await Blog.find({}).sort({ createdAt: -1 }).limit(200).lean();
  return response.json({ posts: posts.map(present) });
});

blogAdminRouter.post("/", takeImage, async (request, response) => {
  const input = fields.parse(request.body);
  const author = await User.findById(request.auth!.userId).select("name").lean();
  const published = input.published === "true";
  const file = request.file;
  const post = await Blog.create({
    title: input.title, summary: input.summary, body: input.body, tag: input.tag,
    status: published ? "published" : "draft", publishedAt: published ? new Date() : null,
    authorId: request.auth!.userId, authorName: author?.name ?? "Placeble team",
    ...(file ? { hasImage: true, imageVersion: 1, image: { data: file.buffer, contentType: file.mimetype } } : {}),
  });
  return response.status(201).json({ post: present(post.toObject()) });
});

blogAdminRouter.patch("/:id", takeImage, async (request, response) => {
  const id = String(request.params.id);
  if (!mongoose.isValidObjectId(id)) return response.status(404).json({ message: "Post not found." });
  const input = fields.parse(request.body);
  const post = await Blog.findById(id).select("+image");
  if (!post) return response.status(404).json({ message: "Post not found." });
  const published = input.published === "true";
  post.title = input.title; post.summary = input.summary; post.body = input.body; post.tag = input.tag;
  if (published && post.status !== "published") post.publishedAt = new Date();
  post.status = published ? "published" : "draft";
  if (request.file) { post.hasImage = true; post.imageVersion = (post.imageVersion ?? 0) + 1; post.image = { data: request.file.buffer, contentType: request.file.mimetype }; }
  else if (input.removeImage === "true") { post.hasImage = false; post.imageVersion = (post.imageVersion ?? 0) + 1; post.image = undefined; }
  await post.save();
  return response.json({ post: present(post.toObject()) });
});

blogAdminRouter.delete("/:id", async (request, response) => {
  const id = String(request.params.id);
  if (!mongoose.isValidObjectId(id)) return response.status(404).json({ message: "Post not found." });
  await Blog.deleteOne({ _id: id });
  return response.status(204).end();
});
