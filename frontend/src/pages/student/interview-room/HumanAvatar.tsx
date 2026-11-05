import type { CSSProperties } from "react";

export type Look = {
  skin: string; skinShade: string; hair: string; outfit: string; shirt: string;
  style: "short" | "side" | "long"; glasses?: boolean; beard?: boolean; backdrop: [string, string];
  /** Delays blinking so the three people don't blink in unison. */
  blink: number;
};

export const LOOKS: Record<"hr" | "technical" | "behavioral", Look> = {
  hr: { skin: "#eab794", skinShade: "#d89f79", hair: "#2a2019", outfit: "#27375f", shirt: "#f3f5fb", style: "short", backdrop: ["#3a4a78", "#1c2745"], blink: 0 },
  technical: { skin: "#b87c54", skinShade: "#a2683f", hair: "#17120e", outfit: "#353c4c", shirt: "#dfe5f0", style: "side", glasses: true, beard: true, backdrop: ["#2f6b62", "#16342f"], blink: 1.6 },
  behavioral: { skin: "#f2d0b4", skinShade: "#e2b793", hair: "#7a4727", outfit: "#2d6e6a", shirt: "#f5f1ea", style: "long", backdrop: ["#7a4b66", "#33203a"], blink: 3.1 },
};

/** A friendly illustrated person on a video call. They blink, and nod and move their mouth while speaking. */
export function HumanAvatar({ look, speaking = false, label }: { look: Look; speaking?: boolean; label: string }) {
  const id = label.replace(/\W/g, "");
  return (
    <svg className={`ir-avatar${speaking ? " speaking" : ""}`} viewBox="0 0 200 200" role="img" aria-label={label} style={{ "--blink-delay": `${look.blink}s`, "--bd1": look.backdrop[0], "--bd2": look.backdrop[1] } as CSSProperties}>
      <defs>
        <radialGradient id={`glow-${id}`} cx="0.5" cy="0.35" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity="0.22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#glow-${id})`} />
      {/* soft office shapes behind them */}
      <rect x="14" y="40" width="34" height="74" rx="4" fill="#fff" opacity="0.06" /><rect x="156" y="52" width="30" height="62" rx="4" fill="#fff" opacity="0.05" />

      <g className="ir-body">
        {look.style === "long" && <path d="M62 84 C52 130 58 168 70 176 L130 176 C142 168 148 130 138 84 Z" fill={look.hair} />}
        {/* shoulders + collar */}
        <path d="M18 200 C18 164 56 152 100 152 C144 152 182 164 182 200 Z" fill={look.outfit} />
        <path d="M80 153 L100 182 L120 153 Z" fill={look.shirt} />
        <path d="M100 160 L94 200 L106 200 Z" fill="#000" opacity="0.1" />
        {/* neck */}
        <path d="M86 122 h28 v32 q-14 12 -28 0 z" fill={look.skinShade} />

        <g className="ir-head">
          {/* ears + head */}
          <circle cx="65" cy="97" r="6.5" fill={look.skinShade} /><circle cx="135" cy="97" r="6.5" fill={look.skinShade} />
          <ellipse cx="100" cy="92" rx="35" ry="41" fill={look.skin} />
          {/* hair */}
          {look.style === "short" && <path d="M64 90 C60 50 86 42 102 42 C124 42 142 54 136 90 C130 72 118 64 100 64 C84 64 70 72 64 90 Z" fill={look.hair} />}
          {look.style === "side" && <path d="M64 92 C58 52 88 40 104 41 C128 42 144 58 136 92 C132 76 122 66 104 62 C92 66 74 70 64 92 Z" fill={look.hair} />}
          {look.style === "long" && <path d="M63 96 C56 50 84 40 102 40 C126 40 146 54 137 96 C134 74 120 62 102 60 C84 62 66 72 63 96 Z" fill={look.hair} />}
          {/* brows */}
          <path d="M77 78 q9 -6 18 -1" stroke={look.hair} strokeWidth="3" strokeLinecap="round" fill="none" /><path d="M105 77 q9 -5 18 1" stroke={look.hair} strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* eyes */}
          <g className="ir-eyes">
            <ellipse cx="86" cy="92" rx="6.5" ry="5.5" fill="#fff" /><ellipse cx="114" cy="92" rx="6.5" ry="5.5" fill="#fff" />
            <circle cx="87" cy="92.5" r="3.4" fill="#2b2b33" /><circle cx="115" cy="92.5" r="3.4" fill="#2b2b33" />
            <circle cx="88" cy="91.2" r="1" fill="#fff" /><circle cx="116" cy="91.2" r="1" fill="#fff" />
            <rect className="ir-lid" x="78" y="85.5" width="16" height="13" fill={look.skin} /><rect className="ir-lid" x="106" y="85.5" width="16" height="13" fill={look.skin} />
          </g>
          {look.glasses && <g fill="none" stroke="#1b1d27" strokeWidth="2.2"><rect x="76" y="84" width="21" height="16" rx="6" /><rect x="103" y="84" width="21" height="16" rx="6" /><path d="M97 91 h6" /><path d="M76 90 L66 88 M124 90 L134 88" /></g>}
          {/* nose */}
          <path d="M100 96 q-4 12 1 16 q3 1 6 -1" stroke={look.skinShade} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          {look.beard && <path d="M67 106 C68 138 86 146 100 146 C114 146 132 138 133 106 C128 124 116 130 100 130 C84 130 72 124 67 106 Z" fill={look.hair} opacity="0.88" />}
          {/* mouth: a smile at rest, an animated opening when speaking */}
          <path className="ir-smile" d="M88 118 Q100 128 112 118" stroke="#8a3b3b" strokeWidth="3" strokeLinecap="round" fill="none" />
          <ellipse className="ir-mouth" cx="100" cy="120" rx="8.5" ry="4" fill="#7a2c34" />
          <path className="ir-teeth" d="M93 117.5 q7 -2.4 14 0 v2.4 h-14 z" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
