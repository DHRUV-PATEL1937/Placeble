import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, errorMessage, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { ReasonModal, StatusChip, dateTime } from "./admin-ui";
import "@/pages/tpo/tpo.css";

type Status = "pending" | "approved" | "rejected" | "cancelled";
type Row = { id: string; userId: string; name: string; email: string; role: string; reason: string; reviewNote: string; status: Status; requestedAt: string; decidedAt: string | null };
type List = { pending: number; requests: Row[] };

const ROLE_LABEL: Record<string, string> = { student: "Student", tpo: "TPO", faculty: "Faculty", recruiter: "Recruiter", university_admin: "University TPO", principal: "Principal" };
const TABS: Array<{ key: Status; label: string }> = [{ key: "pending", label: "Waiting" }, { key: "approved", label: "Deleted" }, { key: "rejected", label: "Declined" }, { key: "cancelled", label: "Withdrawn" }];

/** Superadmin: people who asked to have their account deleted. Approving closes the account and removes their personal details. */
export function DeletionRequestsPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [status, setStatus] = useState<Status>("pending");
  const [acting, setActing] = useState<{ row: Row; decision: "approve" | "reject" } | null>(null);
  const { data, loading, error, reload } = useLoad(() => tpoApi<List>(`/platform-admin/deletion-requests?status=${status}`, accessToken), [accessToken, status]);

  const decide = async (reason: string) => {
    if (!acting) return;
    try {
      await tpoApi(`/platform-admin/deletion-requests/${acting.row.id}`, accessToken, { method: "PATCH", json: { decision: acting.decision, note: reason } });
      notify(acting.decision === "approve" ? `${acting.row.name}’s account was deleted.` : "Request declined.");
      setActing(null); reload();
    } catch (cause) { notify(errorMessage(cause), "error"); }
  };

  return (
    <>
      <PageHeader title="Deletion requests" description="B2C students who asked to have their account deleted. Nothing is removed until you approve." />
      <div className="tp-tabs" role="tablist" aria-label="Request status">
        {TABS.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key} className={status === tab.key ? "active" : ""} onClick={() => setStatus(tab.key)}>{tab.label}{tab.key === "pending" && data && data.pending > 0 ? ` (${data.pending})` : ""}</button>)}
      </div>
      <Card flush>
        {loading && !data ? <Loading label="Loading requests…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.requests.length ? (
          <EmptyState icon={Trash2} title="Nothing here" text={status === "pending" ? "No one is waiting for an account deletion." : "No requests with this status yet."} />
        ) : (
          <ul className="st-usage">
            {data.requests.map(row => (
              <li key={row.id} style={{ display: "block", padding: "14px 18px" }}>
                <div className="tp-cell-person"><Avatar name={row.name} /><b>{row.name}<small>{row.email}</small></b></div>
                <p><StatusChip value={row.status === "approved" ? "active" : row.status} /> {ROLE_LABEL[row.role] ?? row.role} · asked {dateTime(row.requestedAt)}{row.decidedAt ? ` · closed ${dateTime(row.decidedAt)}` : ""}</p>
                {row.reason && <p><em>“{row.reason}”</em></p>}
                {row.reviewNote && <p className="tp-sub">Your note: {row.reviewNote}</p>}
                {row.status === "pending" && (
                  <div className="tp-inline-actions">
                    <button type="button" className="tp-btn danger-solid sm" onClick={() => setActing({ row, decision: "approve" })}>Delete account</button>
                    <button type="button" className="tp-btn ghost sm" onClick={() => setActing({ row, decision: "reject" })}>Decline</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {acting && (
        <ReasonModal
          title={acting.decision === "approve" ? `Delete ${acting.row.name}’s account?` : "Decline this request?"}
          text={acting.decision === "approve" ? `${acting.row.email} will be signed out, their name, email and profile removed, and the account closed. This can’t be undone.` : "They’ll keep their account. Say why so it’s on record."}
          confirmLabel={acting.decision === "approve" ? "Delete account" : "Decline request"}
          destructive={acting.decision === "approve"}
          onCancel={() => setActing(null)}
          onConfirm={decide}
        />
      )}
    </>
  );
}
