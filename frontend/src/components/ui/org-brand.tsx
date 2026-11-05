import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, tpoApi, type Notify } from "@/pages/tpo/tpo-core";
import "./org-brand.css";

export type OrgBranding = { name: string; logoUrl: string; pilotEndsAt?: string | null; pilotDaysLeft?: number | null } | null | undefined;
export type UserBranding = { institution: OrgBranding; university: OrgBranding } | null | undefined;

type LogoEvent = { scope: "institution" | "university"; logoUrl: string };
const LOGO_EVENT = "placeble-logo";

/** The sidebar branding, kept in step when a logo is uploaded or removed anywhere on the page. */
export function useLiveBranding(initial: UserBranding): UserBranding {
  const [override, setOverride] = useState<Partial<Record<LogoEvent["scope"], string>>>({});
  useEffect(() => {
    const onLogo = (event: Event) => { const { scope, logoUrl } = (event as CustomEvent<LogoEvent>).detail; setOverride(current => ({ ...current, [scope]: logoUrl })); };
    window.addEventListener(LOGO_EVENT, onLogo);
    return () => window.removeEventListener(LOGO_EVENT, onLogo);
  }, []);
  if (!initial) return initial;
  return {
    institution: initial.institution ? { ...initial.institution, logoUrl: override.institution ?? initial.institution.logoUrl } : initial.institution,
    university: initial.university ? { ...initial.university, logoUrl: override.university ?? initial.university.logoUrl } : initial.university,
  };
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "•";

/** A college or university logo, or its initials when none has been uploaded. */
export function OrgMark({ name, logoUrl, size = 36 }: { name: string; logoUrl?: string; size?: number }) {
  const [failed, setFailed] = useState("");
  const show = logoUrl && failed !== logoUrl;
  return (
    <span className={`ob-mark${show ? " has-logo" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {show ? <img src={logoUrl} alt="" onError={() => setFailed(logoUrl)} /> : initials(name)}
    </span>
  );
}

/** Shown under the Placeble logo in a sidebar: the person's own college, and its university if there is one. */
export function OrgBrand({ institution, university }: { institution?: OrgBranding; university?: OrgBranding }) {
  const main = institution ?? university;
  if (!main) return null;
  const parent = institution && university ? university : null;
  const pilotDays = [main, parent].map(item => item?.pilotDaysLeft).find(value => typeof value === "number") ?? null;
  return (
    <div className="ob-brand" title={parent ? `${main.name} · ${parent.name}` : main.name}>
      <OrgMark name={main.name} logoUrl={main.logoUrl} size={40} />
      <span><b>{main.name}</b>{parent && <small>{parent.name}</small>}{pilotDays !== null && <small className="ob-pilot">Pilot · {pilotDays} day{pilotDays === 1 ? "" : "s"} left</small>}</span>
    </div>
  );
}

/** Lets someone with the right to change a logo choose a picture, see it, and remove it. */
export function LogoUploader({ name, logoUrl, accessToken, path, notify, onChanged, label = "Logo", scope = "institution" }: {
  name: string; logoUrl?: string; accessToken: string; path: string; notify: Notify; onChanged?: (logoUrl: string) => void; label?: string; scope?: LogoEvent["scope"];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = (next: string) => { onChanged?.(next); window.dispatchEvent(new CustomEvent<LogoEvent>(LOGO_EVENT, { detail: { scope, logoUrl: next } })); };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPG or WebP picture."); return; }
    if (file.size > 1024 * 1024) { setError("That picture is over 1 MB. Choose a smaller one."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const payload = await tpoApi<{ logoUrl: string }>(path, accessToken, { method: "PUT", form });
      changed(payload.logoUrl); notify("Logo updated.");
    } catch (cause) { setError(errorMessage(cause, "Could not upload the logo.")); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { await tpoApi(path, accessToken, { method: "DELETE" }); changed(""); notify("Logo removed."); }
    catch (cause) { setError(errorMessage(cause, "Could not remove the logo.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="ob-uploader">
      <OrgMark name={name} logoUrl={logoUrl} size={64} />
      <div>
        <b>{label}</b>
        <p>Shown in the sidebar for everyone at {name}. Square works best. PNG, JPG or WebP, up to 1 MB.</p>
        <div className="ob-uploader-actions">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void choose(event.target.files?.[0])} aria-label={`Choose ${label.toLowerCase()} file`} />
          <button type="button" className="tp-btn secondary sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />} {logoUrl ? "Change" : "Upload"}</button>
          {logoUrl && <button type="button" className="tp-btn ghost sm danger" disabled={busy} onClick={() => void remove()}><Trash2 size={14} aria-hidden="true" /> Remove</button>}
        </div>
        {error && <p className="ob-uploader-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
