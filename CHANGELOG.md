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
