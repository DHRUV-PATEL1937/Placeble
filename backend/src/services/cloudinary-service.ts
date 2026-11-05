import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "../config/env";

const configured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
if (configured) cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

export type StoredCloudinaryFile = { publicId: string; version?: number; resourceType: string; format?: string; bytes?: number; secureUrl?: string };

export function cloudinaryEnabled() { return configured; }

export function uploadPrivateRaw(buffer: Buffer, options: { publicId: string; folder?: string; resourceType?: "raw" | "image" }) {
  if (!configured) throw new Error("Cloudinary storage is not configured on the backend.");
  return new Promise<StoredCloudinaryFile>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: options.resourceType || "raw", folder: options.folder || env.CLOUDINARY_FOLDER, public_id: options.publicId, type: "private", overwrite: true, use_filename: false, unique_filename: false }, (error, result) => {
      if (error || !result) return reject(error || new Error("Cloudinary did not return an upload result."));
      const uploaded = result as UploadApiResponse;
      resolve({ publicId: uploaded.public_id, version: uploaded.version, resourceType: uploaded.resource_type, format: uploaded.format, bytes: uploaded.bytes, secureUrl: uploaded.secure_url });
    });
    stream.end(buffer);
  });
}

export function privateDownloadUrl(file: StoredCloudinaryFile, downloadName: string) {
  if (!configured) throw new Error("Cloudinary storage is not configured on the backend.");
  const extension = file.format || downloadName.split(".").pop() || "bin";
  return cloudinary.utils.private_download_url(file.publicId, extension, { resource_type: file.resourceType || "raw", type: "private", attachment: true });
}

export async function destroyPrivateFile(file?: StoredCloudinaryFile | null) {
  if (!configured || !file?.publicId) return;
  await cloudinary.uploader.destroy(file.publicId, { resource_type: file.resourceType || "raw", type: "private", invalidate: true });
}

/** For pictures that are meant to be seen by anyone with the link, like college logos. */
export function uploadPublicImage(buffer: Buffer, options: { publicId: string; folder: string }) {
  if (!configured) throw new Error("Cloudinary storage is not configured on the backend.");
  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: "image", folder: options.folder, public_id: options.publicId, type: "upload", overwrite: true, invalidate: true,
      // Logos never need to be larger than this, so keep them light.
      transformation: [{ width: 512, height: 512, crop: "limit", quality: "auto", fetch_format: "auto" }],
    }, (error, result) => {
      if (error || !result) return reject(error || new Error("Cloudinary did not return an upload result."));
      resolve({ url: (result as UploadApiResponse).secure_url, publicId: (result as UploadApiResponse).public_id });
    });
    stream.end(buffer);
  });
}

export async function destroyPublicImage(publicId?: string | null) {
  if (!configured || !publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload", invalidate: true });
}
