/**
 * Auth service (spec-FEAT-004a Block 9).
 *
 * Orchestrates `password`/`user-repository`/`session-repository`/`login-throttle` -- itself has
 * no I/O of its own. Two threat-model mitigations live here:
 * - R3 (timing-safe login): when the email does not exist, `login` still runs an `argon2.verify`
 *   against a fixed dummy hash before returning, so "email not found" costs the same as "wrong
 *   password" -- both are indistinguishable to a caller measuring response time.
 * - R4 (anti session-fixation): `register`/`login` never read or reuse a token the caller already
 *   has; `sessionRepository.create` always mints a brand-new one.
 */
import type { PrismaClient } from "../generated/prisma/client.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import * as userRepository from "../repositories/user-repository.ts";
import * as sessionRepository from "../repositories/session-repository.ts";
import * as loginThrottle from "../lib/login-throttle.ts";

// Fixed argon2 hash of a value that is never a real password -- exists only so verifyPassword
// takes the same time on the "email doesn't exist" branch as on the "wrong password" branch
// (threat-FEAT-004a.md R3).
const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing-safety-only");

interface Deps {
  prisma: PrismaClient;
}

export type RegisterResult =
  | { outcome: "created"; token: string; expiresAt: Date; userId: string }
  | { outcome: "duplicate_email" };

export async function register(
  deps: Deps,
  email: string,
  password: string,
): Promise<RegisterResult> {
  const existing = await userRepository.findByEmail(deps.prisma, email);

  if (existing) {
    return { outcome: "duplicate_email" }; // FR-04
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create(deps.prisma, email, passwordHash);
  const session = await sessionRepository.create(deps.prisma, user.id); // FR-05, auto-login

  return { outcome: "created", token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export type LoginResult =
  | { outcome: "success"; token: string; expiresAt: Date; userId: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "throttled" };

export async function login(deps: Deps, email: string, password: string): Promise<LoginResult> {
  if (loginThrottle.isBlocked(email)) {
    return { outcome: "throttled" }; // FR-09/FR-10, checked BEFORE touching DB/argon2
  }

  const user = await userRepository.findByEmail(deps.prisma, email);

  if (!user) {
    await verifyPassword(await DUMMY_HASH_PROMISE, password); // R3: same cost as the branch below
    loginThrottle.recordFailure(email);
    return { outcome: "invalid_credentials" }; // FR-08 -- same outcome as wrong password
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (!passwordMatches) {
    loginThrottle.recordFailure(email);
    return { outcome: "invalid_credentials" }; // FR-08 -- same outcome as nonexistent email
  }

  loginThrottle.reset(email);
  const session = await sessionRepository.create(deps.prisma, user.id); // R4: always a new token

  return { outcome: "success", token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export async function logout(deps: Deps, token: string): Promise<void> {
  await sessionRepository.invalidate(deps.prisma, token);
}
