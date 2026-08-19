import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.preprocess(value => value === "" ? undefined : value, z.string().min(20).optional());
const optionalUrl = z.preprocess(value => value === "" ? undefined : value, z.string().url().optional());

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB_NAME: z.string().default("placeble"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(5000),
  HOST: z.string().default("0.0.0.0"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["sarvam", "gemini", "openai"]).default("sarvam"),
  SARVAM_API_KEY: optionalSecret,
  SARVAM_MODEL: z.string().min(1).default("sarvam-105b"),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  EMBEDDING_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  JUDGE0_ENDPOINT: optionalUrl,
  JUDGE0_API_KEY: optionalSecret,
  SEED_DEMO_PASSWORD: z.string().min(8).optional(),
  PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(12).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables configuration:");
    const formatted = result.error.format();
    for (const [key, value] of Object.entries(formatted)) {
      if (key !== "_errors" && value && "_errors" in value && value._errors.length > 0) {
        console.error(`  - ${key}: ${value._errors.join(", ")}`);
      }
    }
    throw new Error("Invalid environment variables. Please check server logs.");
  }

  const parsed = result.data;
  // If Coolify or host platform passed PORT environment variable, use PORT as API_PORT
  const port = parsed.PORT || parsed.API_PORT;
  return {
    ...parsed,
    API_PORT: port,
  };
}

export const env = parseEnv();
