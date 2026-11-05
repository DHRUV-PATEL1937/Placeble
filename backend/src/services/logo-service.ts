import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { Institution } from "../models/Institution";
import { University } from "../models/University";
import { cloudinaryEnabled, destroyPublicImage, uploadPublicImage } from "./cloudinary-service";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 }, fileFilter: (_request, file, callback) => callback(null, TYPES.includes(file.mimetype)) });

/** Reads one picture from the "logo" field and explains problems in plain words. */
export const takeLogo = (request: Request, response: Response, next: NextFunction) => upload.single("logo")(request, response, error => {
  if (error) return response.status(400).json({ message: (error as { code?: string }).code === "LIMIT_FILE_SIZE" ? "That logo is over 1 MB. Choose a smaller one." : "Could not read that file." });
  if (request.method === "PUT" && !request.file) return response.status(400).json({ message: "Choose a PNG, JPG or WebP picture." });
  return next();
});

type Kind = "institution" | "university";
const modelFor = (kind: Kind) => (kind === "institution" ? Institution : University) as typeof Institution;

export async function saveLogo(kind: Kind, id: string, file: Express.Multer.File): Promise<{ status: number; message?: string; logoUrl?: string }> {
  if (!mongoose.isValidObjectId(id)) return { status: 404, message: "Not found." };
  if (!cloudinaryEnabled()) return { status: 503, message: "Logo uploads need Cloudinary to be set up on the server first." };
  const model = modelFor(kind);
  const record = await model.findById(id).select("logoPublicId");
  if (!record) return { status: 404, message: "Not found." };
  const stored = await uploadPublicImage(file.buffer, { folder: "placeble/logos", publicId: `${kind}-${id}-${Date.now()}` });
  const previous = record.logoPublicId;
  await model.updateOne({ _id: id }, { $set: { logoUrl: stored.url, logoPublicId: stored.publicId } });
  void destroyPublicImage(previous).catch(() => undefined);
  return { status: 200, logoUrl: stored.url };
}

export async function removeLogo(kind: Kind, id: string) {
  if (!mongoose.isValidObjectId(id)) return { status: 404 };
  const model = modelFor(kind);
  const record = await model.findById(id).select("logoPublicId");
  if (!record) return { status: 404 };
  await model.updateOne({ _id: id }, { $set: { logoUrl: "", logoPublicId: "" } });
  void destroyPublicImage(record.logoPublicId).catch(() => undefined);
  return { status: 200 };
}
