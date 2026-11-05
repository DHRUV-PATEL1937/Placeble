import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Role = "student" | "tpo" | "recruiter" | "faculty" | "platform_admin" | "university_admin" | "principal";
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "active" | "suspended";
  emailVerified: boolean;
  mustChangePassword?: boolean;
  accountType?: "direct" | "institute" | null;
  onboarding?: { state: "needed" | "guardian_pending" | "guardian_declined" | "done" } | null;
  graduate?: { endedAt: string; closesAt: string } | null;
  guidance?: { programCode: string | null; programName: string; interviewStyle: "technical" | "business" | "mixed"; roles: string[]; tools?: { coding: boolean } } | null;
  plan?: { plan: "free" | "pro"; interval: string | null; renewsAt: string | null } | null;
  institutionId: string | null;
  universityId?: string | null;
  branding?: { institution: { name: string; logoUrl: string } | null; university: { name: string; logoUrl: string } | null } | null;
  tpoPermissions?: { roster: boolean; approvals: boolean; recruiters: boolean; settings: boolean; messaging: boolean } | null;
  recruiterOrgId?: string | null;
  studentVerificationStatus?: "pending_tpo_approval" | "approved" | "rejected" | "roster_matched" | "pending_domain_approval" | null;
  onboardingCompleted: boolean;
  destination: string;
};

export const API_URL = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && window.location.hostname === "localhost" ? "/api/v1" : "https://api.placeble.in/api/v1");

export function Brand() {
  return <picture className="auth-brand-logo"><img className="auth-brand-logo-light" src="/placeble-logo-horizontal-color.svg" alt="Placeble" /><img className="auth-brand-logo-dark" src="/placeble-logo-horizontal-reversed.svg" alt="" /></picture>;
}

export function ThemeToggle({ className = "auth-theme-toggle" }: { className?: string }) {
  const [dark, setDark] = useState(() => {
    const saved = window.localStorage.getItem("placeble-theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("placeble-theme", next ? "dark" : "light");
  };
  return <button className={className} type="button" onClick={toggle} aria-label={dark ? "Use light mode" : "Use dark mode"} title={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

/**
 * Inside the Placeble mobile app the shell keeps the refresh token in the phone's encrypted storage
 * (WebView cookies can be lost when the app is closed). These helpers pass it to and from the shell.
 */
type NativeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void }; __PLACEBLE_REFRESH__?: string | null };
const nativeWindow = () => window as NativeWindow;
const inNativeApp = () => Boolean(nativeWindow().ReactNativeWebView);
function tellShell(message: { type: "refresh-token"; token: string } | { type: "clear" }) {
  try { nativeWindow().ReactNativeWebView?.postMessage(JSON.stringify(message)); } catch { /* the cookie still works as a fallback */ }
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);
  const native = inNativeApp();
  const sessionCall = path === "/auth/refresh" || path === "/auth/logout";
  const stored = nativeWindow().__PLACEBLE_REFRESH__;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      ...(native && sessionCall && stored ? { body: JSON.stringify({ refreshToken: stored }) } : {}),
      signal: options.signal ?? controller.signal,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(native ? { "X-Placeble-App": "1" } : {}), ...options.headers },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (native) {
      if (typeof payload?.refreshToken === "string") { nativeWindow().__PLACEBLE_REFRESH__ = payload.refreshToken; tellShell({ type: "refresh-token", token: payload.refreshToken }); }
      else if (path === "/auth/logout" || (path === "/auth/refresh" && response.status === 401)) { nativeWindow().__PLACEBLE_REFRESH__ = null; tellShell({ type: "clear" }); }
    }
    if (!response.ok && response.status !== 202) {
      const fieldMessage = Object.values(payload?.fields ?? {}).flat().find(value => typeof value === "string");
      const error = new Error(fieldMessage ?? payload?.message ?? "Something went wrong. Please try again.") as Error & { code?: string; status?: number };
      error.code = payload?.code;
      error.status = response.status;
      throw error;
    }
    return { response, payload };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
