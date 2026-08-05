import mongoose from "mongoose";
import { env } from "./env";

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 12_000,
  });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

