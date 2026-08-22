/**
 * Zod validation for the auth request bodies (spec-FEAT-004a Block 8).
 *
 * `loginBodySchema` does NOT enforce the 8-char minimum: a historical or test password could fail
 * that rule, and the actual rejection of wrong credentials is already handled uniformly by
 * `auth-service` (FR-08) -- enforcing 8 here would leak a distinct status code (400 instead of 401)
 * for login attempts with a short-but-otherwise-valid password, which is a subtle information leak
 * the login schema must avoid.
 */

import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(), // FR-01
  password: z.string().min(8), // FR-02
});

export const loginBodySchema = z.object({
  email: z.string().email(), // FR-06
  password: z.string().min(1), // the 8-char minimum is enforced only on registration, not on login
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
