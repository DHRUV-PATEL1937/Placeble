import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../src/config/database";
import { AptitudeAttempt } from "../src/models/AptitudeAttempt";
import { Drive } from "../src/models/Drive";
import { Institution } from "../src/models/Institution";
import { Resume } from "../src/models/Resume";
import { StudentProfile } from "../src/models/StudentProfile";
import { User } from "../src/models/User";
import { institutionReadiness, recomputeReadiness } from "../src/services/readiness-service";

const fixtures = [
  { name: "Test University A E2E 2026", domain: "test-university-a-e2e.edu.in", scores: [[88, 82], [78, 74]], branches: ["Computer Science", "Electronics"] },
  { name: "Test University B Chain 2026", domain: "test-university-b-chain.edu.in", scores: [[62, 54], [52, 44]], branches: ["Information Technology", "Mechanical"] },
] as const;

async function seed() {
  await connectDatabase();
  const passwordHash = await bcrypt.hash("ChainStudentQA@2026", 12);
  const results = [];
  for (const fixture of fixtures) {
    const institution = await Institution.findOne({ name: fixture.name });
    if (!institution) throw new Error(`${fixture.name} must be created through the platform-admin UI first.`);
    const studentIds = [];
    for (let index = 0; index < fixture.scores.length; index += 1) {
      const [resumeScore, aptitudeScore] = fixture.scores[index];
      const email = `chain.student${index + 1}@${fixture.domain}`;
      const student = await User.findOneAndUpdate({ email }, { $set: { name: `Chain Student ${index + 1} ${fixture.name.includes(" A ") ? "A" : "B"}`, email, role: "student", institutionId: institution._id, recruiterOrgId: null, passwordHash, authProvider: "password", status: "active", emailVerified: true, studentVerificationStatus: "approved" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      studentIds.push(String(student._id));
      await StudentProfile.findOneAndUpdate({ userId: student._id }, { $set: { institutionId: institution._id, degree: fixture.branches[index], graduationYear: 2027 + index, skills: index === 0 ? ["JavaScript", "SQL"] : ["Python", "Communication"], preferredRoles: ["Graduate Engineer"], onboardingCompleted: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await Resume.findOneAndUpdate({ studentId: student._id, title: "Recruiter chain QA resume" }, { $set: { sections: [], sourceType: "generated", atsScore: resumeScore, atsBreakdown: { keywordOverlap: resumeScore, semanticSimilarity: resumeScore, missingKeywords: [] }, template: "classic", versionNumber: 1, isCurrent: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await AptitudeAttempt.findOneAndUpdate({ studentId: student._id, focusTopic: "Recruiter chain QA" }, { $set: { sections: ["quantitative"], questionIds: [], responses: [], scoreTotal: aptitudeScore, scoreByCategory: { quantitative: aptitudeScore }, scoreByTopic: { "Recruiter chain QA": aptitudeScore }, startedAt: new Date(), completedAt: new Date(), durationSeconds: 900, status: "completed", mode: "focused", focusTopic: "Recruiter chain QA" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await recomputeReadiness(String(student._id), "recruiter_chain_fixture");
    }
    if (fixture.name.includes(" A ")) await Drive.findOneAndUpdate({ institutionId: institution._id, title: "E2E Graduate Engineering Drive", companyName: "TalentBridge E2E" }, { $set: { status: "published", startsAt: new Date("2026-09-15T09:00:00.000Z") } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const readiness = await institutionReadiness(String(institution._id));
    results.push({ institutionId: String(institution._id), name: fixture.name, studentIds, averageReadiness: readiness.summary.average });
  }
  console.log(JSON.stringify(results));
  await disconnectDatabase();
}

seed().catch(async error => { console.error(error); await disconnectDatabase(); process.exit(1); });
