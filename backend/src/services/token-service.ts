import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { RefreshSession } from "../models/RefreshSession";
import type { UserDocument } from "../models/User";

const ACCESS_EXPIRY_SECONDS = 15 * 60;
const REFRESH_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOKIE = "placeble_refresh";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function userPayload(user: UserDocument) {
  return {
    userId: user._id.toString(),
    role: user.role,
    ...(user.institutionId ? { institutionId: user.institutionId.toString() } : {}),
  };
}

export function signAccessToken(user: UserDocument) {
  return jwt.sign(userPayload(user), env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY_SECONDS });
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
  return signAccessToken(user);
}

export function setRefreshCookie(response: Response, token: string) {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_EXPIRY_SECONDS * 1000,
    path: "/api/v1/auth",
  });
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

export function readRefreshToken(request: Request) {
  return request.cookies?.[REFRESH_COOKIE] as string | undefined;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload & { userId: string };
}

