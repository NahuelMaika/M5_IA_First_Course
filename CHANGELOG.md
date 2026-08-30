# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- [FEAT-001a] pnpm monorepo bootstrap (`packages/domain`, `packages/categorization`), both
  compiled to `dist/` before tests run.
- [FEAT-001a] Deterministic keyword-based expense categorizer (`@ggasia/categorization`):
  text normalization and tokenization shared across the pipeline, the 258-keyword table with
  pluralization rules, tie-break-by-normative-order matching, a public port + factory, and
  marked category name resolution (`#nombre`).
- [FEAT-001b] Free-text expense field extractor (`@ggasia/domain`): splits Descripción,
  resolves temporal references, extracts the `#nombre` category marker, converts word numerals
  to digits, determines Monto (with tie-break and zero-amount rejection), discards filler words
  to compute Lugar in O(n), and orchestrates the full pipeline into `parseExpense`. Consumes
  `@ggasia/categorization` exclusively through its `Categorizer` port.
- [FEAT-002] `apps/api` (Fastify 5 + Prisma 7): first HTTP API of the project. `POST /expenses`
  identifies the user via a transitory `x-user-id` header (accepted risk, see
  `docs/daw/security/threat-FEAT-002.md`), validates the body with Zod, runs it through
  `parseExpense`/`@ggasia/categorization`, resolves or creates the category
  (`resolveCategoryName`, now exported from `@ggasia/categorization`'s barrel — see ADR-004),
  and persists the expense in PostgreSQL (`User`/`Category`/`Expense`, partial unique indexes
  for category-name uniqueness). Seeded with kb.md's 11 predefined categories and a fixed test
  user.
- [FEAT-003a] `GET /expenses`, the API's first read endpoint. Same `x-user-id` identification as
  `POST /expenses`. Returns the identified user's expenses ordered by `when` descending (tied by
  `createdAt` descending), backed by a new composite index (`userId, when, createdAt` — `expenses`
  had none beyond its PK). `limit` query param (1-200, default 50, 400 outside that range, never
  silently clamped) — the first querystring validation in the repo.
- [FEAT-003b] `apps/web` (Next.js 16 + React 19 + Tailwind CSS 4 tokens + shadcn/ui on Base UI):
  first frontend of the project. A free-text expense form (`POST /expenses`) with client-side
  validation and 422 rejection handling, and a listing (`GET /expenses`) with initial load, empty
  and error states, wired together on one screen — newly created expenses insert into the list at
  their correct `when`-descending position without a reload. CORS enabled on `apps/api`
  (`@fastify/cors`, `WEB_ORIGIN` validated with Zod) so the browser can reach it.
- [QUICK-001] `apps/api` `dev` script (`node --env-file=../../.env --experimental-strip-types
  --watch src/server.ts`) — `pnpm dev` at the repo root now starts the API alongside `apps/web`
  instead of skipping it.
- [FEAT-004a] `apps/api` real authentication: `POST /auth/register`, `POST /auth/login`,
  `POST /auth/logout`, replacing the transitory `x-user-id` header (accepted risk in
  `docs/daw/security/threat-FEAT-002.md`, now closed — `x-user-id` no longer authenticates
  anything). Passwords hashed with argon2; sessions backed by a new `Session` table, exposed as
  an httpOnly cookie whose token is stored SHA-256-hashed (never in plaintext) and whose
  `secure`/`sameSite` attributes are NODE_ENV-aware. Login is throttled 5 failed attempts per
  email per 15-minute window (case-insensitive) and timing-safe against email enumeration. See
  `docs/daw/security/threat-FEAT-004a.md` for the full threat model.
- [FEAT-004b] `apps/web` registration, login and logout screens (`/register`, `/login`, plus a
  logout control on the expense-entry screen), backed by `apps/api`'s auth endpoints from
  FEAT-004a. The HTTP client now sends the session cookie (`credentials: "include"`) instead of
  the retired `x-user-id` header, with CORS `credentials` enabled on `apps/api` to allow it. A
  shared `useRedirectOnUnauthorized` hook centralizes the "401 from apps/api means the session
  expired or is absent" policy, applied to both the expense list's initial load and the expense
  form's submit — either now redirects to `/login` instead of showing the generic error state.
  See `docs/daw/security/threat-FEAT-004b.md` for the two accepted CSRF risks (login and
  logout/expenses), mitigated the same way as FEAT-004a: required `Content-Type: application/json`
  plus single-origin CORS blocks a simple cross-origin form submission.
- [FEAT-005a] Edit and delete for expenses. `apps/api`: `PATCH /expenses/:id` (partial update —
  amount, place, date, description and/or category, at least one field required) and
  `DELETE /expenses/:id`, both scoped to the authenticated user's own expenses (an expense that
  exists but belongs to another user responds with the same ambiguous `not_found` as one that
  does not exist at all — see `docs/daw/security/threat-FEAT-005a.md`, R1/R2). `apps/web`: an
  edit dialog (`expense-edit-dialog.tsx`, built on new `ui/dialog.tsx` and `ui/select.tsx`
  wrappers around Base UI, plus a shared `useFieldValidation` hook) and a delete confirmation
  (`ui/confirm-dialog.tsx`) wired into the expense list — each row gets edit/delete buttons, both
  dialogs mount once at list level, and a successful edit or delete updates the list in place
  without a reload, with a brief success/error notification through the centralized `notify()`
  module.
- [FEAT-006] Alta de gasto por audio. `apps/api`: `POST /expenses/audio` accepts a
  `multipart/form-data` recording (`@fastify/multipart`, 25MB limit both at the plugin and
  per-route `bodyLimit`), transcribes it via Groq's audio-transcription endpoint
  (`transcription-client.ts`, a 6s timeout, HTTPS enforced on `TRANSCRIPTION_BASE_URL`), and runs
  the transcribed text through the same `createExpense` pipeline as the text channel, now
  parameterized by a new `channel` ("texto" | "audio") persisted on `Expense`. The raw audio bytes
  are never written to disk or logged — processed in memory and discarded once transcribed (see
  `docs/daw/security/threat-FEAT-006.md`). `apps/web`: a microphone button next to the expense
  Textarea (`useAudioRecorder`, a `MediaRecorder`/`getUserMedia` wrapper), independent of the
  text flow's `isSubmitting` state, that records, stops, and submits the audio as `FormData` to
  the new endpoint, reusing the same result/error UI as the text channel.

### Changed

- [FEAT-002] `@ggasia/categorization`'s public barrel now also exports `resolveCategoryName`,
  `VisibleCategory` and `CategoryNameResolution` (previously internal to the package) — see
  ADR-004 for why.

### Fixed

- [FEAT-002] Pinned `deepmerge-ts` to `^8.0.0` via a pnpm override (GHSA-ggr8-5vv4-36mx, stack
  exhaustion on recursive merges), pulled transitively through `@prisma/config`.
- [FEAT-003a] Flaky AC-07 integration test (FEAT-002): a raw `randomUUID()` used as a category
  marker could tokenize into loose digit fragments and pass a spurious amount, turning the
  expected 422 into a false 201 (~2/3 of runs) and leaving orphan rows in the shared test
  database. Same fix already applied to AC-04/AC-05: strip the hyphens.
- [FEAT-005a] `ui/select.tsx`'s popup had no `z-index`, so it rendered behind
  `ui/dialog.tsx`'s `z-50` backdrop — the category picker inside the edit dialog was invisible
  and unusable. Found in manual testing. Fixed with `z-[60]`, strictly above the dialog's layer
  regardless of portal mount order.
- [FIX-001] `apps/web`'s HTTP client (`lib/api/client.ts`) never actually sent a request from the
  browser: `NEXT_PUBLIC_API_URL` was read via `process.env[name]` (a dynamic/bracket lookup), which
  Next.js's build-time env inlining never picks up — only a literal `process.env.NEXT_PUBLIC_*`
  access gets inlined into the client bundle. Every `apiRequest()` call threw before `fetch` ran,
  silently swallowed as the same generic error path used for network failures, so the 401 → /login
  redirect (FEAT-004b) never triggered either. Fixed by reading the var with a literal access.
  Regression-tested against a real `next build` (not just Node/Vitest, which can't tell the two
  notations apart) pointed at an isolated `distDir` so it never touches a live `next dev`'s output.
- [FIX-002] Editing a gasto's Categoría: the Select's popup opened at the correct position but
  rendered visually behind the edit Dialog, so pointer clicks on the options "passed through" and
  the Dialog read them as an outside-press and closed before anything could be selected. Two root
  causes, found across two loops: (1) the root `<body>` never declared `isolation: isolate`, so
  Base UI's Dialog and Select portals (both appended to `document.body`) had no guaranteed shared
  stacking context for their `z-index` values to compare against — fixed by adding `isolate` to the
  root `<body>` in `apps/web/src/app/layout.tsx`; (2) that alone wasn't enough — Base UI's
  `SelectPrimitive.Positioner` renders with `position: fixed`, which creates its own stacking
  context regardless of `z-index`, so the `z-[60]` already present on the child `Popup` could never
  escape it to compete against the Dialog's `z-50`. Fixed by adding `z-[60]` to the `Positioner`
  itself in `apps/web/src/components/ui/select.tsx`. Confirmed working end-to-end in the browser.
- [FEAT-006] Two defects found in manual testing after the initial implementation: (1) the
  microphone recording's `FormData` never named its file (`formData.append("file", blob)`), so the
  browser defaulted the multipart filename to `"blob"` with no extension — Groq's transcription
  endpoint rejects unrecognized extensions, turning every real recording into a 502
  `transcription_failed` and breaking the audio channel's happy path. Fixed by deriving a real
  filename from the recorder's own reported mimeType (`recording.webm`, `.ogg`, etc.) in
  `apps/web/src/components/expense-form.tsx`. (2) The microphone button had no layout container
  separating it from the "Guardar" button. Fixed by wrapping both in a `flex items-center gap-2`
  container, matching the pattern already used elsewhere in the app.
