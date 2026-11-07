import { DeleteAccountRequest } from "@/components/account/DeleteAccountRequest";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { RecentUpdates } from "@/components/ui/recent-updates";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, LineChart, LockKeyhole, Monitor, Moon, Search, Sun, Target, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PASSWORD_RULES, passwordMeetsRules } from "@/pages/auth/auth-ui";
import { Card, EmptyState, Loading, PageHeader, StatCard, errorMessage, formatDate, tpoApi, type Notify } from "@/pages/tpo/tpo-core";
import { AccessHistoryPanel, StudentActionPlanPanel } from "@/components/workflow/workflow-panels";
import { type Guidance, type ToolCategory, TOOL_CATEGORIES, AgentRing, ScoreRing, bandLabel, buildTools, greeting, nextBestAction, type ReadinessPayload, type View } from "./st-core";

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
          <span className="st-tag">Recommended next</span>
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
        <Card title="Career Studio" description="Pick up where you left off." actions={<button type="button" className="tp-btn ghost sm" onClick={() => go("Agents")}>View all <ArrowRight size={14} aria-hidden="true" /></button>} flush>
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
  const [filter, setFilter] = useState<"all" | ToolCategory>("all");
  const [query, setQuery] = useState("");
  const started = tools.filter(tool => tool.done).length;
  // The first tool the student hasn't tried yet, in the order that suits their programme.
  const recommended = tools.find(tool => !tool.done)?.view;
  const q = query.trim().toLowerCase();
  const shown = tools.filter(tool => (filter === "all" || tool.category === filter) && (!q || `${tool.name} ${tool.description}`.toLowerCase().includes(q)));
  const chips = [{ id: "all" as const, label: "All" }, ...TOOL_CATEGORIES.filter(category => tools.some(tool => tool.category === category.id))];
  const count = (id: "all" | ToolCategory) => id === "all" ? tools.length : tools.filter(tool => tool.category === id).length;

  return (
    <>
      <PageHeader title="Career Studio" description="Your AI coaches for placements. Pick one, practise for real, and get scored feedback." />

      <section className="cs-studio-bar" aria-label="Your progress">
        <div><b>{started} of {tools.length}</b><span> coaches tried</span></div>
        <i className="cs-studio-track" role="progressbar" aria-valuemin={0} aria-valuemax={tools.length} aria-valuenow={started} aria-label="Coaches tried"><u style={{ width: `${tools.length ? (started / tools.length) * 100 : 0}%` }} /></i>
      </section>

      <div className="cs-studio-filters">
        <label className="cs-studio-search"><Search size={16} aria-hidden="true" /><span className="cs-sr">Search coaches</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search coaches" /></label>
        <div className="cs-chips" role="group" aria-label="Filter by skill">
          {chips.map(chip => (
            <button key={chip.id} type="button" className={filter === chip.id ? "on" : ""} aria-pressed={filter === chip.id} onClick={() => setFilter(chip.id)}>{chip.label}<small>{count(chip.id)}</small></button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Search} title="No coach matches that" text="Try a different word or clear the filter." action={<button type="button" className="tp-btn secondary" onClick={() => { setFilter("all"); setQuery(""); }}>Show all coaches</button>} />
      ) : (
        <div className="cs-studio-grid" aria-live="polite">
          {shown.map(tool => { const Icon = tool.icon; return (
            <article key={tool.view} className={`cs-agent cat-${tool.category}`}>
              <header>
                <span className="cs-agent-ic"><Icon size={22} aria-hidden="true" /></span>
                <span className="cs-agent-tags">
                  {tool.view === recommended && <em className="rec">Recommended</em>}
                  <em className={tool.done ? "done" : ""}>{tool.done ? <><Check size={12} aria-hidden="true" /> Tried</> : "Not tried"}</em>
                </span>
              </header>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
              <ul className="cs-agent-meta">{tool.done && <li>{tool.metric}</li>}<li>{TOOL_CATEGORIES.find(category => category.id === tool.category)?.label}</li></ul>
              <button type="button" className={`tp-btn ${tool.view === recommended ? "primary" : "secondary"}`} onClick={() => go(tool.view)}>{tool.cta} <ArrowRight size={16} aria-hidden="true" /></button>
            </article>
          ); })}
        </div>
      )}
    </>
  );
}

/* ───────── Progress ───────── */
export function ProgressPage({ readiness, loaded, go }: { readiness: ReadinessPayload | null; loaded: boolean; go: Go }) {
  const history = readiness?.history ?? [];
  const unlocked = Boolean(readiness?.unlocked);
  const score = readiness?.overall ?? 0;
  // Which agents count, and how much, is set per programme on the server. Each counting agent carries its weight (percent).
  const agents = readiness?.agents ?? [];
  const legacy = agents.length > 0 && agents.every(agent => agent.weight === undefined);
  const weightOf = (agent: (typeof agents)[number]) => legacy ? Math.round(100 / agents.length) : agent.weight ?? 0;
  const counted = agents.filter(agent => weightOf(agent) > 0);
  const focus = [...counted].filter(agent => agent.score < 60).sort((x, y) => (100 - y.score) * weightOf(y) - (100 - x.score) * weightOf(x)).slice(0, 3);
  const progressAgents = [...agents.map(agent => ({ ...agent, optional: false })), ...(readiness?.optionalAgents ?? []).map(agent => ({ ...agent, optional: true }))];

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
              <li key={item.key}><span><b>{item.label}</b><small>{item.used ? `${item.score}% now` : "Not started"} · counts for {weightOf(item)}%</small></span><button type="button" className="tp-btn secondary sm" onClick={() => go(item.view)}>Improve</button></li>
            ))}</ul>
          ) : <EmptyState icon={CheckCircle2} title="Strong across the board" text="Every area is at 60% or above. Keep practising to stay sharp." />}
        </Card>
      </div>

      <Card title="Score breakdown" description="Your readiness is a weighted mix of these areas.">
        <div className="st-breakdown">
          {counted.map(agent => { const value = agent.used ? agent.score : 0; return (
            <div key={agent.key}>
              <span><b>{agent.label}</b><small>{weightOf(agent)}% of score</small></span>
              <i aria-hidden="true"><u style={{ width: `${value}%` }} /></i>
              <strong>{value ? `${value}%` : "—"}</strong>
            </div>
          ); })}
        </div>
      </Card>

      <Card title="Agent progress" description={agents.length ? `${agents.filter(agent => agent.used).length} of ${agents.length} agents used` : "Your agents and their scores."}>
        {progressAgents.length ? (
          <ul className="st-agent-progress">{progressAgents.map(agent => (
            <li key={agent.key}>
              <span><b>{agent.label}</b><small>{[agent.used ? bandLabel(agent.score) : "Not started yet", agent.optional && "Optional, not in your overall score"].filter(Boolean).join(" · ")}</small></span>
              <i aria-hidden="true"><u style={{ width: `${agent.used ? agent.score : 0}%` }} /></i>
              <strong>{agent.used ? `${agent.score}%` : "—"}</strong>
              <button type="button" className="tp-btn secondary sm" onClick={() => go(agent.view)}>{agent.used ? "Practise" : "Start"}</button>
            </li>
          ))}</ul>
        ) : <EmptyState icon={Target} title="No agents yet" text="Your agents will appear here once your programme is set." action={<button type="button" className="tp-btn primary" onClick={() => go("Agents")}>See the agents</button>} />}
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
