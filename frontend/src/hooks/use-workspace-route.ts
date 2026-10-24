import { useCallback, useEffect, useState } from "react";

const normalize = (value: string) => value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function useWorkspaceRoute<T extends string>(base: string, views: readonly T[], fallback: T) {
  const fromLocation = useCallback(() => {
    const slug = window.location.pathname.replace(new RegExp(`^/${base}/?`), "").split("/")[0];
    return views.find(view => normalize(view) === slug) ?? fallback;
  }, [base, fallback, views]);
  const [view, setViewState] = useState<T>(fromLocation);

  useEffect(() => {
    const onPopState = () => setViewState(fromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fromLocation]);

  useEffect(() => {
    const expected = `/${base}/${normalize(view)}`;
    if (window.location.pathname !== expected) window.history.replaceState({ view }, "", expected);
  }, [base, view]);

  const navigate = useCallback((next: T, options?: { replace?: boolean }) => {
    const path = `/${base}/${normalize(next)}`;
    window.history[options?.replace ? "replaceState" : "pushState"]({ view: next }, "", path);
    setViewState(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [base]);

  return [view, navigate] as const;
}

export function workspacePath(base: string, view: string) {
  return `/${base}/${normalize(view)}`;
}
