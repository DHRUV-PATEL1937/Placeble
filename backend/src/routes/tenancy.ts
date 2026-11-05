import { exclusiveDomains } from "../services/validation";
import { Router } from "express";
import mongoose from "mongoose";
import { removeLogo, saveLogo, takeLogo } from "../services/logo-service";
import { appLink, emailAudience, emailConfigured, queueEmail } from "../services/email-service";
import multer from "multer";
import { readSheet } from "read-excel-file/node";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAuth, requireInstitutionScope, requireRole, requireTpoPermission } from "../middleware/auth";
import { loadPlacementIndex, applyPlacement } from "../services/placement-service";
import { inviteInBackground, inviteRosterStudent, syncStudentFromEntry } from "../services/student-account-service";
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
  const [entries, total, matched, institution] = await Promise.all([StudentRosterEntry.find(filter).sort({ uploadedAt: -1 }).limit(500).lean(), StudentRosterEntry.countDocuments({ institutionId: request.institutionScope }), StudentRosterEntry.countDocuments({ institutionId: request.institutionScope, status: "matched" }), Institution.findById(request.institutionScope).select("name approvedEmailDomains officialDomains").lean()]);
  const approvedEmailDomains = [...new Set([...(institution?.approvedEmailDomains ?? []), ...(institution?.officialDomains ?? [])].map(String))];
  const accounts = await User.find({ _id: { $in: entries.map(entry => entry.matchedUserId).filter(Boolean) } }).select("firstLoginAt lastLoginAt credentialsSentAt").lean();
  const byUser = new Map(accounts.map(account => [String(account._id), account]));
  const loginStatus = (entry: (typeof entries)[number]) => {
    const account = entry.matchedUserId ? byUser.get(String(entry.matchedUserId)) : null;
    if (!account) return { loginStatus: "not_invited" as const, firstLoginAt: null, lastLoginAt: null, invitedAt: null };
    const first = account.firstLoginAt ?? account.lastLoginAt ?? null;
    return { loginStatus: first ? "active" as const : "invited" as const, firstLoginAt: first, lastLoginAt: account.lastLoginAt ?? null, invitedAt: account.credentialsSentAt ?? null };
  };
  const [loggedIn, studentsTotal] = await Promise.all([
    User.countDocuments({ institutionId: request.institutionScope, role: "student", $or: [{ firstLoginAt: { $ne: null } }, { lastLoginAt: { $ne: null } }] }),
    User.countDocuments({ institutionId: request.institutionScope, role: "student" }),
  ]);
  return response.json({ entries: entries.map(entry => ({ ...entry, ...loginStatus(entry) })), summary: { total, matched, unmatched: total - matched, invited: Math.max(0, studentsTotal - loggedIn), active: loggedIn, notInvited: total - matched }, institution: institution ? { name: institution.name, approvedEmailDomains } : null, emailConfigured: emailConfigured() });
});

router.get("/settings", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const institution = await Institution.findById(request.institutionScope).select("name approvedEmailDomains officialDomains logoUrl").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  const approvedEmailDomains = [...new Set([...(institution.approvedEmailDomains ?? []), ...(institution.officialDomains ?? [])].map(String))];
  return response.json({ institution: { name: institution.name, approvedEmailDomains, logoUrl: institution.logoUrl ?? "" } });
});

router.put("/settings/logo", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("settings"), takeLogo, async (request, response) => {
  const result = await saveLogo("institution", request.institutionScope!, request.file!);
  return response.status(result.status).json(result.status === 200 ? { logoUrl: result.logoUrl } : { message: result.message });
});
router.delete("/settings/logo", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("settings"), async (request, response) => response.status((await removeLogo("institution", request.institutionScope!)).status === 200 ? 204 : 404).end());

router.patch("/settings/domains", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("settings"), async (request, response) => {
  const input = z.object({ approvedEmailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1).max(12) }).parse(request.body);
  const domains = [...new Set(input.approvedEmailDomains)];
  const owned = exclusiveDomains(domains);
  const domainOwner = owned.length ? await Institution.findOne({ _id: { $ne: request.institutionScope }, $or: [{ approvedEmailDomains: { $in: owned } }, { officialDomains: { $in: owned } }] }).select("name").lean() : null;
  if (domainOwner) return response.status(409).json({ code: "DOMAIN_ALREADY_ASSIGNED", message: `One of these domains is already assigned to ${domainOwner.name}.` });
  const rosterEmails = await StudentRosterEntry.distinct("email", { institutionId: request.institutionScope });
  const usedDomains = [...new Set(rosterEmails.map(email => String(email).split("@")[1]).filter(Boolean))];
  const removedInUse = usedDomains.filter(domain => !domains.includes(domain));
  if (removedInUse.length) return response.status(409).json({ code: "DOMAIN_IN_USE", message: `Cannot remove ${removedInUse.map(domain => `@${domain}`).join(", ")} while roster entries still use it.` });
  const institution = await Institution.findByIdAndUpdate(request.institutionScope, { $set: { approvedEmailDomains: domains, officialDomains: domains } }, { returnDocument: "after" }).select("name approvedEmailDomains").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  return response.json({ institution });
});

router.post("/roster/upload", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("roster"), upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ message: "Choose a .xlsx or .csv roster file." });
  const rows = await spreadsheetRows(request.file);
  if (rows.length < 2) return response.status(400).json({ message: "The roster must include a header and at least one student row." });
  const headers = rows[0].map(value => value.trim().toLowerCase().replace(/\s+/g, ""));
  const indexOf = (name: string) => headers.indexOf(name.toLowerCase());
  const required = ["email", "fullname", "branch"];
  if (required.some(name => indexOf(name) < 0)) return response.status(400).json({ message: "Required columns: email, fullName, branch and batch. Optional: rollNumber." });
  const institution = await Institution.findById(request.institutionScope).select("approvedEmailDomains officialDomains").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  const domains = new Set([...(institution.approvedEmailDomains ?? []), ...(institution.officialDomains ?? [])].map(String));
  const batch = await RosterUploadBatch.create({ institutionId: request.institutionScope, uploadedByTpoId: request.auth!.userId, fileName: request.file.originalname, totalRows: rows.length - 1, errorRows: [] });
  const placement = await loadPlacementIndex(request.institutionScope!);
  const errors: Array<{ row: number; reason: string }> = []; const seen = new Set<string>(); let created = 0; let updated = 0; let skipped = 0; const createdIds: Array<string> = [];
  for (let index = 1; index < rows.length; index += 1) {
    const source = rows[index]; const rowNumber = index + 1; const email = (source[indexOf("email")] ?? "").trim().toLowerCase(); const fullName = (source[indexOf("fullname")] ?? "").trim();
    if (!emailPattern.test(email)) { errors.push({ row: rowNumber, reason: "Email is missing or invalid." }); continue; }
    if (!fullName) { errors.push({ row: rowNumber, reason: "fullName is required." }); continue; }
    if (!domains.has(email.split("@")[1])) { errors.push({ row: rowNumber, reason: `Email domain @${email.split("@")[1]} is not approved for this institution.` }); continue; }
    if (seen.has(email)) { errors.push({ row: rowNumber, reason: "Duplicate email within this upload." }); continue; } seen.add(email);
    const cell = (name: string) => indexOf(name) >= 0 ? (source[indexOf(name)] ?? "").trim() : "";
    const picked = placement.findBranch(cell("branch"));
    if (!picked.branch) { errors.push({ row: rowNumber, reason: picked.error ?? "Branch is not valid." }); continue; }
    const batchText = cell("batch") || cell("batchyear");
    const matched = placement.findBatch(picked.branch, batchText);
    if (!matched.batch) { errors.push({ row: rowNumber, reason: matched.error ?? "Batch is not valid." }); continue; }
    const branchId = picked.branch._id; const batchId = matched.batch._id;
    const values = { fullName, rollNumber: cell("rollnumber"), branch: picked.branch.name, batchYear: matched.batch.endYear };
    const existing = await StudentRosterEntry.findOne({ institutionId: request.institutionScope, email });
    if (existing) {
      if (existing.fullName === values.fullName && existing.rollNumber === values.rollNumber && existing.branch === values.branch && existing.batchYear === values.batchYear && String(existing.branchId ?? "") === String(branchId) && String(existing.batchId ?? "") === String(batchId)) { skipped += 1; continue; }
      Object.assign(existing, values, { branchId, batchId }, { uploadBatchId: batch._id, uploadedAt: new Date() }); await existing.save(); await syncStudentFromEntry(existing); updated += 1;
    } else { const made = await StudentRosterEntry.create({ institutionId: request.institutionScope, email, ...values, branchId, batchId, uploadBatchId: batch._id }); createdIds.push(String(made._id)); created += 1; }
  }
  Object.assign(batch, { successfulRows: created, updatedRows: updated, skippedRows: skipped, errorRows: errors }); await batch.save();
  // Roster entries without an account yet (new rows, or earlier rows that were never invited) get one now.
  const waiting = await StudentRosterEntry.find({ institutionId: request.institutionScope, matchedUserId: null }).select("_id").lean();
  const toInvite = [...new Set([...createdIds, ...waiting.map(entry => String(entry._id))])];
  const canInvite = emailConfigured();
  inviteInBackground(request.institutionScope!, toInvite);
  return response.status(201).json({ batch, summary: { created, updated, skipped, failed: errors.length, total: rows.length - 1 }, errorRows: errors, invitations: { queued: canInvite ? toInvite.length : 0, emailConfigured: canInvite } });
});

router.post("/roster/student", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("roster"), async (request, response, next) => {
  try {
    const input = z.object({
      fullName: z.string().trim().min(2, "Enter the student’s full name.").max(120),
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
      rollNumber: z.string().trim().max(40).default(""),
      branchId: z.string().refine(value => mongoose.isValidObjectId(value), "Choose a branch."),
      batchId: z.string().refine(value => mongoose.isValidObjectId(value), "Choose a batch."),
    }).parse(request.body);
    const institution = await Institution.findById(request.institutionScope).select("name approvedEmailDomains officialDomains").lean();
    if (!institution) return response.status(404).json({ message: "Institution not found." });
    const domains = new Set([...(institution.approvedEmailDomains ?? []), ...(institution.officialDomains ?? [])].map(String));
    const domain = input.email.split("@")[1];
    if (!domains.has(domain)) return response.status(400).json({ code: "DOMAIN_NOT_APPROVED", message: `@${domain} is not an approved student domain for your institution.` });
    if (await StudentRosterEntry.exists({ institutionId: request.institutionScope, email: input.email })) return response.status(409).json({ code: "ALREADY_ON_ROSTER", message: "This email is already on your roster." });
    const batch = await RosterUploadBatch.create({ institutionId: request.institutionScope, uploadedByTpoId: request.auth!.userId, fileName: "Added manually", totalRows: 1, successfulRows: 1, errorRows: [] });
    const placement = await loadPlacementIndex(request.institutionScope!);
    const branchDoc = placement.branchById(input.branchId); const batchDoc = placement.batchById(input.batchId);
    if (!branchDoc) return response.status(400).json({ message: "Choose one of your enabled branches." });
    if (!batchDoc || String(batchDoc.branchId) !== String(branchDoc._id)) return response.status(400).json({ message: "Choose a batch that belongs to that branch." });
    const entry = await StudentRosterEntry.create({ institutionId: request.institutionScope, email: input.email, fullName: input.fullName, rollNumber: input.rollNumber, branch: branchDoc.name, branchId: branchDoc._id, batchId: batchDoc._id, batchYear: batchDoc.endYear, uploadBatchId: batch._id });
    const invite = await inviteRosterStudent({ institutionId: request.institutionScope!, entryId: entry._id });
    const manual = invite.ok && !invite.joined && invite.delivery === "provider_not_configured";
    return response.status(201).json({ entry, invitation: invite.ok ? { delivery: invite.delivery, joined: Boolean(invite.joined), ...(manual ? { temporaryPassword: invite.temporaryPassword } : {}) } : { error: invite.reason } });
  } catch (error) { return next(error); }
});

/** Edit the details the institute controls for a student (name, ID, branch, batch). The student's profile follows. */
router.patch("/roster/:entryId", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("roster"), async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.entryId)) return response.status(404).json({ message: "Student not found." });
    const input = z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      rollNumber: z.string().trim().max(40).optional(),
      branchId: z.string().refine(value => mongoose.isValidObjectId(value)).optional(),
      batchId: z.string().refine(value => mongoose.isValidObjectId(value)).optional(),
    }).parse(request.body);
    const entry = await StudentRosterEntry.findOne({ _id: request.params.entryId, institutionId: request.institutionScope });
    if (!entry) return response.status(404).json({ message: "Student not found." });
    if (input.fullName !== undefined) entry.fullName = input.fullName;
    if (input.rollNumber !== undefined) entry.rollNumber = input.rollNumber;
    if (input.branchId !== undefined || input.batchId !== undefined) {
      const placement = await loadPlacementIndex(request.institutionScope!);
      const branchDoc = placement.branchById(input.branchId ?? String(entry.branchId ?? "")); const batchDoc = placement.batchById(input.batchId ?? String(entry.batchId ?? ""));
      if (!branchDoc) return response.status(400).json({ message: "Choose one of your enabled branches." });
      if (!batchDoc || String(batchDoc.branchId) !== String(branchDoc._id)) return response.status(400).json({ message: "Choose a batch that belongs to that branch." });
      entry.branch = branchDoc.name; entry.branchId = branchDoc._id; entry.batchId = batchDoc._id; entry.batchYear = batchDoc.endYear;
    }
    await entry.save();
    await syncStudentFromEntry(entry);
    return response.json({ entry });
  } catch (error) { return next(error); }
});

/** Send sign-in details to roster students who don't have an account yet (e.g. rows added before email was set up). */
router.post("/roster/invite", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("roster"), async (request, response) => {
  if (!emailConfigured()) return response.status(409).json({ code: "EMAIL_NOT_CONFIGURED", message: "Email isn't set up yet, so sign-in details can't be sent. Add students one at a time to copy their credentials." });
  const waiting = await StudentRosterEntry.find({ institutionId: request.institutionScope, matchedUserId: null }).select("_id").lean();
  inviteInBackground(request.institutionScope!, waiting.map(entry => String(entry._id)));
  return response.status(202).json({ queued: waiting.length });
});

/** Issue fresh sign-in details to a student who hasn't signed in yet. */
router.post("/roster/:entryId/resend", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("roster"), async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.entryId)) return response.status(404).json({ message: "Student not found." });
    const entry = await StudentRosterEntry.findOne({ _id: request.params.entryId, institutionId: request.institutionScope }).lean();
    if (!entry) return response.status(404).json({ message: "Student not found." });
    if (entry.matchedUserId) {
      const account = await User.findById(entry.matchedUserId).select("firstLoginAt lastLoginAt").lean();
      if (account?.firstLoginAt || account?.lastLoginAt) return response.status(409).json({ code: "ALREADY_SIGNED_IN", message: "This student has already signed in. They can use “Forgot password” if they need a new one." });
    }
    const invite = await inviteRosterStudent({ institutionId: request.institutionScope!, entryId: entry._id });
    if (!invite.ok) return response.status(409).json({ message: invite.reason });
    const manual = invite.delivery === "provider_not_configured";
    return response.json({ delivery: invite.delivery, ...(manual ? { temporaryPassword: invite.temporaryPassword } : {}) });
  } catch (error) { return next(error); }
});

router.get("/pending-students", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const students = await User.find({ institutionId: request.institutionScope, role: "student", studentVerificationStatus: "pending_tpo_approval", status: "pending" }).select("name email createdAt emailVerified").sort({ createdAt: 1 }).lean();
  const rosterEntries = await StudentRosterEntry.find({ institutionId: request.institutionScope, matchedUserId: { $in: students.map(student => student._id) } }).select("matchedUserId rollNumber branch batchYear").lean();
  const rosterByUser = new Map(rosterEntries.map(entry => [String(entry.matchedUserId), entry]));
  return response.json({ students: students.map(student => ({ ...student, roster: rosterByUser.get(String(student._id)) ?? null })) });
});

router.patch("/pending-students/:studentId", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("approvals"), async (request, response) => {
  const input = z.object({ action: z.enum(["approve", "reject"]) }).parse(request.body);
  const student = await User.findOne({ _id: request.params.studentId, institutionId: request.institutionScope, role: "student", studentVerificationStatus: "pending_tpo_approval", status: "pending" });
  if (!student) return response.status(404).json({ message: "Pending student not found in your institution." });
  if (input.action === "approve" && !student.emailVerified && emailConfigured()) return response.status(400).json({ code: "EMAIL_NOT_VERIFIED", message: "This student has not verified their email yet. Ask them to open the verification link first." });
  if (input.action === "approve") {
    student.studentVerificationStatus = "approved"; student.status = "active";
    const rosterEntry = await StudentRosterEntry.findOne({ institutionId: request.institutionScope, matchedUserId: student._id }).select("branch batchYear").lean();
    await StudentProfile.findOneAndUpdate({ userId: student._id }, { $set: { institutionId: request.institutionScope, onboardingCompleted: true, ...(rosterEntry?.branch ? { degree: rosterEntry.branch } : {}), ...(rosterEntry?.batchYear ? { graduationYear: rosterEntry.batchYear } : {}) } }, { upsert: true, setDefaultsOnInsert: true });
  }
  else { student.studentVerificationStatus = "rejected"; student.status = "suspended"; }
  await student.save();
  await queueEmail({ key: `student-decision:${student._id}:${input.action}`, to: student.email, subject: input.action === "approve" ? "Your Placeble account is approved" : "Your Placeble registration needs attention", text: input.action === "approve" ? `Your institution approved your account. Sign in at ${appLink("/login/student")}.` : "Your institution did not approve your registration. Contact your placement office for help." });
  return response.json({ student: { id: student._id, name: student.name, email: student.email, status: student.status, studentVerificationStatus: student.studentVerificationStatus } });
});

router.get("/marketplace/settings", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const institution = await Institution.findById(request.institutionScope).select("name marketplaceListing").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  return response.json({ institution });
});

router.patch("/marketplace/settings", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("settings"), async (request, response) => {
  const input = z.object({ isListed: z.boolean(), headline: z.string().trim().max(240).default(""), studentCountBand: z.enum(["", "Under 250", "250-500", "500-1000", "1000-2500", "2500+"]).default(""), topBranches: z.array(z.string().trim().min(1).max(60)).max(8).default([]) }).parse(request.body);
  const institution = await Institution.findByIdAndUpdate(request.institutionScope, { $set: {
    "marketplaceListing.isListed": input.isListed,
    "marketplaceListing.listedAt": input.isListed ? new Date() : null,
    "marketplaceListing.headline": input.headline,
    "marketplaceListing.studentCountBand": input.studentCountBand,
    "marketplaceListing.topBranches": [...new Set(input.topBranches.map(item => item.trim()).filter(Boolean))],
  } }, { returnDocument: "after" }).select("name marketplaceListing");
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

router.patch("/marketplace/requests/:requestId", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("recruiters"), async (request, response) => {
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
  await emailAudience({ recruiterOrgId: marketplaceRequest.recruiterOrgId, role: "recruiter", status: "active" }, `marketplace:${marketplaceRequest._id}:${marketplaceRequest.decidedAt?.getTime()}`, "Institution access request updated", `Your institution relationship request was ${input.action === "reject" ? "declined" : "approved"}. View the current access details in Placeble: ${appLink("/")}`);
  return response.json({ request: marketplaceRequest });
});

router.post("/marketplace/requests/:requestId/drives/:driveId/grant", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("recruiters"), async (request, response) => {
  const marketplaceRequest = await MarketplaceRequest.findOne({ _id: request.params.requestId, institutionId: request.institutionScope, status: "approved", grantedAccessLevel: "candidate_access" }).lean();
  if (!marketplaceRequest) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "Approve candidate access for this organization before granting a drive." });
  const drive = await Drive.findOne({ _id: request.params.driveId, institutionId: request.institutionScope, status: { $in: ["published", "draft"] } }).lean();
  if (!drive) return response.status(404).json({ message: "Drive not found in your institution." });
  const grant = await DriveAccessGrant.findOneAndUpdate({ recruiterOrgId: marketplaceRequest.recruiterOrgId, driveId: drive._id }, { $set: { institutionId: request.institutionScope, status: "approved", accessLevel: "candidate_access", requestedAccessLevel: "candidate_access", relationshipSource: "marketplace", grantedByTpoId: request.auth!.userId, requestedAt: new Date(), decidedAt: new Date() } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
  return response.status(201).json({ grant });
});

router.get("/drive-access", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const requests = await DriveAccessGrant.find({ institutionId: request.institutionScope }).populate("recruiterOrgId", "companyName companyDomain verificationStatus").populate("driveId", "title companyName startsAt").sort({ requestedAt: -1 }).lean();
  return response.json({ requests });
});

router.patch("/drive-access/:grantId", requireAuth, requireRole("tpo"), requireInstitutionScope, requireTpoPermission("recruiters"), async (request, response) => {
  const input = z.object({ action: z.enum(["approve", "reject", "revoke"]) }).parse(request.body);
  const grant = await DriveAccessGrant.findOneAndUpdate({ _id: request.params.grantId, institutionId: request.institutionScope }, { $set: { status: input.action === "approve" ? "approved" : "revoked", grantedByTpoId: request.auth!.userId, decidedAt: new Date() } }, { returnDocument: "after" });
  if (!grant) return response.status(404).json({ message: "Drive access request not found in your institution." });
  await emailAudience({ recruiterOrgId: grant.recruiterOrgId, role: "recruiter", status: "active" }, `drive-access:${grant._id}:${grant.decidedAt?.getTime()}`, "Placement drive access updated", `Your drive access was ${input.action === "approve" ? "approved" : "declined or revoked"}. Review your access in Placeble: ${appLink("/")}`);
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
  const grant = await DriveAccessGrant.findOneAndUpdate({ recruiterOrgId: request.auth!.recruiterOrgId, driveId: drive._id }, { $set: { institutionId: drive.institutionId, status: "requested", accessLevel: "candidate_access", requestedAccessLevel: "candidate_access", relationshipSource: "marketplace", requestedAt: new Date(), decidedAt: null, grantedByTpoId: null } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
  return response.status(201).json({ grant });
});

export { router as tenancyRouter };
