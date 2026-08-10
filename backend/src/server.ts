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
import { interviewUploadDirectory } from "./services/interview-storage-service";
import { bootstrapJobMatching } from "./services/matching-service";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.APP_ORIGIN) return callback(null, true);
    try {
      const url = new URL(origin);
      return callback(null, url.protocol === "https:" && (url.hostname === "ngrok-free.dev" || url.hostname.endsWith(".ngrok-free.dev")));
    } catch { return callback(null, false); }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/uploads/interviews", express.static(resolve(interviewUploadDirectory())));

app.get("/api/v1/health", (_request, response) => response.json({ status: "ok", database: env.MONGODB_DB_NAME }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/institution", institutionRouter);
app.use("/api/v1/resume", resumeRouter);
app.use("/api/v1/aptitude", aptitudeRouter);
app.use("/api/v1/interview", interviewRouter);
app.use("/api/v1/matching", matchingRouter);
app.use("/api/v1/cover-letters", coverLetterRouter);
app.use("/api/v1/gd", gdRouter);

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
  .then(() => app.listen(env.API_PORT, () => { console.log(`Placeble API ready on http://localhost:${env.API_PORT}`); void bootstrapJobMatching().catch(error => console.error("Job matching bootstrap failed", error)); }))
  .catch((error) => {
    console.error("Unable to connect to MongoDB", error);
    process.exit(1);
  });
