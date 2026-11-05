import { Batch, batchState } from "../models/Batch";
import { Institution } from "../models/Institution";
import { ReadinessScore } from "../models/ReadinessScore";
import { presentCommercial } from "./pilot-service";
import { University } from "../models/University";
import { User } from "../models/User";

/** How a university's colleges are doing. Used by the university TPO and by the superadmin. */
export async function universityRollup(universityId: string) {
  const [university, institutes] = await Promise.all([
    University.findById(universityId).select("name slug status logoUrl commercial").lean(),
    Institution.find({ universityId }).sort({ name: 1 }).lean(),
  ]);
  const ids = institutes.map(item => item._id);
  const batches = await Batch.find({ institutionId: { $in: ids } }).lean();
  const [students, staff, scores] = await Promise.all([
    User.find({ institutionId: { $in: ids }, role: "student" }).select("institutionId status firstLoginAt lastLoginAt").lean(),
    User.find({ institutionId: { $in: ids }, role: { $in: ["tpo", "principal"] } }).select("institutionId role status").lean(),
    // Latest readiness per student, so we never recompute a whole university on one request.
    ReadinessScore.aggregate([{ $match: { institutionId: { $in: ids } } }, { $sort: { calculatedAt: -1 } }, { $group: { _id: "$studentId", institutionId: { $first: "$institutionId" }, score: { $first: "$score" }, complete: { $first: "$complete" } } }]),
  ]);
  const rows = institutes.map(institute => {
    const key = String(institute._id);
    const own = students.filter(student => String(student.institutionId) === key);
    // Only students who have used every required agent count towards averages and risk.
    const ownScores = scores.filter(item => String(item.institutionId) === key && item.complete).map(item => item.score as number);
    const team = staff.filter(member => String(member.institutionId) === key);
    const ownBatches = batches.filter(batch => String(batch.institutionId) === key).map(batch => batchState(batch));
    return {
      id: key, name: institute.name, status: institute.status, domains: institute.approvedEmailDomains ?? [],
      students: own.filter(student => student.status === "active").length,
      pendingApprovals: 0,
      activeBatches: ownBatches.filter(state => state === "active").length,
      graduatedBatches: ownBatches.filter(state => state === "graduated" || state === "closed").length,
      signedIn: own.filter(student => student.firstLoginAt ?? student.lastLoginAt).length,
      invited: own.filter(student => !(student.firstLoginAt ?? student.lastLoginAt)).length,
      tpos: team.filter(member => member.role === "tpo" && member.status === "active").length,
      principals: team.filter(member => member.role === "principal" && member.status === "active").length,
      average: ownScores.length ? Math.round(ownScores.reduce((total, value) => total + value, 0) / ownScores.length) : 0,
      ready: ownScores.filter(score => score >= 75).length,
      atRisk: ownScores.filter(score => score < 45).length,
    };
  });
  const sum = (key: "students" | "ready" | "atRisk" | "pendingApprovals" | "signedIn" | "invited") => rows.reduce((total, row) => total + row[key], 0);
  const allScores = scores.filter(item => item.complete).map(item => item.score as number);
  return ({
    university: university ? { ...university, commercial: presentCommercial(university.commercial) } : null,
    totals: { institutes: rows.length, students: sum("students"), ready: sum("ready"), atRisk: sum("atRisk"), pendingApprovals: sum("pendingApprovals"), signedIn: sum("signedIn"), invited: sum("invited"), average: allScores.length ? Math.round(allScores.reduce((total, value) => total + value, 0) / allScores.length) : 0 },
    institutes: rows,
  });
}
