import { Activity, ArrowRight, BarChart3, Building2, ClipboardList, Database, HeartPulse, Server, ShieldAlert, UserRoundCheck, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, StatCard, formatDate, tpoApi, useLoad } from "@/pages/tpo/tpo-core";
import { actionLabel, dateTime, StatusChip } from "./admin-ui";

type AuditEntry = { _id: string; action: string; targetType: string; targetId: string; metadata?: Record<string, string>; createdAt: string; platformAdminId?: { _id: string; name: string; email: string } };
type OverviewData = { metrics: { activeInstitutions: number; newInstitutionsThisMonth: number; students: number; onboardedStudents: number; onboardingRate: number; verifiedRecruiters: number; pendingRecruiters: number; averageReadiness: number }; signupTrend: Array<{ date: string; count: number }>; recentActivity: AuditEntry[]; leads: Array<{ _id: string; institutionName: string; contactName: string; workEmail: string; createdAt: string }> };
type Health = "operational" | "configured" | "degraded" | "down";
type HealthData = { overall: Health; checkedAt: string; responseTimeMs: number; services: Array<{ key: string; label: string; status: Health; detail: string }> };

export function OverviewPage({ accessToken, go }: { accessToken: string; go: (key: string) => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<OverviewData>("/platform-admin/overview", accessToken), [accessToken]);
  // Signups per week for the last 13 weeks.
  const weeks = useMemo(() => {
    const rows = data?.signupTrend ?? [];
    return Array.from({ length: 13 }, (_, week) => ({ label: rows[Math.min(week * 7, rows.length - 1)]?.date ?? "", count: rows.slice(week * 7, week * 7 + 7).reduce((sum, item) => sum + item.count, 0) }));
  }, [data]);
  const peak = Math.max(1, ...weeks.map(item => item.count));

  return (
    <>
      <PageHeader title="Platform overview" description="How Placeble is doing across every college and company." />
      {loading && !data ? <Card><Loading label="Loading the platform…" /></Card> : error || !data ? <Card><ErrorState message={error || "Could not load the overview."} onRetry={reload} /></Card> : (
        <>
          {data.metrics.pendingRecruiters > 0 && (
            <button type="button" className="tp-banner" onClick={() => go("Companies")}>
              <UserRoundCheck size={20} aria-hidden="true" />
              <span><strong>{data.metrics.pendingRecruiters} compan{data.metrics.pendingRecruiters === 1 ? "y is" : "ies are"} waiting for verification</strong><small>Review them before they can request access to any college.</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
          <div className="tp-stats">
            <StatCard icon={Building2} label="Active colleges" value={data.metrics.activeInstitutions} note={`+${data.metrics.newInstitutionsThisMonth} this month`} />
            <StatCard icon={UsersRound} tone="amber" label="Students" value={data.metrics.students} note={`${data.metrics.onboardingRate}% finished setup`} />
            <StatCard icon={UserRoundCheck} tone="green" label="Verified companies" value={data.metrics.verifiedRecruiters} note={`${data.metrics.pendingRecruiters} pending review`} />
            <StatCard icon={BarChart3} tone="red" label="Average readiness" value={data.metrics.averageReadiness} note="Latest score per student" />
          </div>

          <div className="tp-grid two">
            <Card title="New students" description="Signups per week over the last 13 weeks">
              <div className="tp-chart ad-weeks" role="img" aria-label={`Weekly signups: ${weeks.map(item => item.count).join(", ")}`}>
                {weeks.map((item, index) => <div key={index}><b>{item.count}</b><span style={{ height: `${Math.max(4, (item.count / peak) * 100)}%` }} /><small>{item.label ? new Date(item.label).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</small></div>)}
              </div>
            </Card>
            <Card title="Recent admin activity" description="Everything is recorded for accountability" actions={<button type="button" className="tp-btn ghost sm" onClick={() => go("Activity")}>View all <ArrowRight size={14} aria-hidden="true" /></button>} flush>
              {data.recentActivity.length ? (
                <ul className="ad-feed">{data.recentActivity.slice(0, 6).map(entry => (
                  <li key={entry._id}><span className={entry.action.includes("suspend") || entry.action.includes("reject") ? "warn" : ""}><Activity size={15} aria-hidden="true" /></span><div><b>{actionLabel(entry.action)}</b><small>{entry.platformAdminId?.name ?? "Platform admin"} · {dateTime(entry.createdAt)}</small>{entry.metadata?.reason && <small>Reason: {entry.metadata.reason}</small>}</div></li>
                ))}</ul>
              ) : <EmptyState icon={ClipboardList} title="No activity yet" text="Audited actions appear here as the platform is run." />}
            </Card>
          </div>

          {data.leads.length > 0 && (
            <Card title="Recent college enquiries" description="People who asked to bring their institute onto Placeble" flush>
              <ul className="tp-queue">{data.leads.map(lead => (
                <li key={lead._id}><Avatar name={lead.institutionName} /><div className="tp-queue-main"><strong>{lead.institutionName}</strong><small>{lead.contactName} · {lead.workEmail}</small></div><small>{formatDate(lead.createdAt)}</small><div className="tp-queue-actions"><a className="tp-btn secondary sm" href={`mailto:${lead.workEmail}`}>Reply</a></div></li>
              ))}</ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}

export function HealthPage({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<HealthData>("/platform-admin/health", accessToken), [accessToken]);
  const icon = (key: string) => key === "database" || key === "core-data" ? <Database size={20} aria-hidden="true" /> : key === "api" ? <Server size={20} aria-hidden="true" /> : <HeartPulse size={20} aria-hidden="true" />;
  const healthy = data?.services.filter(service => service.status === "operational" || service.status === "configured").length ?? 0;
  return (
    <>
      <PageHeader title="System status" description="Live checks of the API, the database and the services Placeble relies on." actions={<button type="button" className="tp-btn secondary" onClick={reload}>Run checks again</button>} />
      {loading && !data ? <Card><Loading label="Running system checks…" /></Card> : error || !data ? <Card><ErrorState message={error || "Could not run the checks."} onRetry={reload} /></Card> : (
        <>
          <section className={`ad-hero ${data.overall}`}>
            <span><HeartPulse size={26} aria-hidden="true" /></span>
            <div><small>Overall</small><h2>{data.overall === "operational" ? "All essential systems are healthy." : data.overall === "degraded" ? "Running, but something needs attention." : "A critical system needs attention."}</h2><p>Checked {dateTime(data.checkedAt)} · took {data.responseTimeMs} ms</p></div>
            <strong>{healthy}/{data.services.length}<small>checks ready</small></strong>
          </section>
          <div className="ad-checks">{data.services.map(service => (
            <article key={service.key} className={`ad-check ${service.status}`}><span>{icon(service.key)}</span><div><StatusChip value={service.status} /><h3>{service.label}</h3><p>{service.detail}</p></div></article>
          ))}</div>
          <p className="tp-field-hint">These checks confirm the API, the database and your configuration are in place. They don’t send test emails, change data or use AI credits.</p>
        </>
      )}
    </>
  );
}

export function AlertsPage({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ alerts: Array<{ key: string; severity: string; title: string; detail: string }> }>("/workflows/operational-alerts", accessToken).then(payload => payload.alerts ?? []), [accessToken]);
  return (
    <>
      <PageHeader title="System alerts" description="Things that may need an administrator’s attention." actions={<button type="button" className="tp-btn secondary" onClick={reload}>Refresh</button>} />
      <Card flush>
        {loading && !data ? <Loading label="Checking for problems…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <EmptyState icon={ShieldAlert} title="Nothing needs attention" text="No failed emails, stuck jobs or other problems right now." /> : (
          <ul className="tp-queue">{data.map(alert => (
            <li key={alert.key}><span className="tp-icon-tile"><ShieldAlert size={20} aria-hidden="true" /></span><div className="tp-queue-main"><strong>{alert.title}</strong><small>{alert.detail}</small></div><span className={`tp-pill ${alert.severity === "critical" || alert.severity === "high" ? "st-at-risk" : "st-stalled"}`}>{alert.severity}</span></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
