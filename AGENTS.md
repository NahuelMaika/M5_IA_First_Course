# AGENTS.md — project context

> **DAW template.** Fill in the `[...]` with what is true of YOUR project and delete what does not
> apply. This file describes **the project**; **the process** is DAW's job (phases, gates, when to
> test, when to commit). Do not mix the two: process rules written here compete with the pipeline's.
>
> It is **tool-agnostic on purpose**: Claude Code reads it through the import in `CLAUDE.md`, Codex
> CLI, Copilot CLI, Cursor and OpenCode read it directly, and Gemini CLI gets it through
> `GEMINI.md`. The same file serves whichever tool you open the repo with — which is the point:
> porting the pipeline to another tool must not mean rewriting what your project is.

---

## Language

**Always respond in the language the user writes in.** Write every artifact you produce — PRDs,
specs, ADRs, reports, commit messages, status lines — in that same language, regardless of the
language these instructions are written in.

---

## What this project is

GGasIA is a personal/couple expense-tracking web app. The user enters an expense as a typed or
dictated sentence, and the system extracts amount, place, date and category, then generates daily
and monthly summaries. Categorization is deterministic — keyword matching against the Place field,
defined in `kb.md` — with no LLM involved; the only AI service in the product is audio
transcription.

**Reference PRD:** `docs/daw/prd/PRD.md`

---

## Stack

**This is the only place the stack lives.** DAW reads it from here and generates no derived file.
Fill it in even if the repo is empty: without a stack there is nothing to plan or implement against.

If the repo already has code and this section is empty, DAW will detect the stack from your config
files and **propose the text for you to paste here**. You always confirm it.

| Field | Value |
|-------|-------|
| Language | TypeScript 7 |
| Runtime | Node.js ≥ 22 |
| Framework | Fastify 5 (API, `apps/api`) + Next.js 16 / React 19 (web, `apps/web`) |
| Database | PostgreSQL + Prisma 7 (requires the `citext` extension) |
| Test runner | Vitest 4 — one `vitest.config.ts` per workspace |
| Package manager | pnpm workspaces (monorepo) |

---

## Architecture conventions

**DAW validates your code against this section** during the CODE phase, via `daw-validate-arch`.
Leave it empty and that validation has nothing to compare against, so it stops being worth running.

- **Folder structure:** pnpm monorepo — `apps/api` (Fastify HTTP API: auth, expenses, categories,
  notifications, transcription), `apps/web` (Next.js frontend), `packages/domain` (pure business
  logic: text extraction, money, periods, summaries), `packages/categorization` (pure keyword-based
  categorizer).
- **Layer separation:** `apps/api` follows `routes → service → repository`; routes read
  `fastify.prisma` instead of importing a Prisma singleton, so tests can inject the test database
  client. `packages/domain` and `packages/categorization` never import Fastify, Prisma or anything
  from `apps/` — they only receive and return data, and are consumed **compiled** (`main` points to
  `dist/`, not `src/index.ts`). The categorizer is always consumed through its port, never a
  concrete class.
- **Error handling:** request bodies and environment variables are validated with Zod; the API
  **aborts the process** on startup if a required environment variable is missing or invalid — it
  never starts in a degraded state.
- **Naming:** files and folders in `kebab-case` (e.g. `expense-form.tsx`); React components and
  types/interfaces in `PascalCase` (e.g. `ExpenseForm`, `CategoryDto`); functions, variables and
  hooks in `camelCase` (e.g. `useExpenseForm`, `parseAmount`).
- **Dependencies:** passwords are hashed with argon2 — never stored in plain text. Styling runs on
  Tailwind CSS 4, configured via CSS tokens (no `tailwind.config.js`); no screen defines its own
  colors, typography or spacing.

---

## Code conventions

- Code, identifiers, comments, file names and commit messages: **English**. User-facing text — UI
  copy, labels, API error messages: **Spanish**.
- `packages/domain` and `packages/categorization` stay pure (no Fastify/Prisma imports) so business
  rules are testable without a database.
- `pnpm dev` and `pnpm test` always run `build:packages` first — no workspace should consume a
  package without it being compiled.
- shadcn/ui runs on **Base UI**, not Radix. Consequences: there is no `sonner` — toasts go through
  Base UI's `toast` component, with the dismissal policy centralized in a single module, never in
  the component that calls it; there is no `form` component — per-field validation is a custom
  hook; the animation package is `tw-animate-css`, not `tailwindcss-animate`.

---

## What NOT to do in this project

This section is worth its weight in gold: it is where the scars go, the things that already went
wrong once.

**Product**

- Do not export data as PDF, Excel or CSV.
- Do not integrate with bank APIs.
- Do not store passwords in plain text.
- Do not hardcode the currency: today the app only operates in ARS, but the model must support
  others.

**Expense engine**

- Do not use an LLM for categorization.
- Do not guess an ambiguous amount: multiple numbers without a `$` are rejected. A silently
  invented money value is worse than asking the user to re-enter it.
- Do not re-categorize an expense when its Place is edited — the category is assigned once, at
  creation.
- Do not reorder the keyword table or move a category's keyword without re-measuring accuracy.
- Do not persist audio bytes — transcribe in memory and discard.
- Do not add cron jobs, schedulers or background jobs — summaries are generated on demand.

**API**

- Do not leave `methods` undeclared in `@fastify/cors`: v11 defaults to `GET,HEAD,POST` and breaks
  every PATCH/DELETE. Integration tests won't catch this — they call the app without going through
  CORS.
- Do not return messages that reveal whether an email is registered: the login throttle applies
  whether or not the account exists.

**Deployment**

- Do not point `packages/*`'s `main` back to `src/index.ts`: it still compiles, but breaks only
  once it starts in production.
- Do not use `pnpm build` as the API service's build command — it drags in `apps/web`, and a
  front-end build failure takes down the backend. Use `pnpm build:api`.
- Do not use `db:migrate` in production — it's `prisma migrate dev`, interactive and capable of
  resetting the database. Use `prisma:deploy`.
- Do not write `WEB_ORIGIN` with a trailing slash or a path.
- Do not leave `NODE_ENV` undeclared in production: the API still starts, in development mode, and
  issues the session cookie with attributes the browser rejects across origins.
- Do not add a `NEXT_PUBLIC_*` variable expecting it to take effect without a rebuild — it's
  inlined into the bundle at build time.

**Web**

- Do not use `window.confirm` or `alert`.
- Do not hardcode colors, typography or spacing — everything comes from the shared tokens.
- Do not add dark mode unless asked.
- Do not call the toast manager from a component — always go through the module that centralizes
  the dismissal policy.
- Do not put lists inside their own scrolling containers.

---

## Domain glossary

The terms specific to your product, so the agent uses them correctly instead of inventing synonyms.

- **Expense:** a spending record entered as a typed or dictated free-text sentence; the system
  extracts its amount, place, date and category. Deleted physically.
- **Category:** assigned once, at creation, via deterministic keyword matching on the expense's
  Place — never reassigned on edit. Deactivated (soft-deleted) rather than deleted, which frees its
  name for a new category.
- **Place:** the free-text field the user enters for an expense; the sole input the categorizer
  matches keywords against.
- **Categorization strategy:** deterministic keyword matching defined in `kb.md` — no language
  model is involved. The only AI service in the product is audio transcription.
- **kb.md:** normative source for categorization — category order, keyword table and filler words
  ("muletillas") used in text extraction; closed and versioned, changing it requires re-measuring
  categorization accuracy.

---

> ℹ️ **What does NOT belong in this file, because DAW provides it:** the order work happens in, when
> the spec gets written, when tests run, when to commit, what it takes to move between phases. All
> of that lives in `.daw/` and applies on its own.

<!-- BEGIN DAW (managed by DAW — do not edit by hand) -->
# DAW — Dilux Agentic Workflow

This repo uses **DAW**: an agent-driven development pipeline with the phases
`CLASSIFY → DEFINE → PLAN → CODE → VERIFY → RELEASE`.

Before answering, read `.daw/orchestrator.md` and run its Boot Sequence. It is a strict state
machine: it decides what you are allowed to do based on the phase recorded in `.daw-state.json`.

The project's own context — stack, architecture, domain — is elsewhere in this file. It lives here,
in `AGENTS.md`, and not in any one tool's file, on purpose: it is tool-agnostic and comes along
unchanged when the pipeline is ported to another agent.
<!-- END DAW -->
