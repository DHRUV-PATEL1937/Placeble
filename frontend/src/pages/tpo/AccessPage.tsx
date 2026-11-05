import { Building2, Check, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Card, EmptyState, ErrorState, Loading, PageHeader, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "./tpo-core";

type Level = "aggregate_stats" | "candidate_access";
type MarketRequest = { _id: string; requestedAccessLevel: Level; grantedAccessLevel?: Level | null; message?: string; status: "pending" | "approved" | "rejected"; createdAt: string; recruiterOrgId?: { companyName: string; companyDomain: string } };
type MarketDrive = { _id: string; title: string; companyName: string };
type DriveRequest = { _id: string; status: string; requestedAt: string; recruiterOrgId: { companyName: string; companyDomain: string }; driveId: { title: string; companyName: string } };

const levelLabel = (level?: Level | null) => level === "candidate_access" ? "Candidate access" : "Aggregate statistics";

export function AccessPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [tab, setTab] = useState<"relationships" | "drives">("relationships");
  return (
    <>
      <PageHeader title="Access requests" description="Your college decides which recruiters can see your students, and for which drives." />
      <div className="tp-tabs" role="tablist" aria-label="Access request type">
        <button type="button" role="tab" aria-selected={tab === "relationships"} onClick={() => setTab("relationships")}>Company relationships</button>
        <button type="button" role="tab" aria-selected={tab === "drives"} onClick={() => setTab("drives")}>Drive access</button>
      </div>
      {tab === "relationships" ? <Relationships accessToken={accessToken} notify={notify} /> : <DriveAccess accessToken={accessToken} notify={notify} />}
    </>
  );
}

function Relationships({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(async () => {
    const [requests, drives] = await Promise.all([tpoApi<{ requests: MarketRequest[] }>("/tenancy/marketplace/requests", accessToken), tpoApi<{ drives: MarketDrive[] }>("/tenancy/marketplace/drives", accessToken)]);
    return { requests: requests.requests, drives: drives.drives };
  }, [accessToken]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const decide = async (id: string, action: "approve" | "reject" | "upgrade", granted?: Level) => {
    setBusy(id);
    try { await tpoApi(`/tenancy/marketplace/requests/${id}`, accessToken, { method: "PATCH", json: { action, grantedAccessLevel: granted } }); reload(); notify(action === "reject" ? "Request rejected." : action === "upgrade" ? "Upgraded to candidate access. Grant a drive next." : "Request approved."); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };
  const grant = async (id: string) => {
    const driveId = pick[id] || data?.drives[0]?._id;
    if (!driveId) { notify("Create a drive before granting candidate access.", "error"); return; }
    setBusy(id);
    try { await tpoApi(`/tenancy/marketplace/requests/${id}/drives/${driveId}/grant`, accessToken, { method: "POST" }); notify("Candidate access granted for that drive."); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };

  return (
    <Card title="Company relationship requests" description="Approve as requested, start with aggregate statistics only, or reject." actions={<button type="button" className="tp-btn secondary sm" onClick={reload}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>} flush>
      {loading ? <Loading label="Loading requests…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.requests.length ? (
        <EmptyState icon={ShieldCheck} title="No requests yet" text="Verified recruiter companies appear here when they ask to work with your college." />
      ) : (
        <ul className="tp-queue">
          {data.requests.map(item => {
            const wantsCandidates = item.requestedAccessLevel === "candidate_access";
            const drives = data.drives;
            return (
              <li key={item._id}>
                <span className="tp-icon-tile"><Building2 size={20} aria-hidden="true" /></span>
                <div className="tp-queue-main">
                  <strong>{item.recruiterOrgId?.companyName ?? "Company"}</strong>
                  <small>@{item.recruiterOrgId?.companyDomain} · asked for {levelLabel(item.requestedAccessLevel)} · {formatDate(item.createdAt)}</small>
                  {item.message && <small className="tp-quote">“{item.message}”</small>}
                  {item.status === "approved" && item.grantedAccessLevel !== item.requestedAccessLevel && <small className="tp-note">Granted {levelLabel(item.grantedAccessLevel)} instead.</small>}
                </div>
                <span className={`tp-pill ${item.status === "approved" ? "st-ready" : item.status === "rejected" ? "st-at-risk" : "st-stalled"}`}>{item.status === "pending" ? "Pending" : item.status === "approved" ? "Approved" : "Rejected"}</span>
                <div className="tp-queue-actions">
                  {item.status === "pending" ? <>
                    <button type="button" className="tp-btn ghost danger" disabled={busy === item._id} onClick={() => void decide(item._id, "reject")}>Reject</button>
                    {wantsCandidates && <button type="button" className="tp-btn secondary" disabled={busy === item._id} onClick={() => void decide(item._id, "approve", "aggregate_stats")}>Aggregate only</button>}
                    <button type="button" className="tp-btn primary" disabled={busy === item._id} onClick={() => void decide(item._id, "approve", item.requestedAccessLevel)}><Check size={15} aria-hidden="true" /> Approve</button>
                  </> : item.status === "approved" && item.grantedAccessLevel === "candidate_access" ? <>
                    <select className="tp-select" value={pick[item._id] ?? drives[0]?._id ?? ""} onChange={event => setPick(current => ({ ...current, [item._id]: event.target.value }))} aria-label="Drive to grant">{drives.length ? drives.map(drive => <option key={drive._id} value={drive._id}>{drive.title} · {drive.companyName}</option>) : <option value="">No drives available</option>}</select>
                    <button type="button" className="tp-btn primary" disabled={busy === item._id || !drives.length} onClick={() => void grant(item._id)}>Grant drive</button>
                  </> : item.status === "approved" && wantsCandidates ? <button type="button" className="tp-btn secondary" disabled={busy === item._id} onClick={() => void decide(item._id, "upgrade")}>Upgrade to candidate access</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DriveAccess({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ requests: DriveRequest[] }>("/tenancy/drive-access", accessToken), [accessToken]);
  const [busy, setBusy] = useState("");
  const decide = async (id: string, action: "approve" | "reject" | "revoke") => {
    setBusy(id);
    try { await tpoApi(`/tenancy/drive-access/${id}`, accessToken, { method: "PATCH", json: { action } }); reload(); notify(`Drive access ${action === "approve" ? "approved" : action === "revoke" ? "revoked" : "rejected"}.`); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };
  return (
    <Card title="Drive access requests" description="Each company needs your approval for every drive it wants to see candidates in." actions={<button type="button" className="tp-btn secondary sm" onClick={reload}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>} flush>
      {loading ? <Loading label="Loading requests…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.requests.length ? (
        <EmptyState icon={ShieldCheck} title="No drive requests" text="Companies you’ve approved can request access to a specific published drive." />
      ) : (
        <ul className="tp-queue">
          {data.requests.map(item => (
            <li key={item._id}>
              <span className="tp-icon-tile"><ShieldCheck size={20} aria-hidden="true" /></span>
              <div className="tp-queue-main"><strong>{item.recruiterOrgId.companyName}</strong><small>@{item.recruiterOrgId.companyDomain} · {item.driveId.title} · {item.driveId.companyName}</small><small>Requested {formatDate(item.requestedAt)}</small></div>
              <span className={`tp-pill ${item.status === "approved" ? "st-ready" : item.status === "requested" ? "st-stalled" : "st-at-risk"}`}>{item.status === "requested" ? "Pending" : item.status[0].toUpperCase() + item.status.slice(1)}</span>
              <div className="tp-queue-actions">
                {item.status === "requested" ? <><button type="button" className="tp-btn ghost danger" disabled={busy === item._id} onClick={() => void decide(item._id, "reject")}>Reject</button><button type="button" className="tp-btn primary" disabled={busy === item._id} onClick={() => void decide(item._id, "approve")}><Check size={15} aria-hidden="true" /> Approve</button></> : item.status === "approved" ? <button type="button" className="tp-btn ghost danger" disabled={busy === item._id} onClick={() => void decide(item._id, "revoke")}>Revoke access</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
