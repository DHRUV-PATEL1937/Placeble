import express, { type ErrorRequestHandler } from "express";
import { resolve } from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ZodError } from "zod";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { institutionRouter } from "./routes/institution";
import { resumeRouter } from "./routes/resume";
import { aptitudeRouter } from "./routes/aptitude";
import { interviewRouter } from "./routes/interview";
import { matchingRouter } from "./routes/matching";
import { coverLetterRouter } from "./routes/cover-letters";
import { gdRouter } from "./routes/gd";
import { readinessRouter } from "./routes/readiness";
import { recruiterRouter } from "./routes/recruiter";
import { platformRouter } from "./routes/platform";
import { tenancyRouter } from "./routes/tenancy";
import { ensureInviteRetentionIndex } from "./models/Invite";
import { interviewUploadDirectory } from "./services/interview-storage-service";
import { bootstrapJobMatching } from "./services/matching-service";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Configure CORS for local & production origins
const configuredOrigins = env.APP_ORIGIN.split(",").map(url => url.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredOrigins.includes("*") || configuredOrigins.includes(origin)) return callback(null, true);

    try {
      const url = new URL(origin);
      const isAllowedDomain =
        url.protocol === "https:" &&
        (url.hostname.endsWith(".vercel.app") ||
         url.hostname === "ngrok-free.dev" ||
         url.hostname.endsWith(".ngrok-free.dev") ||
         url.hostname === "placeble.in" ||
         url.hostname.endsWith(".placeble.in"));

      return callback(null, isAllowedDomain);
    } catch {
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/uploads/interviews", express.static(resolve(interviewUploadDirectory())));

// Health check endpoints for Coolify / Traefik / Docker / Load Balancers
const healthHandler = (_request: express.Request, response: express.Response) => {
  response.json({
    status: "ok",
    service: "Placeble API",
    database: env.MONGODB_DB_NAME,
    timestamp: new Date().toISOString(),
  });
};

app.get("/", healthHandler);
app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

// API routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/institution", institutionRouter);
app.use("/api/v1/resume", resumeRouter);
app.use("/api/v1/aptitude", aptitudeRouter);
app.use("/api/v1/interview", interviewRouter);
app.use("/api/v1/matching", matchingRouter);
app.use("/api/v1/cover-letters", coverLetterRouter);
app.use("/api/v1/gd", gdRouter);
app.use("/api/v1/readiness", readinessRouter);
app.use("/api/v1/recruiter", recruiterRouter);
app.use("/api/v1/platform-admin", platformRouter);
app.use("/api/v1/tenancy", tenancyRouter);

app.use((_request, response) => response.status(404).json({ message: "Route not found." }));

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  if (error instanceof ZodError) return response.status(400).json({ message: "Please check the information you entered.", fields: error.flatten().fieldErrors });
  if ((error as { code?: number }).code === 11000) return response.status(409).json({ message: "That record already exists." });
  console.error(error);
  return response.status(500).json({ message: "Something went wrong. Please try again." });
};
app.use(errorHandler);

connectDatabase()
  .then(async () => {
    await ensureInviteRetentionIndex();
    const port = env.API_PORT;
    const host = env.HOST;

    const server = app.listen(port, host, () => {
      console.log(`🚀 Placeble API listening on http://${host}:${port}`);
      void bootstrapJobMatching().catch(error => console.error("Job matching bootstrap failed", error));
    });

    const shutdown = (signal: string) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("Unable to connect to MongoDB", error);
    process.exit(1);
  });
