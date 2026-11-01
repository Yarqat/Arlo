import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { env } from "./env";

const COOKIE = "yarqat_session";
const ALG = "HS256";

function secret() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function createSession(ownerId: string) {
  const token = await new SignJWT({ sub: ownerId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getOwnerId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function getOwner() {
  const id = await getOwnerId();
  if (!id) return null;
  return prisma.owner.findUnique({ where: { id } });
}

export async function requireOwner() {
  const owner = await getOwner();
  if (!owner) throw new UnauthorizedError();
  return owner;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

// For middleware (edge): verify token validity only.
export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = COOKIE;
