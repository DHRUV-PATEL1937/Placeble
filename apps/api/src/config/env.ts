import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().default("placeble"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  SEED_DEMO_PASSWORD: z.string().min(8).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);

