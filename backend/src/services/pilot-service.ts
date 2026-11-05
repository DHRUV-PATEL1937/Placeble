import { z } from "zod";

export type Commercial = { type?: "pilot" | "customer" | null; pilotStartsAt?: Date | null; pilotEndsAt?: Date | null; convertedAt?: Date | null; note?: string | null } | null | undefined;

const DAY = 24 * 60 * 60 * 1000;

/** What a trial looks like right now. Anything without a pilot is a customer. */
export function pilotState(commercial: Commercial, now = new Date()) {
  if (commercial?.type !== "pilot" || !commercial.pilotEndsAt) return { type: "customer" as const, endsAt: null, daysLeft: null, expired: false };
  const ms = commercial.pilotEndsAt.getTime() - now.getTime();
  return { type: "pilot" as const, endsAt: commercial.pilotEndsAt, daysLeft: Math.max(0, Math.ceil(ms / DAY)), expired: ms <= 0 };
}
export const pilotEnded = (commercial: Commercial) => pilotState(commercial).expired;

/** The end of a trial is the end of that calendar day in India, so "30 Nov" means they can use it all day on the 30th. */
const endOfDayIst = (value: string) => new Date(`${value}T23:59:59.999+05:30`);

export const commercialInput = z.object({
  type: z.enum(["pilot", "customer"]),
  /** Required for a pilot. YYYY-MM-DD. */
  pilotEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the last day of the pilot.").optional(),
  note: z.string().trim().max(300).default(""),
}).superRefine((value, context) => {
  if (value.type !== "pilot") return;
  if (!value.pilotEndsOn) return context.addIssue({ code: "custom", path: ["pilotEndsOn"], message: "Pick the last day of the pilot." });
  const end = endOfDayIst(value.pilotEndsOn);
  if (Number.isNaN(end.getTime())) return context.addIssue({ code: "custom", path: ["pilotEndsOn"], message: "That date isn’t valid." });
  if (end.getTime() > Date.now() + 366 * DAY) context.addIssue({ code: "custom", path: ["pilotEndsOn"], message: "A pilot can run for up to a year. Make them a customer for longer." });
});

/** The fields to save for a requested change. Converting keeps the pilot dates as history. */
export function commercialUpdate(input: z.infer<typeof commercialInput>, current: Commercial) {
  if (input.type === "customer") return { "commercial.type": "customer", "commercial.convertedAt": current?.type === "pilot" ? new Date() : current?.convertedAt ?? null, "commercial.note": input.note };
  return {
    "commercial.type": "pilot", "commercial.pilotStartsAt": current?.type === "pilot" && current.pilotStartsAt ? current.pilotStartsAt : new Date(),
    "commercial.pilotEndsAt": endOfDayIst(input.pilotEndsOn!), "commercial.convertedAt": null, "commercial.note": input.note,
  };
}

export const presentCommercial = (commercial: Commercial) => { const state = pilotState(commercial); return { type: state.type, pilotStartsAt: commercial?.pilotStartsAt ?? null, pilotEndsAt: state.endsAt, daysLeft: state.daysLeft, expired: state.expired, convertedAt: commercial?.convertedAt ?? null, note: commercial?.note ?? "" }; };
