import { useEffect, useRef, useState } from "react";

export function ReadinessScoreRing({ score, compact = false, label = "Readiness" }: { score: number; compact?: boolean; label?: string }) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [displayScore, setDisplayScore] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplayScore(target); return; }
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const radius = compact ? 19 : 80;
  const stroke = compact ? 4 : 10;
  const size = compact ? 48 : 190;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const dashOffset = circumference * (1 - displayScore / 100);
  return <div className={`score-ring ${compact ? "score-ring--compact" : ""}`}>
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${displayScore} out of 100`}>
      <circle className="score-track" cx={center} cy={center} r={radius} strokeWidth={stroke} />
      <circle className="score-progress" cx={center} cy={center} r={radius} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={dashOffset} />
    </svg>
    <div className="score-value"><strong>{displayScore}</strong>{!compact && <span>out of 100</span>}</div>
  </div>;
}
