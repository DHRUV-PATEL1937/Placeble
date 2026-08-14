import { Router } from "express";
import multer from "multer";
import { readSheet } from "read-excel-file/node";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import { Institution } from "../models/Institution";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { RosterUploadBatch } from "../models/RosterUploadBatch";
import { User } from "../models/User";
import { Drive } from "../models/Drive";
import { DriveAccessGrant } from "../models/DriveAccessGrant";
import { StudentProfile } from "../models/StudentProfile";
import { MarketplaceRequest } from "../models/MarketplaceRequest";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, /\.(xlsx|csv)$/i.test(file.originalname)) });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

async function spreadsheetRows(file: Express.Multer.File) {
  if (/\.csv$/i.test(file.originalname)) return parseCsv(file.buffer.toString("utf8"));
  const rows = await readSheet(file.buffer);
  return rows.map(row => row.map(value => String(value ?? "")));
}

router.get("/roster", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
  const filter = { institutionId: request.institutionScope, ...(search ? { $or: [{ email: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { fullName: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { rollNumber: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }] } : {}) };
  const [entries, total, matched] = await Promise.all([StudentRosterEntry.find(filter).sort({ uploadedAt: -1 }).limit(500).lean(), StudentRosterEntry.countDocuments({ institutionId: request.institutionScope }), StudentRosterEntry.countDocuments({ institutionId: request.institutionScope, status: "matched" })]);
  return response.json({ entries, summary: { total, matched, unmatched: total - matched } });
});

router.post("/roster/upload", requireAuth, requireRole("tpo"), requireInstitutionScope, upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ message: "Choose a .xlsx or .csv roster file." });
  const rows = await spreadsheetRows(request.file);
  if (rows.length < 2) return response.status(400).json({ message: "The roster must include a header and at least one student row." });
  const headers = rows[0].map(value => value.trim().toLowerCase().replace(/\s+/g, ""));
  const indexOf = (name: string) => headers.indexOf(name.toLowerCase());
  const required = ["email", "fullname"];
  if (required.some(name => indexOf(name) < 0)) return response.status(400).json({ message: "Required columns: email and fullName. Optional: rollNumber, branch, batchYear." });
  const institution = await Institution.findById(request.institutionScope).select("approvedEmailDomains officialDomains").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  const domains = new Set([...(institution.approvedEmailDomains ?? []), ...(institution.officialDomains ?? [])].map(String));
  const batch = await RosterUploadBatch.create({ institutionId: request.institutionScope, uploadedByTpoId: request.auth!.userId, fileName: request.file.originalname, totalRows: rows.length - 1, errorRows: [] });
  const errors: Array<{ row: number; reason: string }> = []; const seen = new Set<string>(); let created = 0; let updated = 0; let skipped = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const source = rows[index]; const rowNumber = index + 1; const email = (source[indexOf("email")] ?? "").trim().toLowerCase(); const fullName = (source[indexOf("fullname")] ?? "").trim();
    if (!emailPattern.test(email)) { errors.push({ row: rowNumber, reason: "Email is missing or invalid." }); continue; }
    if (!fullName) { errors.push({ row: rowNumber, reason: "fullName is required." }); continue; }
    if (!domains.has(email.split("@")[1])) { errors.push({ row: rowNumber, reason: `Email domain @${email.split("@")[1]} is not approved for this institution.` }); continue; }
    if (seen.has(email)) { errors.push({ row: rowNumber, reason: "Duplicate email within this upload." }); continue; } seen.add(email);
    const values = { fullName, rollNumber: indexOf("rollnumber") >= 0 ? (source[indexOf("rollnumber")] ?? "").trim() : "", branch: indexOf("branch") >= 0 ? (source[indexOf("branch")] ?? "").trim() : "", batchYear: indexOf("batchyear") >= 0 && source[indexOf("batchyear")] ? Number(source[indexOf("batchyear")]) : null };
    if (values.batchYear !== null && (!Number.isInteger(values.batchYear) || values.batchYear < 2000 || values.batchYear > 2100)) { errors.push({ row: rowNumber, reason: "batchYear must be a valid four-digit year." }); continue; }
    const existing = await StudentRosterEntry.findOne({ institutionId: request.institutionScope, email });
    if (existing) {
      if (existing.fullName === values.fullName && existing.rollNumber === values.rollNumber && existing.branch === values.branch && existing.batchYear === values.batchYear) { skipped += 1; continue; }
      Object.assign(existing, values, { uploadBatchId: batch._id, uploadedAt: new Date() }); await existing.save(); updated += 1;
    } else { await StudentRosterEntry.create({ institutionId: request.institutionScope, email, ...values, uploadBatchId: batch._id }); created += 1; }
  }
  Object.assign(batch, { successfulRows: created, updatedRows: updated, skippedRows: skipped, errorRows: errors }); await batch.save();
  return response.status(201).json({ batch, summary: { created, updated, skipped, failed: errors.length, total: rows.length - 1 }, errorRows: errors });
});

router.get("/pending-students", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const students = await User.find({ institutionId: request.institutionScope, role: "student", studentVerificationStatus: "pending_tpo_approval", status: "pending" }).select("name email createdAt").sort({ createdAt: 1 }).lean();
  const rosterEntries = await StudentRosterEntry.find({ institutionId: request.institutionScope, matchedUserId: { $in: students.map(student => student._id) } }).select("matchedUserId rollNumber branch batchYear").lean();
  const rosterByUser = new Map(rosterEntries.map(entry => [String(entry.matchedUserId), entry]));
  return response.json({ students: students.map(student => ({ ...student, roster: rosterByUser.get(String(student._id)) ?? null })) });
});

router.patch("/pending-students/:studentId", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({ action: z.enum(["approve", "reject"]) }).parse(request.body);
  const student = await User.findOne({ _id: request.params.studentId, institutionId: request.institutionScope, role: "student", studentVerificationStatus: "pending_tpo_approval", status: "pending" });
  if (!student) return response.status(404).json({ message: "Pending student not found in your institution." });
  if (input.action === "approve") {
    student.studentVerificationStatus = "approved"; student.status = "active";
    const rosterEntry = await StudentRosterEntry.findOne({ institutionId: request.institutionScope, matchedUserId: student._id }).select("branch batchYear").lean();
    await StudentProfile.findOneAndUpdate({ userId: student._id }, { $set: { institutionId: request.institutionScope, onboardingCompleted: true, ...(rosterEntry?.branch ? { degree: rosterEntry.branch } : {}), ...(rosterEntry?.batchYear ? { graduationYear: rosterEntry.batchYear } : {}) } }, { upsert: true, setDefaultsOnInsert: true });
  }
  else { student.studentVerificationStatus = "rejected"; student.status = "suspended"; }
  await student.save(); return response.json({ student: { id: student._id, name: student.name, email: student.email, status: student.status, studentVerificationStatus: student.studentVerificationStatus } });
});

router.get("/marketplace/settings", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const institution = await Institution.findById(request.institutionScope).select("name marketplaceListing").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  return response.json({ institution });
});

router.patch("/marketplace/settings", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({ isListed: z.boolean(), headline: z.string().trim().max(240).default(""), studentCountBand: z.enum(["", "Under 250", "250-500", "500-1000", "1000-2500", "2500+"]).default(""), topBranches: z.array(z.string().trim().min(1).max(60)).max(8).default([]) }).parse(request.body);
  const institution = await Institution.findByIdAndUpdate(request.institutionScope, { $set: {
    "marketplaceListing.isListed": input.isListed,
    "marketplaceListing.listedAt": input.isListed ? new Date() : null,
    "marketplaceListing.headline": input.headline,
    "marketplaceListing.studentCountBand": input.studentCountBand,
    "marketplaceListing.topBranches": [...new Set(input.topBranches.map(item => item.trim()).filter(Boolean))],
  } }, { new: true }).select("name marketplaceListing");
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  return response.json({ institution });
});

router.get("/marketplace/requests", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const requests = await MarketplaceRequest.find({ institutionId: request.institutionScope }).populate("recruiterOrgId", "companyName companyDomain verificationStatus suspendedAt").sort({ createdAt: -1 }).lean();
  return response.json({ requests });
});

router.get("/marketplace/drives", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const drives = await Drive.find({ institutionId: request.institutionScope, status: { $in: ["draft", "published"] } }).select("title companyName status startsAt").sort({ startsAt: 1, createdAt: -1 }).lean();
  return response.json({ drives });
});

router.patch("/marketplace/requests/:requestId", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({ action: z.enum(["approve", "reject", "upgrade"]), grantedAccessLevel: z.enum(["aggregate_stats", "candidate_access"]).optional() }).parse(request.body);
  const marketplaceRequest = await MarketplaceRequest.findOne({ _id: request.params.requestId, institutionId: request.institutionScope, ...(input.action === "upgrade" ? { status: "approved", grantedAccessLevel: "aggregate_stats", requestedAccessLevel: "candidate_access" } : { status: "pending" }) });
  if (!marketplaceRequest) return response.status(404).json({ message: input.action === "upgrade" ? "This relationship is not eligible for a candidate-access upgrade." : "Pending marketplace request not found in your institution." });
  if (input.action === "upgrade") {
    marketplaceRequest.grantedAccessLevel = "candidate_access";
  } else if (input.action === "approve") {
    const granted = input.grantedAccessLevel ?? marketplaceRequest.requestedAccessLevel;
    if (marketplaceRequest.requestedAccessLevel === "aggregate_stats" && granted === "candidate_access") return response.status(400).json({ message: "Approval cannot exceed the access level the recruiter requested." });
    marketplaceRequest.status = "approved"; marketplaceRequest.grantedAccessLevel = granted;
  } else { marketplaceRequest.status = "rejected"; marketplaceRequest.grantedAccessLevel = null; }
  marketplaceRequest.respondingTpoId = new Types.ObjectId(request.auth!.userId); marketplaceRequest.decidedAt = new Date();
  await marketplaceRequest.save();
  return response.json({ request: marketplaceRequest });
});

router.post("/marketplace/requests/:requestId/drives/:driveId/grant", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const marketplaceRequest = await MarketplaceRequest.findOne({ _id: request.params.requestId, institutionId: request.institutionScope, status: "approved", grantedAccessLevel: "candidate_access" }).lean();
  if (!marketplaceRequest) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "Approve candidate access for this organization before granting a drive." });
  const drive = await Drive.findOne({ _id: request.params.driveId, institutionId: request.institutionScope, status: { $in: ["published", "draft"] } }).lean();
  if (!drive) return response.status(404).json({ message: "Drive not found in your institution." });
  const grant = await DriveAccessGrant.findOneAndUpdate({ recruiterOrgId: marketplaceRequest.recruiterOrgId, driveId: drive._id }, { $set: { institutionId: request.institutionScope, status: "approved", accessLevel: "candidate_access", requestedAccessLevel: "candidate_access", relationshipSource: "marketplace", grantedByTpoId: request.auth!.userId, requestedAt: new Date(), decidedAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return response.status(201).json({ grant });
});

router.get("/drive-access", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const requests = await DriveAccessGrant.find({ institutionId: request.institutionScope }).populate("recruiterOrgId", "companyName companyDomain verificationStatus").populate("driveId", "title companyName startsAt").sort({ requestedAt: -1 }).lean();
  return response.json({ requests });
});

router.patch("/drive-access/:grantId", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({ action: z.enum(["approve", "reject", "revoke"]) }).parse(request.body);
  const grant = await DriveAccessGrant.findOneAndUpdate({ _id: request.params.grantId, institutionId: request.institutionScope }, { $set: { status: input.action === "approve" ? "approved" : "revoked", grantedByTpoId: request.auth!.userId, decidedAt: new Date() } }, { new: true });
  if (!grant) return response.status(404).json({ message: "Drive access request not found in your institution." });
  return response.json({ grant });
});

router.get("/recruiter/drives", requireAuth, requireRole("recruiter"), async (request, response) => {
  const [relationships, grants] = await Promise.all([
    MarketplaceRequest.find({ recruiterOrgId: request.auth!.recruiterOrgId, status: "approved", grantedAccessLevel: "candidate_access" }).select("institutionId").lean(),
    DriveAccessGrant.find({ recruiterOrgId: request.auth!.recruiterOrgId }).lean(),
  ]);
  const allowedInstitutionIds = [...new Set([...relationships.map(item => item.institutionId.toString()), ...grants.filter(item => item.relationshipSource !== "marketplace").map(item => item.institutionId.toString())])];
  const drives = await Drive.find({ status: "published", institutionId: { $in: allowedInstitutionIds } }).populate({ path: "institutionId", match: { status: "active" }, select: "name" }).sort({ startsAt: 1 }).lean();
  const statusByDrive = new Map(grants.map(grant => [grant.driveId.toString(), grant.status]));
  return response.json({ drives: drives.filter(drive => drive.institutionId).map(drive => ({ ...drive, accessStatus: statusByDrive.get(drive._id.toString()) ?? "available" })) });
});

router.post("/recruiter/drives/:driveId/request", requireAuth, requireRole("recruiter"), async (request, response) => {
  const driveId = Array.isArray(request.params.driveId) ? request.params.driveId[0] : request.params.driveId;
  if (!Types.ObjectId.isValid(driveId)) return response.status(400).json({ message: "Drive ID is invalid." });
  const drive = await Drive.findOne({ _id: driveId, status: "published" }).lean();
  if (!drive) return response.status(404).json({ message: "Drive not found." });
  const relationship = await MarketplaceRequest.findOne({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId: drive.institutionId, status: "approved", grantedAccessLevel: "candidate_access" }).lean();
  if (!relationship) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "The institution must approve candidate access before a drive request can be made." });
  const grant = await DriveAccessGrant.findOneAndUpdate({ recruiterOrgId: request.auth!.recruiterOrgId, driveId: drive._id }, { $set: { institutionId: drive.institutionId, status: "requested", accessLevel: "candidate_access", requestedAccessLevel: "candidate_access", relationshipSource: "marketplace", requestedAt: new Date(), decidedAt: null, grantedByTpoId: null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return response.status(201).json({ grant });
});

export { router as tenancyRouter };
