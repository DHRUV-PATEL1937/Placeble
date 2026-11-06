import { History } from "lucide-react";
import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

type AgentHistoryData = { score?: number; attempts: number; best: number; average: number; latest: number | null; recent: Array<{ score: number; title: string; detail: string; createdAt: string }> };

const formatDay = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const tone = (score: number) => score >= 75 ? "good" : score >= 55 ? "mid" : "low";
const band = (score: number) => score >= 75 ? "Placement ready" : score >= 60 ? "On track" : score >= 45 ? "Building up" : "Just getting started";

/** The student's progress on an agent that keeps scored results (Business Case Solver, HR Manager Simulator). `refreshKey` reloads it after a new result. */
export function AgentHistory({ path, accessToken, refreshKey = 0, empty }: { path: string; accessToken: string; refreshKey?: number; empty: string }) {
  const [data, setData] = useState<AgentHistoryData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}${path}`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })
      .then(response => response.ok ? response.json() as Promise<AgentHistoryData> : Promise.reject(new Error("history")))
      .then(payload => { if (active) { setData(payload); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [path, accessToken, refreshKey]);

  if (failed) return null;
  const agentScore = data?.score ?? data?.latest ?? 0;
  return (
    <section className="cs-card ah" aria-label="Your progress">
      <div className="ah-head"><History size={18} aria-hidden="true" /><h3>Your progress</h3>
        {Boolean(data?.attempts) && <div className="ah-score"><small>Agent score</small><strong className={tone(agentScore)}>{agentScore}<span>/100</span></strong><em>{band(agentScore)}</em></div>}
      </div>
      {!data ? <p className="ah-empty">Loading your results…</p> : !data.attempts ? <p className="ah-empty">{empty}</p> : (
        <>
          <p className="ah-note">Your agent score comes from your last three results, with the newest counting most.</p>
          <div className="ah-stats">
            <div><small>Attempts</small><strong>{data.attempts}</strong></div>
            <div><small>Latest</small><strong className={tone(data.latest ?? 0)}>{data.latest ?? "—"}</strong></div>
            <div><small>Best</small><strong className={tone(data.best)}>{data.best}</strong></div>
            <div><small>Average</small><strong className={tone(data.average)}>{data.average}</strong></div>
          </div>
          <ul className="ah-list">{data.recent.map(item => (
            <li key={item.createdAt}>
              <span><b>{item.title || "Practice run"}</b><small>{[item.detail, formatDay(item.createdAt)].filter(Boolean).join(" · ")}</small></span>
              <em className={tone(item.score)}>{item.score}</em>
            </li>
          ))}</ul>
        </>
      )}
    </section>
  );
}
