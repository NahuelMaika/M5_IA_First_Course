/**
 * User repository (spec-FEAT-002 Block 8).
 *
 * Receives `PrismaClient` as a parameter, never imports one as a singleton (NFR-04) -- callers
 * (Block 6's auth stub, via `fastify.prisma`) pass their own instance. Contains no business
 * logic: it only maps a Prisma row to the shape a caller needs.
 */
import type { PrismaClient } from "../generated/prisma/client.ts";

export interface UserRecord {
  id: string;
  email: string;
}

export async function findById(prisma: PrismaClient, id: string): Promise<UserRecord | null> {
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email };
}

export async function create(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email };
}

// The only point of this repo that returns `passwordHash` -- `findById` above stays without it,
// since it's used by `authPreHandler`/routes that don't need the hash.
export async function findByEmail(
  prisma: PrismaClient,
  email: string,
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email, passwordHash: user.passwordHash };
}
