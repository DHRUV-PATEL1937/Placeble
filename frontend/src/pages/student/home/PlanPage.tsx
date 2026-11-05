import { Check, Crown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, ErrorState, Loading, Modal, PageHeader, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";

type Summary = {
  covered: boolean; paymentsEnabled?: boolean; plan?: "free" | "pro" | "institute"; interval?: string | null; renewsAt?: string | null; resetsAt?: string;
  prices?: { monthly: number; yearly: number; currency: string };
  features?: Array<{ feature: string; label: string; used: number; limit: number | null }>;
};
const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

type CheckoutOrder = { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill: { name: string; email: string } };
type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayWindow = Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void } };

/** Razorpay's own checkout script, loaded only when someone is about to pay. */
function loadCheckout() {
  return new Promise<boolean>(resolve => {
    if ((window as RazorpayWindow).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** Starts an upgrade: create the order on our server, take payment in Razorpay Checkout, then let the server confirm it. */
function useUpgrade(accessToken: string, onPaid?: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paid, setPaid] = useState(false);
  const start = async (interval: "monthly" | "yearly") => {
    setBusy(true); setMessage(""); setPaid(false);
    try {
      const order = await tpoApi<CheckoutOrder>("/billing/checkout", accessToken, { method: "POST", json: { interval } });
      if (!(await loadCheckout()) || !(window as RazorpayWindow).Razorpay) throw new Error("We couldn’t load the payment window. Check your connection and try again.");
      const Razorpay = (window as RazorpayWindow).Razorpay!;
      await new Promise<void>(resolve => {
        const checkout = new Razorpay({
          key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency, name: order.name, description: order.description,
          prefill: order.prefill, theme: { color: "#243d4b" },
          handler: (result: RazorpayResult) => {
            tpoApi("/billing/verify", accessToken, { method: "POST", json: result })
              .then(() => { setPaid(true); onPaid?.(); })
              .catch(cause => setMessage(errorMessage(cause, "We couldn’t confirm your payment. If money was taken, it will be matched automatically.")))
              .finally(resolve);
          },
          modal: { ondismiss: () => resolve() },
        });
        checkout.on("payment.failed", response => setMessage(response.error?.description ?? "The payment didn’t go through. You haven’t been charged."));
        checkout.open();
      });
    } catch (cause) { setMessage(errorMessage(cause, "Could not start the upgrade.")); }
    finally { setBusy(false); }
  };
  return { busy, message, paid, start };
}

export function PlanPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Summary>("/billing/me", accessToken), [accessToken]);
  const upgrade = useUpgrade(accessToken, () => { reload(); notify("You’re on Pro. Thank you!"); });
  if (loading && !data) return <><PageHeader title="Plan" /><Card><Loading label="Loading your plan…" /></Card></>;
  if (error || !data) return <><PageHeader title="Plan" /><Card><ErrorState message={error || "Could not load your plan."} onRetry={reload} /></Card></>;
  if (data.covered) return <><PageHeader title="Plan" /><Card><p>Your college covers your access, so there’s nothing to buy.</p></Card></>;
  const pro = data.plan === "pro";

  return (
    <>
      <PageHeader title="Plan" description={pro ? "You’re on Pro. Everything is unlocked." : "You’re on the free plan. Upgrade any time for unlimited practice."} />
      <div className="tp-grid two">
        <Card title="This month’s usage" description={pro ? "No limits on Pro." : data.resetsAt ? `Resets on ${formatDate(data.resetsAt)}.` : undefined}>
          <ul className="st-meters">
            {data.features?.map(item => {
              const share = item.limit ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
              return (
                <li key={item.feature}>
                  <span><b>{item.label.charAt(0).toUpperCase() + item.label.slice(1)}</b><small>{item.limit === null ? `${item.used} used · unlimited` : `${item.used} of ${item.limit} used`}</small></span>
                  {item.limit !== null && <i aria-hidden="true"><u className={share >= 100 ? "full" : ""} style={{ width: `${share}%` }} /></i>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={pro ? "Your Pro plan" : "Go Pro"} description={pro && data.renewsAt ? `Active until ${formatDate(data.renewsAt)}${data.interval ? ` · ${data.interval}` : ""}` : "Unlimited AI resume help, mock interviews, aptitude tests, cover letters and group discussions."}>
          {pro ? <p className="st-pro-note"><Crown size={16} aria-hidden="true" /> Thanks for being on Pro. You can renew any time from here. To cancel, contact support.</p> : (
            <>
              <div className="st-prices">
                <article><small>Monthly</small><strong>{rupees(data.prices!.monthly)}<span>/month</span></strong><button type="button" className="tp-btn secondary" disabled={upgrade.busy} onClick={() => void upgrade.start("monthly")}>Choose monthly</button></article>
                <article className="best"><em>Best value</em><small>Yearly</small><strong>{rupees(data.prices!.yearly)}<span>/year</span></strong><p>Save {Math.max(0, Math.round((1 - data.prices!.yearly / (data.prices!.monthly * 12)) * 100))}%</p><button type="button" className="tp-btn primary" disabled={upgrade.busy} onClick={() => void upgrade.start("yearly")}>Choose yearly</button></article>
              </div>
              {upgrade.message && <div className="tp-alert warn" role="status">{upgrade.message}</div>}
              {data.paymentsEnabled === false && <p className="tp-field-hint">Online payments are being set up. Contact support to upgrade in the meantime.</p>}
              <ul className="st-perks"><li><Check size={15} aria-hidden="true" /> Unlimited AI resume actions</li><li><Check size={15} aria-hidden="true" /> Unlimited mock interviews and aptitude tests</li><li><Check size={15} aria-hidden="true" /> Unlimited cover letters and group discussions</li></ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/** Shown wherever a free-plan limit is hit, no matter which tool the student was using. */
export function LimitModal({ accessToken, onSeePlans }: { accessToken: string; onSeePlans: () => void }) {
  const [info, setInfo] = useState<{ message: string; resetsAt?: string } | null>(null);
  const upgrade = useUpgrade(accessToken);
  useEffect(() => {
    const handler = (event: Event) => setInfo((event as CustomEvent).detail);
    window.addEventListener("placeble:limit", handler);
    return () => window.removeEventListener("placeble:limit", handler);
  }, []);
  if (!info) return null;
  return (
    <Modal title="You’ve reached your free limit" description={info.message} onClose={() => setInfo(null)}>
      <div className="st-limit"><span aria-hidden="true"><Sparkles size={22} /></span><p>Go Pro for unlimited practice, or come back {info.resetsAt ? `on ${formatDate(info.resetsAt)}` : "next month"} when your free allowance resets.</p></div>
      {upgrade.message && <div className="tp-alert warn" role="status">{upgrade.message}</div>}
      <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setInfo(null)}>Not now</button><button type="button" className="tp-btn primary" onClick={() => { setInfo(null); onSeePlans(); }}>See plans</button></footer>
    </Modal>
  );
}
