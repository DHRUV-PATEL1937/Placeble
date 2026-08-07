export function ReadinessScoreRing({ score, compact = false, label = "Readiness" }: { score: number; compact?: boolean; label?: string }) {
  const radius = compact ? 19 : 80;
  const stroke = compact ? 4 : 10;
  const size = compact ? 48 : 190;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const dashOffset = circumference * (1 - score / 100);
  return <div className={`score-ring ${compact ? "score-ring--compact" : ""}`}>
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${score} out of 100`}>
      <circle className="score-track" cx={center} cy={center} r={radius} strokeWidth={stroke} />
      <circle className="score-progress" cx={center} cy={center} r={radius} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={dashOffset} />
    </svg>
    <div className="score-value"><strong>{score}</strong>{!compact && <span>out of 100</span>}</div>
  </div>;
}
