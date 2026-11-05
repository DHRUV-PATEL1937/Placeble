import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { RefreshSession } from "../models/RefreshSession";
import type { UserDocument } from "../models/User";

const ACCESS_EXPIRY_SECONDS = 15 * 60;
// Like most apps: stay signed in for 30 days of use (the window slides forward each time the token rotates).
const REFRESH_EXPIRY_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_COOKIE = "placeble_refresh";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function userPayload(user: UserDocument) {
  return {
    userId: user._id.toString(),
    role: user.role,
    ...(user.institutionId ? { institutionId: user.institutionId.toString() } : {}),
    ...(user.universityId ? { universityId: user.universityId.toString() } : {}),
    ...(user.recruiterOrgId ? { recruiterOrgId: user.recruiterOrgId.toString() } : {}),
  };
}

export function signAccessToken(user: UserDocument) {
  return jwt.sign(userPayload(user), env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY_SECONDS });
}

/** Access token for a university TPO working inside one of its institutes. Same lifetime, never refreshable on its own. */
export function signActingAccessToken(user: UserDocument, institutionId: string) {
  return jwt.sign({ ...userPayload(user), actingInstitutionId: institutionId }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY_SECONDS });
}

function signRefreshToken(user: UserDocument) {
  return jwt.sign(userPayload(user), env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRY_SECONDS,
    jwtid: crypto.randomUUID(),
  });
}

export async function createSession(user: UserDocument, request: Request, response: Response) {
  const refreshToken = signRefreshToken(user);
  await RefreshSession.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_EXPIRY_SECONDS * 1000),
    userAgent: request.get("user-agent") ?? "",
    ipAddress: request.ip ?? "",
  });
  setRefreshCookie(response, refreshToken);
  // The Android/iOS app keeps its own copy in the phone's encrypted storage (a WebView cookie can be lost when the app is closed).
  if (isNativeApp(request)) response.locals.appRefreshToken = refreshToken;
  return signAccessToken(user);
}

export const isNativeApp = (request: Request) => request.get("x-placeble-app") === "1";

export function setRefreshCookie(response: Response, token: string) {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // Production uses separate frontend and API sites, so Strict prevents the
    // browser from sending this cookie during a normal cross-site refresh.
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: REFRESH_EXPIRY_SECONDS * 1000,
    path: "/api/v1/auth",
  });
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/v1/auth",
  });
}

export function readRefreshToken(request: Request) {
  // The app's stored token is always the newest one it knows, so it wins over a possibly stale WebView cookie.
  const fromApp = isNativeApp(request) ? (request.body as { refreshToken?: unknown } | undefined)?.refreshToken : undefined;
  if (typeof fromApp === "string" && fromApp.length > 20 && fromApp.length < 2000) return fromApp;
  return request.cookies?.[REFRESH_COOKIE] as string | undefined;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload & { userId: string };
}
