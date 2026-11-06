import { AlertTriangle, CheckCircle2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { API_URL } from "@/pages/auth/auth-shared";
import { prefersReducedMotion, useCountUp, useSheetDrag } from "@/hooks/use-motion";

export type Notify = (message: string, tone?: "success" | "error") => void;

export type Student = {
  id: string;
  name: string;
  email: string;
  branch: string;
  readiness: number;
  trend: number;
  resume: number;
  aptitude: number;
  interview: number;
  /** "In progress" = hasn't used every required agent yet, so there's no overall score to judge. */
  status: "Ready" | "On track" | "Stalled" | "At risk" | "In progress";
  /** True once the student has used every required agent at least once. */
  complete?: boolean;
  agentsUsed?: number;
  agentsTotal?: number;
  skills: string[];
  batchId?: string | null;
  batchLabel?: string;
  /** "invited" = account created, hasn't signed in yet. */
  loginStatus?: "active" | "invited";
  firstLoginAt?: string | null;
  lastLoginAt?: string | null;
  invitedAt?: string | null;
};
export type CohortSummary = { studentCount: number; average: number; placementReady: number; atRisk: number; distribution: number[]; loggedIn?: number; inProgress?: number; invited?: number };

type CohortApiStudent = { complete?: boolean; agentsUsed?: number; agentsTotal?: number; batchId?: string | null; batchLabel?: string; loginStatus?: "active" | "invited"; firstLoginAt?: string | null; lastLoginAt?: string | null; invitedAt?: string | null; id: string; name: string; email: string; branch: string; graduationYear?: number; skills: string[]; readiness: number; trend: number; status: Student["status"]; components: { resume: number; aptitude: number; interview: number } };
export const mapStudents = (rows: CohortApiStudent[]): Student[] => rows.map(student => ({
  id: student.id, name: student.name, email: student.email, skills: student.skills, complete: student.complete, agentsUsed: student.agentsUsed, agentsTotal: student.agentsTotal, batchId: student.batchId, batchLabel: student.batchLabel, loginStatus: student.loginStatus, firstLoginAt: student.firstLoginAt, lastLoginAt: student.lastLoginAt, invitedAt: student.invitedAt, readiness: student.readiness, trend: student.trend, status: student.status,
  branch: `${student.branch}${student.graduationYear ? ` · ${student.graduationYear}` : ""}`,
  resume: student.components.resume, aptitude: student.components.aptitude, interview: student.components.interview,
}));

export class ApiError extends Error { code?: string; status?: number; }

export async function tpoApi<T = Record<string, unknown>>(path: string, token: string, init: RequestInit & { json?: unknown; form?: FormData } = {}): Promise<T> {
  const { json, form, headers, ...rest } = init;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: { Authorization: `Bearer ${token}`, ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: form ?? (json !== undefined ? JSON.stringify(json) : rest.body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields = Object.values((payload as { fields?: Record<string, unknown> }).fields ?? {}).flat().find(value => typeof value === "string");
    const error = new ApiError((fields as string | undefined) ?? (payload as { message?: string }).message ?? "Something went wrong. Please try again.");
    error.code = (payload as { code?: string }).code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const errorMessage = (cause: unknown, fallback = "Something went wrong. Please try again.") => cause instanceof Error ? cause.message : fallback;

/** Loads data on mount and whenever `reload()` is called. State is only set after the request settles. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    let live = true;
    loadRef.current()
      .then(value => { if (live) { setData(value); setError(""); } })
      .catch(cause => { if (live) setError(errorMessage(cause, "Could not load this page.")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => { setLoading(true); setTick(value => value + 1); }, []);
  return { data, setData, loading, error, reload };
}

export const initials = (name: string) => name.split(" ").filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?";
export const formatDate = (value: string | Date) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}
export function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
}

/* ───────── UI primitives ───────── */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="tp-page-head"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="tp-page-actions">{actions}</div>}</div>;
}

export function Card({ title, description, actions, children, className = "", flush = false }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`tp-card ${className}`}>
      {(title || actions) && <header className="tp-card-head"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions && <div className="tp-card-actions">{actions}</div>}</header>}
      <div className={flush ? "tp-card-body flush" : "tp-card-body"}>{children}</div>
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, note, tone = "navy" }: { icon: LucideIcon; label: string; value: string | number; note?: string; tone?: "navy" | "green" | "amber" | "red" }) {
  return <article className={`tp-stat tone-${tone}`}><span aria-hidden="true"><Icon size={20} /></span><div><small>{label}</small><strong>{typeof value === "number" ? <CountUp value={value} /> : value}</strong>{note && <p>{note}</p>}</div></article>;
}

/** A whole number that counts up to its value the first time it appears. */
export function CountUp({ value }: { value: number }) {
  const shown = useCountUp(Number.isFinite(value) ? value : 0);
  return <>{Number.isInteger(value) ? shown : value}</>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return <div className="tp-empty"><span aria-hidden="true"><Icon size={24} /></span><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="tp-loading" role="status"><span className="tp-spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="tp-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{message}</span>{onRetry && <button type="button" className="tp-btn ghost sm" onClick={onRetry}>Try again</button>}</div>;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return <i className="tp-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{initials(name)}</i>;
}

export function StatusPill({ status }: { status: Student["status"] }) {
  return <span className={`tp-pill st-${status.toLowerCase().replace(" ", "-")}`}>{status}</span>;
}

/** The overall score, or "N of M agents" for a student who hasn't used every required agent yet. */
export function ReadinessCell({ student }: { student: Pick<Student, "readiness" | "complete" | "agentsUsed" | "agentsTotal"> }) {
  if (student.complete === false) return <span className="tp-sub">{student.agentsUsed ?? 0} of {student.agentsTotal ?? 0} agents used</span>;
  return <ScoreBar value={student.readiness} />;
}

export function ScoreBar({ value }: { value: number }) {
  return <span className="tp-score" aria-label={`Score ${value} out of 100`}><b>{value}</b><i><u style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></i></span>;
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Close with a short exit animation (the sheet slides away on phones); skipped when the user prefers reduced motion.
  const dismissRef = useRef(() => {});
  dismissRef.current = () => {
    if (timer.current !== undefined) return;
    if (prefersReducedMotion()) { onClose(); return; }
    setClosing(true);
    timer.current = window.setTimeout(onClose, 190);
  };
  const dismiss = useCallback(() => dismissRef.current(), []);
  const drag = useSheetDrag(ref, dismiss);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; window.clearTimeout(timer.current); previous?.focus(); };
  }, [dismiss]);
  return (
    <div className={`tp-modal-layer${closing ? " closing" : ""}`}>
      <div className="tp-modal-scrim" onClick={dismiss} aria-hidden="true" />
      <div className={`tp-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <span className="tp-sheet-grab" aria-hidden="true" {...drag} />
        <header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" data-close className="tp-icon-btn" onClick={dismiss} aria-label="Close"><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message, tone, onClose }: { message: string; tone: "success" | "error"; onClose: () => void }) {
  return <div className={`tp-toast ${tone}`} role="status">{tone === "success" ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}<span>{message}</span><button type="button" onClick={onClose} aria-label="Dismiss"><X size={15} /></button></div>;
}

export function Pager({ page, pages, total, pageSize, onChange }: { page: number; pages: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  return (
    <nav className="tp-pager" aria-label="Pagination">
      <span>Showing {from}–{Math.min(total, page * pageSize)} of {total}</span>
      <div><button type="button" className="tp-btn ghost sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><b>Page {page} of {pages}</b><button type="button" className="tp-btn ghost sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div>
    </nav>
  );
}
