import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.preprocess(value => value === "" ? undefined : value, z.string().min(20).optional());
const optionalUrl = z.preprocess(value => value === "" ? undefined : value, z.string().url().optional());

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().default("placeble"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
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

export const env = envSchema.parse(process.env);
