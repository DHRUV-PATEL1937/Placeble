import { Download } from "lucide-react";
import { Avatar, ErrorState, Loading, Modal, StatusPill, formatDate, tpoApi, useLoad, type Student } from "@/pages/tpo/tpo-core";

type Report = {
  student: { id: string; name: string; email: string; emailVerified: boolean; status: string; joinedAt: string; lastLoginAt: string | null; branch: string; batchLabel?: string; batchPeriod?: string; batchYear: number | null; rollNumber: string; skills: string[]; preferredRoles: string[] };
  readiness: { score: number; complete?: boolean; agentsUsed?: number; agentsTotal?: number; status: Student["status"]; components: { resume: number; aptitude: number; interview: number; groupDiscussion: number; careerActivity: number } | null; history: Array<{ score: number; calculatedAt: string }> };
  activity: {
    aptitude: Array<{ score: number; completedAt: string; mode?: string }>;
    interviews: Array<{ score: number; completedAt: string; role?: string; type?: string }>;
    resumes: Array<{ title?: string; atsScore: number; current: boolean; updatedAt: string }>;
    groupDiscussions: Array<{ topic?: string; completedAt: string }>;
    applications: { total: number; byStatus: Record<string, number> };
  };
};

const PARTS = [["resume", "Resume"], ["aptitude", "Aptitude"], ["interview", "Interview"], ["groupDiscussion", "Group discussion"], ["careerActivity", "Career activity"]] as const;

/** Full read-only report for one student. Used by principals (and any role that can read reports). */
export function StudentReportModal({ studentId, accessToken, onClose, basePath = "/reports/students" }: { studentId: string; accessToken: string; onClose: () => void; basePath?: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Report>(`${basePath}/${studentId}`, accessToken), [studentId, accessToken, basePath]);

  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [["Student", data.student.name], ["Email", data.student.email], ["Roll number", data.student.rollNumber], ["Branch", data.student.branch], ["Batch", data.student.batchPeriod ? `${data.student.batchLabel} (${data.student.batchPeriod})` : String(data.student.batchYear ?? "")], ["Readiness", data.readiness.complete === false ? "In progress" : String(data.readiness.score)], ["Status", data.readiness.status], ...PARTS.map(([key, label]) => [label, String(data.readiness.components?.[key] ?? 0)])];
    const csv = "﻿" + rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${data.student.name.replace(/\s+/g, "-").toLowerCase()}-report.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <Modal title="Student report" description="Read-only. Based on the student’s completed practice." onClose={onClose} wide>
      {loading && !data ? <Loading label="Loading report…" /> : error || !data ? <ErrorState message={error || "Could not load this report."} onRetry={reload} /> : (
        <div className="sr">
          <header className="sr-head">
            <Avatar name={data.student.name} size={52} />
            <div><h3>{data.student.name}</h3><p>{data.student.email}</p><small>{[data.student.rollNumber, data.student.branch, data.student.batchLabel || data.student.batchYear].filter(Boolean).join(" · ") || "No academic details"}</small></div>
            <div className="sr-score"><strong>{data.readiness.complete === false ? "—" : data.readiness.score}</strong><StatusPill status={data.readiness.status} />{data.readiness.complete === false && <small>{data.readiness.agentsUsed ?? 0} of {data.readiness.agentsTotal ?? 0} agents used</small>}</div>
          </header>

          <section>
            <h4>Readiness breakdown</h4>
            <div className="sr-bars">{PARTS.map(([key, label]) => { const value = data.readiness.components?.[key] ?? 0; return <div key={key}><span>{label}<b>{value ? `${value}%` : "—"}</b></span><i><u style={{ width: `${value}%` }} /></i></div>; })}</div>
          </section>

          {data.readiness.history.length > 1 && (
            <section>
              <h4>Score history</h4>
              <ul className="sr-history">{data.readiness.history.map(item => <li key={item.calculatedAt}><b>{item.score}</b><small>{formatDate(item.calculatedAt)}</small></li>)}</ul>
            </section>
          )}

          <div className="sr-grid">
            <section><h4>Aptitude attempts</h4>{data.activity.aptitude.length ? <ul>{data.activity.aptitude.map(item => <li key={item.completedAt}><span>{item.mode ?? "Assessment"}</span><b>{item.score}%</b><small>{formatDate(item.completedAt)}</small></li>)}</ul> : <p className="sr-none">None completed.</p>}</section>
            <section><h4>Mock interviews</h4>{data.activity.interviews.length ? <ul>{data.activity.interviews.map(item => <li key={item.completedAt}><span>{item.role || item.type || "Interview"}</span><b>{item.score}%</b><small>{formatDate(item.completedAt)}</small></li>)}</ul> : <p className="sr-none">None completed.</p>}</section>
            <section><h4>Resumes</h4>{data.activity.resumes.length ? <ul>{data.activity.resumes.map(item => <li key={item.updatedAt}><span>{item.title || "Resume"}{item.current && <em> · current</em>}</span><b>ATS {item.atsScore}</b><small>{formatDate(item.updatedAt)}</small></li>)}</ul> : <p className="sr-none">No resume yet.</p>}</section>
            <section><h4>Applications</h4><p className="sr-big">{data.activity.applications.total}</p><p className="sr-none">{Object.entries(data.activity.applications.byStatus).map(([status, count]) => `${count} ${status}`).join(" · ") || "No applications."}</p></section>
          </div>

          <section>
            <h4>Skills &amp; goals</h4>
            <div className="sr-tags">{data.student.skills.length ? data.student.skills.map(skill => <em key={skill}>{skill}</em>) : <span className="sr-none">No skills added.</span>}</div>
            {data.student.preferredRoles.length > 0 && <p className="sr-none">Looking for: {data.student.preferredRoles.join(", ")}</p>}
            <p className="sr-none">Joined {formatDate(data.student.joinedAt)}{data.student.lastLoginAt ? ` · last signed in ${formatDate(data.student.lastLoginAt)}` : ""}</p>
          </section>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn secondary" onClick={exportCsv}><Download size={15} aria-hidden="true" /> Export CSV</button><button type="button" className="tp-btn primary" onClick={onClose}>Close</button></footer>
        </div>
      )}
    </Modal>
  );
}
