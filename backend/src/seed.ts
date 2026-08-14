import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { FacultyProfile } from "./models/FacultyProfile";
import { Institution } from "./models/Institution";
import { RecruiterProfile } from "./models/RecruiterProfile";
import { StudentProfile } from "./models/StudentProfile";
import { User, type UserDocument } from "./models/User";
import { ensureAptitudeQuestionBank } from "./services/aptitude-question-bank";
import { RecruiterOrganization } from "./models/RecruiterOrganization";
import { Drive } from "./models/Drive";
import { DriveAccessGrant } from "./models/DriveAccessGrant";

async function seed() {
  await connectDatabase();
  const password = env.SEED_DEMO_PASSWORD ?? "Placeble@2026";
  const passwordHash = await bcrypt.hash(password, 12);
  const institution = await Institution.findOneAndUpdate(
    { slug: "techend-institute" },
    { name: "TechEnd Institute of Technology", slug: "techend-institute", officialDomains: ["techend.edu.in"], approvedEmailDomains: ["techend.edu.in"], status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const accountSeeds = [
    { email: "student@placeble.local", name: "Arjun Kumar", role: "student", institutionId: institution._id },
    { email: "tpo@placeble.local", name: "Dr. Meera Iyer", role: "tpo", institutionId: institution._id },
    { email: "recruiter@placeble.local", name: "Nisha Shah", role: "recruiter", institutionId: institution._id },
    { email: "faculty@placeble.local", name: "Prof. Ravi Menon", role: "faculty", institutionId: institution._id },
  ] as const;

  const users = new Map<string, UserDocument>();
  for (const account of accountSeeds) {
    const user = await User.findOneAndUpdate(
      { email: account.email },
      { ...account, passwordHash, authProvider: "password", status: "active", emailVerified: true, studentVerificationStatus: account.role === "student" ? "approved" : null },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as UserDocument;
    users.set(account.role, user);
  }
  const platformAdmin = await User.findOneAndUpdate(
    { email: "platform@placeble.local" },
    { name: "Placeble Platform Admin", email: "platform@placeble.local", role: "platform_admin", institutionId: null, recruiterOrgId: null, passwordHash, authProvider: "password", status: "active", emailVerified: true },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ) as UserDocument;
  const recruiterOrganization = await RecruiterOrganization.findOneAndUpdate(
    { companyDomain: "razorpay.com" },
    { companyName: "Razorpay", companyDomain: "razorpay.com", verificationStatus: "verified", verifiedByPlatformAdminId: platformAdmin._id, verifiedAt: new Date(), suspendedAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await User.updateOne({ _id: users.get("recruiter")!._id }, { $set: { institutionId: null, recruiterOrgId: recruiterOrganization._id } });
  const drive = await Drive.findOneAndUpdate(
    { institutionId: institution._id, title: "Graduate Engineering Drive", companyName: "Razorpay" },
    { institutionId: institution._id, title: "Graduate Engineering Drive", companyName: "Razorpay", status: "published", startsAt: new Date("2026-08-18T09:00:00.000Z") },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await DriveAccessGrant.findOneAndUpdate(
    { recruiterOrgId: recruiterOrganization._id, driveId: drive._id },
    { institutionId: institution._id, status: "approved", grantedByTpoId: users.get("tpo")!._id, requestedAt: new Date(), decidedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await StudentProfile.findOneAndUpdate(
    { userId: users.get("student")!._id },
    { institutionId: institution._id, degree: "B.Tech Computer Science", graduationYear: 2027, skills: ["React", "JavaScript", "SQL"], preferredRoles: ["Product Analyst", "Software Engineer"], onboardingCompleted: true },
    { upsert: true, new: true },
  );
  await RecruiterProfile.findOneAndUpdate(
    { userId: users.get("recruiter")!._id },
    { companyName: "Razorpay", institutionIds: [institution._id], driveIds: ["campus-drive-aug-2026"] },
    { upsert: true, new: true },
  );
  await FacultyProfile.findOneAndUpdate(
    { userId: users.get("faculty")!._id },
    { institutionId: institution._id, department: "Computer Science", cohortLabels: ["CSE 2027"] },
    { upsert: true, new: true },
  );

  await ensureAptitudeQuestionBank();

  console.log(`Seeded ${env.MONGODB_DB_NAME} with demo accounts and the aptitude question bank.`);
  await disconnectDatabase();
}

seed().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
