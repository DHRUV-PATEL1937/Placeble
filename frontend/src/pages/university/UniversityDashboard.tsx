import type { UserBranding } from "@/components/ui/org-brand";
import { TpoDashboard } from "@/pages/tpo/TpoDashboard";

/** A university TPO is a TPO with extra reach: the same dashboard, plus a University section to move between institutes. */
export function UniversityDashboard({ user, accessToken, onLogout, branding }: { user: { name: string; email: string }; accessToken: string; onLogout: () => void; branding?: UserBranding }) {
  return <TpoDashboard user={{ name: user.name, email: user.email, role: "tpo" }} accessToken={accessToken} onLogout={onLogout} university branding={branding} />;
}
