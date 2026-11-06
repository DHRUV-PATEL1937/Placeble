import { DeleteAccountRequest } from "@/components/account/DeleteAccountRequest";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { RecentUpdates } from "@/components/ui/recent-updates";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, LineChart, LockKeyhole, Monitor, Moon, Sun, Target, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PASSWORD_RULES, passwordMeetsRules } from "@/pages/auth/auth-ui";
import { Card, EmptyState, Loading, PageHeader, StatCard, errorMessage, formatDate, tpoApi, type Notify } from "@/pages/tpo/tpo-core";
import { AccessHistoryPanel, StudentActionPlanPanel } from "@/components/workflow/workflow-panels";
import { type Guidance, COMPONENT_META, SHOW_GROUP_DISCUSSION, SHOW_JOB_MATCHING, AgentRing, ScoreRing, bandLabel, buildTools, greeting, nextBestAction, type ReadinessPayload, type View } from "./st-core";

type Go = (view: View) => void;

/* ───────── Home ───────── */
export function HomePage({ name, readiness, loaded, accessToken, go, guidance, guide }: { name: string; readiness: ReadinessPayload | null; loaded: boolean; accessToken: string; go: Go; guidance?: Guidance; guide?: { show: boolean; onTour: () => void; onDismiss: () => void } }) {
  // The overall score only exists once every required agent has been used. Until then we show each agent's own score.
  const unlocked = Boolean(readiness?.unlocked);
  const score = readiness?.overall ?? 0;
  const agents = readiness?.agents ?? [];
  const c = readiness?.current?.components;
  const next = nextBestAction(readiness, guidance);
  const tools = buildTools(readiness, guidance);
  const history = readiness?.history ?? [];
  const delta = history.length > 1 ? history[history.length - 1].score - history[history.length - 2].score : 0;
  const done = tools.filter(tool => tool.done).length;

  return (
    <>
      <PageHeader title={`${greeting()}, ${name.split(" ")[0]}`} description="Here’s where you stand and the best next step." />

      {guide?.show && loaded && <GettingStarted tools={tools} go={go} onTour={guide.onTour} onDismiss={guide.onDismiss} />}

      <section className="st-hero">
        {unlocked || !loaded ? (
          <div className="st-hero-score">
            <ScoreRing score={score} />
            <div>
              <small>Placement readiness</small>
              <h2>{loaded ? bandLabel(score) : "Loading…"}</h2>
              <p>{loaded ? `Based on ${readiness?.current?.evidenceCount ?? done} piece${(readiness?.current?.evidenceCount ?? done) === 1 ? "" : "s"} of practice evidence.` : "Loading your score…"}</p>
              {delta !== 0 && <span className={`st-delta ${delta > 0 ? "up" : "down"}`}><TrendingUp size={14} aria-hidden="true" /> {delta > 0 ? "+" : ""}{delta} since last update</span>}
            </div>
          </div>
        ) : (
          <div className="st-hero-score st-locked-score">
            <AgentRing used={readiness?.usedCount ?? 0} total={readiness?.totalCount ?? (agents.length || 3)} />
            <div>
              <small>Placement readiness</small>
              <h2>Your score unlocks soon</h2>
              <p>Use every agent once and we’ll show your overall readiness score. Until then, here’s how you’re doing in each one.</p>
              <ul className="st-agent-chips" aria-label="Your agents">
                {agents.map(agent => (
                  <li key={agent.key}><button type="button" className={agent.used ? "used" : ""} onClick={() => go(agent.view)}>{agent.used ? <Check size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}<span>{agent.label}</span><b>{agent.used ? `${agent.score}%` : "Not tried"}</b></button></li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="st-hero-next">
          <span className="st-tag"><Clock3 size={13} aria-hidden="true" /> Recommended · {next.tag}</span>
          <h3>{next.title}</h3>
          <p>{next.text}</p>
          <button type="button" className="tp-btn primary" onClick={() => go(next.view)}>{next.cta}<ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </section>

      {guidance?.programName && (
        <section className="st-focus-strip" aria-label="Tailored for you">
          <span><Target size={16} aria-hidden="true" /> Tailored for <b>{guidance.programName}</b></span>
          {guidance.roles.length > 0 && <div>{guidance.roles.slice(0, 4).map(role => <em key={role}>{role}</em>)}{guidance.roles.length > 4 && <small>+{guidance.roles.length - 4} more</small>}</div>}
          <p>{guidance.interviewStyle === "business" ? "Business roles lean on communication, so interviews and group discussions come first." : guidance.interviewStyle === "technical" ? "Technical roles lean on problem-solving, so aptitude and interview practice come first." : "A balanced mix of aptitude, interviews and your resume."}</p>
        </section>
      )}

      <div className="tp-stats st-stats">
        <StatCard icon={Target} label="Resume" value={c?.resume ? `${c.resume}` : "—"} note={c?.resume ? "ATS score" : "Not started"} tone="navy" />
        <StatCard icon={Target} label="Aptitude" value={c?.aptitude ? `${c.aptitude}%` : "—"} note={c?.aptitude ? "Latest attempt" : "Not started"} tone="amber" />
        <StatCard icon={Target} label="Interview" value={c?.interview ? `${c.interview}%` : "—"} note={c?.interview ? "Average of recent" : "Not started"} tone="green" />
        <StatCard icon={CheckCircle2} label="Tools used" value={`${done}/${tools.length}`} note="Practice areas started" tone="red" />
      </div>

      <div className="tp-grid two">
        <Card title="Practice tools" description="Pick up where you left off." actions={<button type="button" className="tp-btn ghost sm" onClick={() => go("Agents")}>View all <ArrowRight size={14} aria-hidden="true" /></button>} flush>
          <ul className="st-tool-list">
            {tools.slice(0, 4).map(tool => { const Icon = tool.icon; return (
              <li key={tool.view}>
                <button type="button" onClick={() => go(tool.view)}>
                  <span className="tp-icon-tile"><Icon size={20} aria-hidden="true" /></span>
                  <span><b>{tool.name}</b><small>{tool.metric}</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ); })}
          </ul>
        </Card>
        <div className="st-stack"><StudentActionPlanPanel accessToken={accessToken} onOpen={view => go(view as View)} /></div>
      </div>
      <RecentUpdates accessToken={accessToken} />
    </>
  );
}

/* ───────── Practice tools ───────── */
export function ToolsPage({ readiness, go, guidance }: { readiness: ReadinessPayload | null; go: Go; guidance?: Guidance }) {
  const tools = buildTools(readiness, guidance);
  return (
    <>
      <PageHeader title="Practice tools" description="Each one feeds your readiness score. Start anywhere." />
      <div className="st-tools">
        {tools.map(tool => { const Icon = tool.icon; return (
          <article key={tool.view} className="st-tool">
            <header><span className="tp-icon-tile"><Icon size={22} aria-hidden="true" /></span><em className={tool.done ? "done" : ""}>{tool.done ? <><Check size={12} aria-hidden="true" /> Started</> : "New"}</em></header>
            <h3>{tool.name}</h3>
            <p>{tool.description}</p>
            <footer><div><small>{tool.metric}</small><small><Clock3 size={12} aria-hidden="true" /> {tool.minutes}</small></div><button type="button" className="tp-btn primary sm" onClick={() => go(tool.view)}>{tool.cta}</button></footer>
          </article>
        ); })}
      </div>
    </>
  );
}

/* ───────── Progress ───────── */
export function ProgressPage({ readiness, loaded, go }: { readiness: ReadinessPayload | null; loaded: boolean; go: Go }) {
  const history = readiness?.history ?? [];
  const unlocked = Boolean(readiness?.unlocked);
  const score = readiness?.overall ?? 0;
  const components = readiness?.current?.components;
  // Business programmes weigh and show the Case Solver and HR Simulator; IT programmes don't see them at all. The server says which apply.
  const agentKeys = new Set((readiness?.agents ?? []).map(agent => agent.key));
  const weightOf = (item: (typeof COMPONENT_META)[number]) => Math.round((readiness?.weights?.[item.key] ?? item.weight / 100) * 100);
  const ranked = COMPONENT_META.map(item => ({ ...item, weight: weightOf(item), value: components?.[item.key] ?? 0 })).sort((a, b) => a.value * a.weight - b.value * b.weight);
  const available = (key: string) => (key !== "groupDiscussion" || SHOW_GROUP_DISCUSSION) && (key !== "careerActivity" || SHOW_JOB_MATCHING) && (key !== "caseStudy" || agentKeys.has("case_study")) && (key !== "hrSimulation" || agentKeys.has("hr_simulation"));
  const focus = ranked.filter(item => item.value < 60 && available(item.key)).slice(0, 3);

  const width = 640, height = 200, padX = 28, padY = 20;
  const points = history.map((item, index) => ({ x: padX + (history.length === 1 ? 0.5 : index / (history.length - 1)) * (width - padX * 2), y: padY + (1 - item.score / 100) * (height - padY * 2), item }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  if (!loaded) return <><PageHeader title="My progress" /><Card><Loading label="Loading your progress…" /></Card></>;
  return (
    <>
      <PageHeader title="My progress" description="How your readiness has changed, and what moves it most." />
      <div className="tp-grid two">
        <Card title="Readiness over time" description={history.length ? `${history.length} update${history.length === 1 ? "" : "s"}` : undefined}>
          {!unlocked ? (
            <EmptyState icon={LineChart} title="Your trend unlocks with your score" text={`Use every agent once (${readiness?.usedCount ?? 0} of ${readiness?.totalCount ?? 0} so far) and we’ll start charting your overall readiness.`} action={<button type="button" className="tp-btn primary" onClick={() => go("Agents")}>See the agents</button>} />
          ) : history.length < 2 ? (
            <EmptyState icon={LineChart} title="Your trend will appear here" text="Complete a couple of practice sessions and we’ll chart how your score moves." action={<button type="button" className="tp-btn primary" onClick={() => go("Agents")}>Start practising</button>} />
          ) : (
            <figure className="st-chart">
              <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Readiness score over ${history.length} updates, now ${score}`}>
                {[0, 25, 50, 75, 100].map(tick => { const y = padY + (1 - tick / 100) * (height - padY * 2); return <g key={tick}><line x1={padX} x2={width - padX} y1={y} y2={y} /><text x={padX - 6} y={y + 4} textAnchor="end">{tick}</text></g>; })}
                <path d={`${path} L${points[points.length - 1].x},${height - padY} L${points[0].x},${height - padY} Z`} className="area" />
                <path d={path} className="line" />
                {points.map(point => <circle key={point.item.calculatedAt} cx={point.x} cy={point.y} r="4"><title>{`${point.item.score} on ${formatDate(point.item.calculatedAt)}`}</title></circle>)}
              </svg>
              <figcaption>{formatDate(history[0].calculatedAt)} → {formatDate(history[history.length - 1].calculatedAt)}</figcaption>
            </figure>
          )}
        </Card>
        <Card title="Where to focus" description="Biggest gains first.">
          {focus.length ? (
            <ul className="st-focus">{focus.map(item => (
              <li key={item.key}><span><b>{item.label}</b><small>{item.value ? `${item.value}% now` : "Not started"} · counts for {item.weight}%</small></span><button type="button" className="tp-btn secondary sm" onClick={() => go(item.view)}>Improve</button></li>
            ))}</ul>
          ) : <EmptyState icon={CheckCircle2} title="Strong across the board" text="Every area is at 60% or above. Keep practising to stay sharp." />}
        </Card>
      </div>

      <Card title="Score breakdown" description="Your readiness is a weighted mix of these areas.">
        <div className="st-breakdown">
          {COMPONENT_META.filter(item => (item.key !== "caseStudy" && item.key !== "hrSimulation") || available(item.key)).map(item => { const value = components?.[item.key] ?? 0; return (
            <div key={item.key}>
              <span><b>{item.label}</b><small>{weightOf(item)}% of score</small></span>
              <i aria-hidden="true"><u style={{ width: `${value}%` }} /></i>
              <strong>{value ? `${value}%` : "—"}</strong>
            </div>
          ); })}
        </div>
      </Card>
    </>
  );
}

export { ProfilePage } from "./ProfilePage";

/* ───────── Settings ───────── */
export function SettingsPage({ theme, setTheme, accessToken, notify, direct = false }: { theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void; accessToken: string; notify: Notify; direct?: boolean }) {
  const [reduced, setReduced] = useState(() => window.localStorage.getItem("placeble-reduced-motion") === "true");
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const toggleMotion = (value: boolean) => { setReduced(value); window.localStorage.setItem("placeble-reduced-motion", String(value)); document.documentElement.dataset.reducedMotion = String(value); };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!passwordMeetsRules(form.newPassword)) { setError("Your new password doesn’t meet all the requirements."); return; }
    if (form.newPassword !== form.confirmPassword) { setError("Your new passwords do not match."); return; }
    setBusy(true);
    try { await tpoApi("/auth/change-password", accessToken, { method: "POST", json: { currentPassword: form.currentPassword, newPassword: form.newPassword } }); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); notify("Password changed. Other devices were signed out."); }
    catch (cause) { setError(errorMessage(cause, "Could not change your password.")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Appearance, accessibility and account security." />
      <div className="st-settings">
        <Card title="Appearance" description="Choose what’s easiest on your eyes.">
          <div className="st-theme" role="radiogroup" aria-label="Theme">
            {([["light", "Light", Sun], ["dark", "Dark", Moon]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? "on" : ""} onClick={() => setTheme(value)}><Icon size={20} aria-hidden="true" /><b>{label}</b>{theme === value && <Check size={16} aria-hidden="true" />}</button>
            ))}
          </div>
        </Card>
        <Card title="Accessibility">
          <label className="tp-switch"><input type="checkbox" role="switch" checked={reduced} onChange={event => toggleMotion(event.target.checked)} /><span aria-hidden="true" /><b>Reduce motion</b></label>
          <p className="tp-field-hint" style={{ marginTop: 8 }}><Monitor size={14} aria-hidden="true" /> Minimises animations and transitions. Every feature stays available.</p>
        </Card>
        <Card title="Change password" description="You’ll be signed out on other devices.">
          <form className="tp-form" onSubmit={changePassword} noValidate>
            {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
            <div className="tp-field"><label htmlFor="sp-cur">Current password</label><input id="sp-cur" type="password" autoComplete="current-password" value={form.currentPassword} onChange={event => set("currentPassword", event.target.value)} /></div>
            <div className="tp-field"><label htmlFor="sp-new">New password</label><input id="sp-new" type="password" autoComplete="new-password" value={form.newPassword} onChange={event => set("newPassword", event.target.value)} /></div>
            <ul className="tp-rules">{PASSWORD_RULES.map(rule => <li key={rule.label} className={rule.test(form.newPassword) ? "ok" : ""}><span aria-hidden="true">{rule.test(form.newPassword) && <Check size={11} strokeWidth={3} />}</span>{rule.label}</li>)}</ul>
            <div className="tp-field"><label htmlFor="sp-conf">Confirm new password</label><input id="sp-conf" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => set("confirmPassword", event.target.value)} /></div>
            <div><button type="submit" className="tp-btn primary" disabled={busy || !form.currentPassword}><LockKeyhole size={16} aria-hidden="true" /> {busy ? "Updating…" : "Update password"}</button></div>
          </form>
        </Card>
        <Card title="Who has viewed your profile"><AccessHistoryPanel accessToken={accessToken} /></Card>
        {direct && (
          <Card title="Delete account" description="Ask us to permanently delete your Placeble account. We review every request, and nothing is removed until it’s approved.">
            <DeleteAccountRequest accessToken={accessToken} />
          </Card>
        )}
      </div>
    </>
  );
}
