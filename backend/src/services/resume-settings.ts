import { z } from "zod";

export const personalDetailsSchema = z.object({
  fullName: z.string().trim().max(160).default(""),
  professionalTitle: z.string().trim().max(180).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(70).default(""),
  location: z.string().trim().max(180).default(""),
  linkedin: z.string().trim().max(400).default(""),
  website: z.string().trim().max(400).default(""),
});
export const resumeDesignSchema = z.object({
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#243d4b"),
  font: z.enum(["sans", "serif"]).default("sans"),
  fontSize: z.number().min(9).max(13).default(10),
  lineHeight: z.number().min(1.15).max(1.9).default(1.5),
  margin: z.number().min(28).max(65).default(40),
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
  headerAlign: z.enum(["left", "center"]).default("left"),
  sectionStyle: z.enum(["rule", "band", "minimal"]).default("rule"),
});
export type ResumePersonalDetails = z.infer<typeof personalDetailsSchema>;
export type ResumeDesign = z.infer<typeof resumeDesignSchema>;
export type ResumeRenderOptions = { template?: string; personalDetails?: Partial<ResumePersonalDetails>; design?: Partial<ResumeDesign> };
