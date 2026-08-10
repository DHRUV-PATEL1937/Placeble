import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type InterviewRecording = { buffer: Buffer; mimetype: string; originalname: string };

export function interviewUploadDirectory() {
  return basename(process.cwd()).toLowerCase() === "backend"
    ? resolve(process.cwd(), "uploads", "interviews")
    : resolve(process.cwd(), "backend", "uploads", "interviews");
}

function extensionFor(recording: InterviewRecording) {
  const supplied = extname(recording.originalname).toLowerCase();
  if (/^\.(webm|mp4|m4a|mp3|wav|ogg)$/.test(supplied)) return supplied;
  if (recording.mimetype.includes("mp4")) return ".mp4";
  if (recording.mimetype.includes("wav")) return ".wav";
  if (recording.mimetype.includes("ogg")) return ".ogg";
  return ".webm";
}

export async function storeInterviewRecording(recording: InterviewRecording, studentId: string) {
  const directory = resolve(interviewUploadDirectory(), studentId);
  await mkdir(directory, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}${extensionFor(recording)}`;
  await writeFile(resolve(directory, filename), recording.buffer);
  return `/uploads/interviews/${studentId}/${filename}`;
}
