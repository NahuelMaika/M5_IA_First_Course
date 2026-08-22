/**
 * Session repository (spec-FEAT-004a Block 3).
 *
 * Receives `PrismaClient` as a parameter, never imports one as a singleton (same convention as
 * `user-repository.ts`). `Session.token` never stores the raw token -- only its SHA-256 hex
 * digest (threat-FEAT-004a.md R2) -- so `create`/`findValid`/`invalidate` all hash their input
 * before touching the database, and only `create` ever returns the raw value to its caller.
 */
import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.ts";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // NFR-02

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function create(
  prisma: PrismaClient,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { userId, token: hashToken(rawToken), expiresAt },
  });

  return { token: rawToken, expiresAt };
}

export async function findValid(
  prisma: PrismaClient,
  rawToken: string,
): Promise<{ userId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token: hashToken(rawToken) } });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return { userId: session.userId };
}

export async function invalidate(prisma: PrismaClient, rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: hashToken(rawToken) } });
}
