import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { jwtVerify } from "jose";
import { getUserById } from "../db";
import { parse as parseCookieHeader } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "matjari-secret-key-2024");

async function authenticateCustom(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const userId = parseInt(payload.sub as string, 10);
    if (!userId || isNaN(userId)) return null;
    const user = await getUserById(userId);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await authenticateCustom(opts.req);
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
