import { ArrowLeft, Code2 } from "lucide-react";
import { CodingArena } from "./CodingArenaPage";

/** Coding practice is its own tool, separate from the aptitude test. Only programmes that include it get it. */
export function CodingPractice({ accessToken, onBack, available }: { accessToken: string; onBack: () => void; available: boolean }) {
  return (
    <div className="view-content inner-view aptitude-view">
      <header className="apt-module-top">
        <button onClick={onBack}><ArrowLeft size={17} /> All agents</button>
        <div><span><Code2 size={16} /></span><strong>Coding practice</strong></div>
      </header>
      {available ? <CodingArena accessToken={accessToken} /> : (
        <section className="panel" style={{ padding: 28 }}>
          <h2>Coding practice isn’t part of your programme</h2>
          <p style={{ marginTop: 8, color: "var(--text-secondary)" }}>Your practice tools are tailored to your programme. Aptitude, mock interviews and your resume are all available from the practice tools page.</p>
        </section>
      )}
    </div>
  );
}
