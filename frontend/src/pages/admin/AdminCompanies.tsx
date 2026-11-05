import { ArrowLeft, Check, Clock3, Search, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, Pager, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { ReasonModal, StatusChip } from "./admin-ui";

type Org = { _id: string; companyName: string; companyDomain: string; verificationStatus: "pending" | "verified" | "rejected"; suspendedAt?: string | null; createdAt: string; approvedGrantCount: number; totalGrantCount: number; marketplaceApprovedCount: number; marketplaceAggregateCount: number; marketplaceCandidateCount: number; marketplaceRequestCount: number };
type Detail = {
  organization: Org; recruiters: Array<{ _id: string; name: string; email: string; status: string; lastLoginAt?: string }>;
  grants: Array<{ _id: string; status: string; requestedAt: string; institutionId?: { name: string }; driveId?: { title: string; companyName: string } }>;
  marketplaceRequests: Array<{ _id: string; status: string; requestedAccessLevel: string; grantedAccessLevel?: string; createdAt: string; institutionId?: { name: string } }>;
};
type Action = "verify" | "reject" | "suspend" | "restore";
const level = (value?: string) => value === "candidate_access" ? "Candidate access" : "Aggregate statistics";
const PAGE = 12;
const state = (org: Org) => org.suspendedAt ? "suspended" : org.verificationStatus;

export function CompaniesPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ org: Org; action: "reject" | "suspend" } | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const list = useLoad(() => tpoApi<{ organizations: Org[] }>(`/platform-admin/recruiter-organizations?search=${encodeURIComponent(search)}&status=${status}`, accessToken).then(payload => payload.organizations), [accessToken, search, status]);

  const decide = async (org: Org, action: Action, reason = "") => {
    setBusy(org._id);
    try { await tpoApi(`/platform-admin/recruiter-organizations/${org._id}`, accessToken, { method: "PATCH", json: { action, reason } }); notify(`${org.companyName} ${action === "verify" ? "verified" : action === "restore" ? "restored" : action === "reject" ? "rejected" : "suspended"}.`); setDialog(null); setOpenId(null); list.reload(); }
    catch (cause) { notify(errorMessage(cause), "error"); setDialog(null); }
    finally { setBusy(""); }
  };

  if (openId) return <CompanyDetail id={openId} accessToken={accessToken} onBack={() => setOpenId(null)} onDecide={decide} busy={busy} onDialog={(org, action) => setDialog({ org, action })} dialog={dialog} clearDialog={() => setDialog(null)} />;
  const rows = list.data ?? [];
  const visible = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <PageHeader title="Companies" description="Recruiter organizations on Placeble. Verify a company before it can ask any college for access." />
      {status === "pending" && rows.length > 0 && <div className="tp-banner static" role="status"><Clock3 size={20} aria-hidden="true" /><span><strong>{rows.length} waiting for review</strong><small>Check the company’s identity and work-email domain, then verify or reject.</small></span></div>}
      <Card flush>
        <div className="tp-toolbar">
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search company or domain" aria-label="Search companies" /></label>
          <select className="tp-select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} aria-label="Filter"><option value="pending">Pending review</option><option value="all">All companies</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select>
        </div>
        {list.loading && !list.data ? <Loading label="Loading companies…" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !rows.length ? <EmptyState icon={UsersRound} title={status === "pending" ? "Nothing waiting" : "No companies found"} text={status === "pending" ? "There are no companies waiting for review." : "Try a different search or filter."} /> : (
          <>
            <div className="tp-table" role="table" aria-label="Companies">
              <div className="tp-tr head cols-company" role="row"><span role="columnheader">Company</span><span role="columnheader">Registered</span><span role="columnheader">Colleges</span><span role="columnheader">Drive grants</span><span role="columnheader">Status</span><span role="columnheader" /></div>
              {visible.map(org => (
                <div className="tp-tr cols-company" role="row" key={org._id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={org.companyName} /><b>{org.companyName}<small>@{org.companyDomain}</small></b></span>
                  <span role="cell" data-label="Registered">{formatDate(org.createdAt)}</span>
                  <span role="cell" data-label="Colleges">{org.marketplaceApprovedCount}<small className="tp-sub">{org.marketplaceAggregateCount} aggregate · {org.marketplaceCandidateCount} candidate</small></span>
                  <span role="cell" data-label="Grants">{org.approvedGrantCount}<small className="tp-sub">{org.totalGrantCount} requested</small></span>
                  <span role="cell"><StatusChip value={state(org)} /></span>
                  <span role="cell" className="tp-cell-actions">
                    {org.verificationStatus === "pending" ? <><button type="button" className="tp-btn primary sm" disabled={Boolean(busy)} onClick={() => void decide(org, "verify")}><Check size={14} aria-hidden="true" /> Verify</button><button type="button" className="tp-btn ghost danger sm" disabled={Boolean(busy)} onClick={() => setDialog({ org, action: "reject" })}>Reject</button></> : <button type="button" className="tp-btn ghost sm" onClick={() => setOpenId(org._id)}>Open</button>}
                  </span>
                </div>
              ))}
            </div>
            <Pager page={page} pages={Math.max(1, Math.ceil(rows.length / PAGE))} total={rows.length} pageSize={PAGE} onChange={setPage} />
          </>
        )}
      </Card>
      {dialog && <ReasonModal title={`${dialog.action === "reject" ? "Reject" : "Suspend"} ${dialog.org.companyName}`} text="This changes access for every recruiter in this company." confirmLabel={dialog.action === "reject" ? "Reject company" : "Suspend company"} destructive onCancel={() => setDialog(null)} onConfirm={reason => decide(dialog.org, dialog.action, reason)} />}
    </>
  );
}

function CompanyDetail({ id, accessToken, onBack, onDecide, busy, onDialog, dialog, clearDialog }: { id: string; accessToken: string; onBack: () => void; onDecide: (org: Org, action: Action, reason?: string) => Promise<void>; busy: string; onDialog: (org: Org, action: "reject" | "suspend") => void; dialog: { org: Org; action: "reject" | "suspend" } | null; clearDialog: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Detail>(`/platform-admin/recruiter-organizations/${id}`, accessToken), [id, accessToken]);
  if (loading && !data) return <><PageHeader title="Company" /><Card><Loading label="Loading company…" /></Card></>;
  if (error || !data) return <><button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back</button><Card><ErrorState message={error || "Could not load this company."} onRetry={reload} /></Card></>;
  const org = data.organization;
  return (
    <>
      <button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> All companies</button>
      <section className="ad-detail-hero">
        <Avatar name={org.companyName} size={52} />
        <div><h1>{org.companyName}</h1><p>@{org.companyDomain} · registered {formatDate(org.createdAt)}</p></div>
        <StatusChip value={state(org)} />
        <div className="tp-page-actions">
          {org.suspendedAt ? <button type="button" className="tp-btn primary" disabled={busy === org._id} onClick={() => void onDecide(org, "restore")}>Restore</button> : <button type="button" className="tp-btn secondary danger" disabled={busy === org._id} onClick={() => onDialog(org, "suspend")}>Suspend</button>}
          {org.verificationStatus === "rejected" && <button type="button" className="tp-btn primary" disabled={busy === org._id} onClick={() => void onDecide(org, "verify")}>Verify instead</button>}
        </div>
      </section>
      <Card title="Recruiter accounts" description="People who can act for this company" flush>
        {!data.recruiters.length ? <EmptyState icon={UsersRound} title="No recruiter accounts" /> : <ul className="tp-queue">{data.recruiters.map(person => <li key={person._id}><Avatar name={person.name} /><div className="tp-queue-main"><strong>{person.name}</strong><small>{person.email} · last in {person.lastLoginAt ? formatDate(person.lastLoginAt) : "never"}</small></div><StatusChip value={person.status} /></li>)}</ul>}
      </Card>
      <div className="tp-grid two">
        <Card title="College relationships" description={`${data.marketplaceRequests.length} request${data.marketplaceRequests.length === 1 ? "" : "s"}`} flush>
          {!data.marketplaceRequests.length ? <EmptyState icon={UsersRound} title="None yet" /> : <ul className="tp-queue">{data.marketplaceRequests.map(item => <li key={item._id}><div className="tp-queue-main"><strong>{item.institutionId?.name ?? "College"}</strong><small>Asked for {level(item.requestedAccessLevel)}{item.status === "approved" ? ` · granted ${level(item.grantedAccessLevel)}` : ""} · {formatDate(item.createdAt)}</small></div><StatusChip value={item.status} /></li>)}</ul>}
        </Card>
        <Card title="Drive access" description={`${data.grants.length} request${data.grants.length === 1 ? "" : "s"}`} flush>
          {!data.grants.length ? <EmptyState icon={UsersRound} title="None yet" /> : <ul className="tp-queue">{data.grants.map(grant => <li key={grant._id}><div className="tp-queue-main"><strong>{grant.driveId?.title ?? "Drive"}</strong><small>{grant.institutionId?.name ?? "College"} · requested {formatDate(grant.requestedAt)}</small></div><StatusChip value={grant.status} /></li>)}</ul>}
        </Card>
      </div>
      {dialog && <ReasonModal title={`${dialog.action === "reject" ? "Reject" : "Suspend"} ${dialog.org.companyName}`} text="This changes access for every recruiter in this company." confirmLabel={dialog.action === "reject" ? "Reject company" : "Suspend company"} destructive onCancel={clearDialog} onConfirm={reason => onDecide(dialog.org, dialog.action, reason)} />}
    </>
  );
}
