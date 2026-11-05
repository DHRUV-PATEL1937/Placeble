import { AlertTriangle, ArrowRight, MailWarning, GraduationCap, Sparkles, UploadCloud, UserPlus, UsersRound } from "lucide-react";
import { DriveWorkflowPanel } from "@/components/workflow/workflow-panels";
import { Avatar, Card, EmptyState, PageHeader, ScoreBar, StatCard, StatusPill, type CohortSummary, type Student } from "./tpo-core";

const BANDS: Array<[string, (value: number) => boolean]> = [
  ["0–39", value => value < 40],
  ["40–59", value => value >= 40 && value < 60],
  ["60–74", value => value >= 60 && value < 75],
  ["75–89", value => value >= 75 && value < 90],
  ["90+", value => value >= 90],
];

export function OverviewPage({ name, institution, students, summary, invitedCount, accessToken, goto }: { name: string; institution: string; students: Student[]; summary: CohortSummary | null; invitedCount: number; accessToken: string; goto: (page: string) => void }) {
  const total = summary?.loggedIn ?? students.length;
  // Students who haven't signed in yet have no activity, and students still working through the agents have no overall score yet,
  // so neither appears in the score charts and lists.
  const started = students.filter(student => student.loginStatus !== "invited" && student.complete !== false);
  const inProgress = summary?.inProgress ?? 0;
  const scored = total - inProgress;
  const readyShare = scored > 0 ? Math.round(((summary?.placementReady ?? 0) / scored) * 100) : 0;
  const counts = BANDS.map(([, test]) => started.filter(student => test(student.readiness)).length);
  const peak = Math.max(1, ...counts);
  const atRisk = started.filter(student => student.status === "At risk" || student.status === "Stalled").sort((a, b) => a.readiness - b.readiness).slice(0, 5);
  const top = [...started].sort((a, b) => b.readiness - a.readiness).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${name.split(" ").filter(word => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(word))[0] ?? name}`} description={`${institution || "Your college"} · placement overview`} actions={<>
        <button type="button" className="tp-btn secondary" onClick={() => goto("Roster")}><UploadCloud size={16} aria-hidden="true" /> Upload roster</button>
        <button type="button" className="tp-btn primary" onClick={() => goto("Roster")}><UserPlus size={16} aria-hidden="true" /> Add student</button>
      </>} />

      {invitedCount > 0 && (
        <button type="button" className="tp-banner" onClick={() => goto("Roster")}>
          <MailWarning size={20} aria-hidden="true" />
          <span><strong>{invitedCount} student{invitedCount === 1 ? " hasn’t" : "s haven’t"} signed in yet</strong><small>Their sign-in details were emailed. Open the roster to resend them.</small></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      )}

      <div className="tp-stats">
        <StatCard icon={Sparkles} label="Average readiness score" value={`${summary?.average ?? 0} / 100`} note={scored > 0 ? `Across the ${scored} student${scored === 1 ? "" : "s"} who used every agent${inProgress ? ` · ${inProgress} still in progress` : ""}` : inProgress ? `${inProgress} student${inProgress === 1 ? " is" : "s are"} still working through the agents` : "Appears once students sign in"} />
        <StatCard icon={GraduationCap} tone="green" label="Placement-ready students" value={summary?.placementReady ?? 0} note={scored > 0 ? `Scoring 75 or more · ${readyShare}% of scored students` : "Students scoring 75 or more"} />
        <StatCard icon={UsersRound} tone="amber" label="Students signed in" value={`${total} of ${total + invitedCount}`} note={invitedCount ? `${invitedCount} added but haven’t signed in yet` : "Everyone you added has signed in"} />
        <StatCard icon={AlertTriangle} tone="red" label="Students needing support" value={summary?.atRisk ?? 0} note="Scoring below 45. Follow up with them" />
      </div>

      <div className="tp-grid two">
        <Card title="Readiness distribution" description="How many students fall in each score band">
          {students.length ? (
            <div className="tp-chart" role="img" aria-label={`Readiness distribution: ${BANDS.map(([label], index) => `${label}: ${counts[index]} students`).join(", ")}`}>
              {BANDS.map(([label], index) => (
                <div key={label}><b>{counts[index]}</b><span style={{ height: `${Math.max(4, (counts[index] / peak) * 100)}%` }} className={index >= 3 ? "good" : index === 0 ? "low" : ""} /><small>{label}</small></div>
              ))}
            </div>
          ) : <EmptyState icon={UsersRound} title="No students yet" text="Add students to your roster to see readiness here." />}
        </Card>

        <Card title="Needs attention" description="Lowest readiness first" actions={<button type="button" className="tp-btn ghost sm" onClick={() => goto("Interventions")}>View all <ArrowRight size={14} aria-hidden="true" /></button>} flush>
          {atRisk.length ? <ul className="tp-list">{atRisk.map(student => (
            <li key={student.id}><Avatar name={student.name} /><b>{student.name}<small>{student.branch}</small></b><StatusPill status={student.status} /><ScoreBar value={student.readiness} /></li>
          ))}</ul> : <EmptyState icon={GraduationCap} title="Everyone is on track" text="No student is currently stalled or at risk." />}
        </Card>
      </div>

      <Card title="Top performers" description="Highest current readiness" actions={<button type="button" className="tp-btn ghost sm" onClick={() => goto("Students")}>All students <ArrowRight size={14} aria-hidden="true" /></button>} flush>
        {top.length ? <ul className="tp-list">{top.map(student => (
          <li key={student.id}><Avatar name={student.name} /><b>{student.name}<small>{student.branch}</small></b><StatusPill status={student.status} /><ScoreBar value={student.readiness} /></li>
        ))}</ul> : <EmptyState icon={UsersRound} title="No data yet" text="Scores appear once students start practising." />}
      </Card>

      <Card title="Drives" description="Placement drives and their status"><DriveWorkflowPanel accessToken={accessToken} /></Card>
    </>
  );
}
