import { Copy, Mail, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  senderRole: "student" | "tpo";
  createdAt: string;
  deliveredAt?: string | null;
  readAt: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  status?: "sent" | "delivered" | "read";
};
export type Thread = {
  studentId: string;
  student: { name: string; email: string };
  branch?: string;
  batchYear?: number | null;
  lastMessage: { body: string; createdAt: string; senderRole: "student" | "tpo" };
  unread: number;
};
export type Person = { id: string; name: string; email: string; branch: string; batchYear: number | null; rollNumber: string; hasThread: boolean };
export type MessageHit = { id: string; studentId: string; studentName: string; body: string; senderRole: "student" | "tpo"; createdAt: string };
export type StudentProfile = {
  id: string; name: string; email: string; emailVerified: boolean; joinedAt: string; branch: string; batchYear: number | null; rollNumber: string;
  skills: string[]; preferredRoles: string[]; readiness: number; trend: number; status: "Ready" | "On track" | "Stalled" | "At risk";
  components: { resume: number; aptitude: number; interview: number }; messageCount: number;
};
export type ActiveStudent = { id: string; name: string; email: string; branch?: string; batchYear?: number | null };

export const initialsOf = (name: string) => name.split(" ").filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?";
const hueOf = (name: string) => [...name].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 7);

export function ChatAvatar({ name, size = 40, label }: { name: string; size?: number; label?: string }) {
  return <i className="ic-avatar" style={{ "--h": hueOf(name), width: size, height: size, fontSize: Math.round(size * 0.37) } as CSSProperties} aria-hidden="true">{label ?? initialsOf(name)}</i>;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY = 86_400_000;

/** Time shown on a conversation row: clock today, "Yesterday", weekday this week, otherwise a date. */
export function listTime(value: string) {
  const date = new Date(value);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
  if (diff <= 0) return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return date.toLocaleDateString("en-IN", { weekday: "short" });
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function dayLabel(value: string) {
  const date = new Date(value);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export const clockTime = (value: string) => new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

/** Wraps matches of `term` in <mark> for search results. */
export function highlight(text: string, term: string): ReactNode {
  const needle = term.trim();
  if (needle.length < 2) return text;
  const lower = text.toLowerCase();
  const index = lower.indexOf(needle.toLowerCase());
  if (index < 0) return text;
  const start = Math.max(0, index - 28);
  return <>{start > 0 && "…"}{text.slice(start, index)}<mark>{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length, index + needle.length + 80)}</>;
}

const STATUS_CLASS: Record<StudentProfile["status"], string> = { Ready: "ready", "On track": "track", Stalled: "stalled", "At risk": "risk" };

export function ProfilePanel({ profile, loading, error, onClose, onOpenStudents, onCopy }: { profile: StudentProfile | null; loading: boolean; error: string; onClose: () => void; onOpenStudents?: () => void; onCopy: (text: string) => void }) {
  return (
    <aside className="ic-profile" aria-label="Student profile">
      <header><h3>Profile</h3><button type="button" className="ic-icon-btn" onClick={onClose} aria-label="Close profile"><X size={18} /></button></header>
      {loading && !profile ? <div className="ic-profile-state" role="status"><span className="ic-spinner" aria-hidden="true" />Loading profile…</div>
        : error ? <div className="ic-profile-state error" role="alert">{error}</div>
        : profile && (
          <div className="ic-profile-body">
            <div className="ic-profile-hero">
              <ChatAvatar name={profile.name} size={72} />
              <h4>{profile.name}</h4>
              <p>{[profile.branch, profile.batchYear].filter(Boolean).join(" · ") || "Programme not added"}</p>
              <span className={`ic-status ${STATUS_CLASS[profile.status]}`}>{profile.status}</span>
              <div className="ic-profile-actions">
                <a className="ic-chip-btn" href={`mailto:${profile.email}`}><Mail size={15} aria-hidden="true" /> Email</a>
                <button type="button" className="ic-chip-btn" onClick={() => onCopy(profile.email)}><Copy size={15} aria-hidden="true" /> Copy email</button>
              </div>
            </div>

            <section>
              <h5>Placement readiness</h5>
              <div className="ic-score"><strong>{profile.readiness}</strong><span>out of 100{profile.trend !== 0 && <b className={profile.trend > 0 ? "up" : "down"}>{profile.trend > 0 ? "▲" : "▼"} {Math.abs(profile.trend)}</b>}</span></div>
              {([["Resume", profile.components.resume], ["Aptitude", profile.components.aptitude], ["Interview", profile.components.interview]] as const).map(([label, value]) => (
                <div className="ic-bar" key={label}><span>{label}<b>{value}%</b></span><i><u style={{ width: `${value}%` }} /></i></div>
              ))}
            </section>

            <section>
              <h5>Details</h5>
              <dl>
                <div><dt>Email</dt><dd>{profile.email}{!profile.emailVerified && <em> · not verified</em>}</dd></div>
                <div><dt>Roll number</dt><dd>{profile.rollNumber || "—"}</dd></div>
                <div><dt>Branch</dt><dd>{profile.branch || "—"}</dd></div>
                <div><dt>Batch</dt><dd>{profile.batchYear ?? "—"}</dd></div>
                <div><dt>Joined</dt><dd>{new Date(profile.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
                <div><dt>Messages</dt><dd>{profile.messageCount}</dd></div>
              </dl>
            </section>

            <section>
              <h5>Skills</h5>
              {profile.skills.length ? <div className="ic-tags">{profile.skills.map(skill => <em key={skill}>{skill}</em>)}</div> : <p className="ic-muted">No skills added yet.</p>}
            </section>
            {profile.preferredRoles.length > 0 && <section><h5>Looking for</h5><div className="ic-tags">{profile.preferredRoles.map(item => <em key={item}>{item}</em>)}</div></section>}
            {onOpenStudents && <button type="button" className="ic-link-btn" onClick={onOpenStudents}>Open in Students →</button>}
          </div>
        )}
    </aside>
  );
}
