import { useEffect, useRef, useState } from "react";
import "./circular-topic-map.css";

type Topic = { topic: string; category: string; score: number; attempts: number };
const label = (value: string) => value.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const color = (score: number) => score < 30 ? "#f25265" : score < 70 ? "#eba923" : "#16ad81";

export function CircularTopicMap<T extends Topic>({ items, busy, onPractice }: { items: T[]; busy: boolean; onPractice: (item: T) => void }) {
  const [displayItems, setDisplayItems] = useState(items);
  const [transitioning, setTransitioning] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(640);
  const mapRef = useRef<HTMLDivElement>(null);
  const signature = items.map(item => `${item.category}:${item.topic}:${item.score}:${item.attempts}`).join("|");
  const latestItems = useRef(items);
  latestItems.current = items;
  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setCanvasWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setTransitioning(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setDisplayItems(latestItems.current);
      setHoveredKey("");
      setTransitioning(false);
    }, reduced ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [signature]);
  const [selectedKey, setSelectedKey] = useState("");
  const [hoveredKey, setHoveredKey] = useState("");
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    const animate = (now: number) => {
      if (previous && !pointerInside && !focusInside && !motion.matches) {
        const elapsed = Math.min(now - previous, 64);
        setRotation(value => (value + elapsed * Math.PI * 2 / 120000) % (Math.PI * 2));
      }
      previous = now;
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [pointerInside, focusInside]);
  const selected = displayItems.find(item => `${item.category}:${item.topic}` === selectedKey) ?? displayItems[0];
  const perRing = 28;
  const rings = Math.ceil(displayItems.length / perRing);
  const size = 640 + Math.max(0, rings - 1) * 120;
  const center = size / 2;
  const showNames = displayItems.length <= (canvasWidth < 450 ? 4 : 8);
  return <div ref={mapRef} className={`circular-topic-map ${transitioning ? "is-filtering" : ""}`} aria-busy={transitioning} onMouseEnter={() => setPointerInside(true)} onMouseLeave={() => { setPointerInside(false); setHoveredKey(""); }} onFocusCapture={() => setFocusInside(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocusInside(false); setHoveredKey(""); } }}>
    <div key={displayItems.map(item => `${item.category}:${item.topic}`).join("|")} className="ctm-canvas">
      <svg viewBox={`0 0 ${size} ${size}`} aria-label={`Circular readiness map of all ${items.length} topics`}>
        {Array.from({ length: rings }, (_, ring) => <circle key={ring} cx={center} cy={center} r={238 + ring * 60} className="ctm-track" />)}
        {displayItems.map((item, index) => {
          const ring = Math.floor(index / perRing);
          const count = Math.min(perRing, displayItems.length - ring * perRing);
          const angle = (index % perRing / count) * Math.PI * 2 - Math.PI / 2 + rotation;
          const radius = 238 + ring * 60;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const active = item === selected;
          return <g key={`${item.category}:${item.topic}`}>
            {active && <line x1={center + Math.cos(angle) * 130} y1={center + Math.sin(angle) * 130} x2={x} y2={y} stroke={color(item.score)} strokeOpacity=".3" strokeDasharray="3 6" />}
            <g role="button" tabIndex={0} aria-label={`${label(item.topic)}, ${item.score}% readiness`} aria-pressed={active} className={`ctm-node ${active ? "is-selected" : ""}`} onMouseEnter={() => setHoveredKey(`${item.category}:${item.topic}`)} onMouseLeave={() => setHoveredKey("")} onFocus={() => setHoveredKey(`${item.category}:${item.topic}`)} onBlur={() => setHoveredKey("")} onClick={() => setSelectedKey(`${item.category}:${item.topic}`)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(`${item.category}:${item.topic}`); } }}>
              {showNames ? <foreignObject x={x - 75} y={y - 26} width={150} height={52}><div className={`ctm-name-node ${active ? "selected" : ""}`} style={{ borderColor: color(item.score) }}><span>{label(item.topic)}</span><b style={{ color: color(item.score) }}>{item.score}%</b></div></foreignObject> : <><circle cx={x} cy={y} r={active ? 24 : 20} className="ctm-node-bg" stroke={color(item.score)} strokeWidth={active ? 3 : 1.5}/>
              <circle cx={x} cy={y} r={active ? 19 : 16} fill={color(item.score)} fillOpacity=".09"/>
              <text x={x} y={y + 4} textAnchor="middle" fill={color(item.score)}>{index + 1}</text></>}
            </g>
          </g>;
        })}
      </svg>
      {displayItems.map((item, index) => {
        if (`${item.category}:${item.topic}` !== hoveredKey) return null;
        const ring = Math.floor(index / perRing);
        const count = Math.min(perRing, displayItems.length - ring * perRing);
        const angle = (index % perRing / count) * Math.PI * 2 - Math.PI / 2 + rotation;
        const radius = 238 + ring * 60;
        return <div role="tooltip" key={hoveredKey} className={`ctm-tooltip ${Math.sin(angle) < -.6 ? "below" : ""}`} style={{ left: `${(center + Math.cos(angle) * radius) / size * 100}%`, top: `${(center + Math.sin(angle) * radius) / size * 100}%` }}><small>TOPIC {index + 1}</small><strong>{label(item.topic)}</strong><span><i style={{ background: color(item.score) }}/>{item.score}% readiness · {item.attempts} answered</span></div>;
      })}
      {selected ? <div key={`${selected.category}:${selected.topic}`} className="ctm-detail" aria-live="polite"><small>{selected.category === "quant" ? "Quantitative" : selected.category === "verbal" ? "Verbal ability" : "Logical reasoning"}</small><h4>{label(selected.topic)}</h4><strong style={{ color: color(selected.score) }}>{selected.score}<span>%</span></strong><p>{selected.attempts} questions answered</p><button disabled={busy} onClick={() => onPractice(selected)}>Practice topic <span>↗</span></button></div> : <div className="ctm-detail ctm-empty" role="status"><h4>No matching topics</h4><p>Try another filter or search.</p></div>}
    </div>
    <footer><span><i style={{ background: "#f25265" }}/>Needs attention</span><span><i style={{ background: "#eba923" }}/>Improving</span><span><i style={{ background: "#16ad81" }}/>Strong</span></footer>
    <p className="ctm-hint">{displayItems.length} {displayItems.length === 1 ? "topic" : "topics"} · Hover to pause · Select a topic to explore</p>
  </div>;
}
