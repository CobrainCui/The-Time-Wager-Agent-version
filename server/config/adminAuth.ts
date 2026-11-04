import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

function configuredAdminToken(): string {
  return (process.env.ADMIN_TOKEN ?? "").trim();
}

export function assertAdminTokenConfigured(): void {
  const token = configuredAdminToken();
  if (process.env.NODE_ENV === "production" && !token) {
    console.error("FATAL: ADMIN_TOKEN is required in production. Set it in server .env");
    process.exit(1);
  }
  if (!token) {
    console.warn("⚠️ ADMIN_TOKEN is not set — admin login and image APIs will reject all requests");
  }
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  const secret = configuredAdminToken();
  if (!secret || !token) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(String(token).trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-admin-token"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  return null;
}

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  if (!verifyAdminToken(extractBearerToken(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
