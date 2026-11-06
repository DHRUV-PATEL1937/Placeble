import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Starts at 0 and settles on `target` after the first paint, so a CSS transition draws rings and bars in instead of snapping. */
export function useDrawIn(target: number, delay = 80) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    const id = window.setTimeout(() => setValue(target), delay);
    return () => window.clearTimeout(id);
  }, [target, delay]);
  return value;
}

/** Counts a number up (or down) to `target` with an ease-out curve. Under reduced motion it jumps straight there. */
export function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const current = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) { current.current = target; setValue(target); return; }
    const origin = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = origin + (target - origin) * (1 - Math.pow(1 - progress, 3));
      current.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return Math.round(value);
}

/**
 * Lets the sheet follow a downward drag on its grab handle and close when it is pulled far enough or flicked.
 * The element moves with the finger; letting go below the threshold springs it back.
 */
export function useSheetDrag(sheet: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const state = useRef<{ startY: number; startAt: number; dy: number } | null>(null);
  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      state.current = { startY: event.clientY, startAt: performance.now(), dy: 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (sheet.current) sheet.current.style.transition = "none";
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const drag = state.current;
      if (!drag || !sheet.current) return;
      drag.dy = Math.max(0, event.clientY - drag.startY);
      sheet.current.style.transform = `translateY(${drag.dy}px)`;
    },
    onPointerUp() {
      const drag = state.current;
      state.current = null;
      const element = sheet.current;
      if (!drag || !element) return;
      const velocity = drag.dy / Math.max(1, performance.now() - drag.startAt);
      element.style.transition = "";
      if (drag.dy > element.offsetHeight * 0.3 || velocity > 0.6) onClose();
      else element.style.transform = "";
    },
  };
  return handlers;
}

/** Marks the page once it has scrolled, so the top bar can gain a soft shadow. */
export function installScrollFlag() {
  const root = document.documentElement;
  let ticking = false;
  const update = () => { ticking = false; root.dataset.scrolled = window.scrollY > 4 ? "true" : "false"; };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
