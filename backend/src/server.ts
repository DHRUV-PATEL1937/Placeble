import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ZodError } from "zod";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { institutionRouter } from "./routes/institution";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: env.APP_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/v1/health", (_request, response) => response.json({ status: "ok", database: env.MONGODB_DB_NAME }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/institution", institutionRouter);

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
  .then(() => app.listen(env.API_PORT, () => console.log(`Placeble API ready on http://localhost:${env.API_PORT}`)))
  .catch((error) => {
    console.error("Unable to connect to MongoDB", error);
    process.exit(1);
  });
