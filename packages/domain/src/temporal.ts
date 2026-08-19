/**
 * Recognizes and resolves the temporal reference of a raw expense sentence
 * (kb.md "Extracción de Campos desde Texto Libre" -> "Cuando", FR-02, FR-03).
 *
 * Closed set recognized, compared by whole token, case- and accent-
 * insensitive:
 * - `hoy` / `ayer` / `anteayer`.
 * - A weekday name (`lunes`..`domingo`): resolves to the most recent
 *   occurrence that does not pass today; if the named day is today, it
 *   resolves to today.
 * - `dd/mm` (current year, es-AR day-first convention) or `dd/mm/aaaa`,
 *   calendar-valid only -- an invalid combination (`31/2`, `45/13`) is not
 *   recognized and is left in the text untouched, exactly like any other
 *   unrecognized token (kb.md lines 157-161).
 *
 * If several references are present, the first one resolves `when`, but all
 * of them are stripped from the remaining tokens (same rule as Block 4's
 * `#marker`).
 *
 * Every resolved date is normalized to midnight local time on its calendar
 * day -- "Cuando" is a calendar date, not a timestamp, and this keeps every
 * resolution path (literal words, weekday, explicit date, and the
 * no-reference fallback to `referenceDate`) comparable with a plain
 * `getTime()` equality check.
 */

import type { RejectedExpense } from "./types.ts";

export interface TemporalExtractionResult {
  when: Date | null;
  remainingTokens: string[];
}

// Same range and rationale as @ggasia/categorization's normalize.ts: NFD
// decomposition splits an accented letter into base + combining mark
// (U+0300-U+036F), which this strips so `sabado` compares equal to
// `sábado`. Built from code points, like separator.ts's non-breaking-space
// handling, to keep the exact range unambiguous in source.
const COMBINING_DIACRITICAL_MARKS_PATTERN = new RegExp(
  `[\\u${(0x0300).toString(16).padStart(4, "0")}-\\u${(0x036f).toString(16).padStart(4, "0")}]`,
  "g",
);

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS_PATTERN, "");
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBefore(referenceDate: Date, days: number): Date {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - days,
  );
}

// Indexed exactly like JS's Date#getDay() (0 = Sunday .. 6 = Saturday), so a
// weekday token resolves to its numeric day-of-week with a single lookup.
const WEEKDAY_TOKENS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function resolveWeekdayToken(normalized: string, referenceDate: Date): Date | null {
  const targetDayOfWeek = WEEKDAY_TOKENS[normalized];
  if (targetDayOfWeek === undefined) return null;

  const referenceDayOfWeek = referenceDate.getDay();
  const daysSinceTarget = (referenceDayOfWeek - targetDayOfWeek + 7) % 7;

  return daysBefore(referenceDate, daysSinceTarget);
}

function daysInMonth(year: number, month1to12: number): number {
  // Day 0 of the following month rolls back to the last day of `month1to12`.
  return new Date(year, month1to12, 0).getDate();
}

// `dd/mm[/aaaa]` as one whole token, day-first (es-AR). The year, when
// present, is required to be exactly 4 digits -- kb.md's placeholder
// "aaaa" implies a 4-digit year; a 1-3 digit trailing group is just not a
// year this format recognizes.
const EXPLICIT_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

function resolveExplicitDateToken(token: string, referenceDate: Date): Date | null {
  const match = EXPLICIT_DATE_PATTERN.exec(token);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] !== undefined ? Number(match[3]) : referenceDate.getFullYear();

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return new Date(year, month - 1, day);
}

function resolveTemporalToken(token: string, referenceDate: Date): Date | null {
  const normalized = normalizeToken(token);

  if (normalized === "hoy") return atMidnight(referenceDate);
  if (normalized === "ayer") return daysBefore(referenceDate, 1);
  if (normalized === "anteayer") return daysBefore(referenceDate, 2);

  const weekday = resolveWeekdayToken(normalized, referenceDate);
  if (weekday !== null) return weekday;

  return resolveExplicitDateToken(normalized, referenceDate);
}

/**
 * Scans `tokens` for the closed set of temporal references. The first
 * recognized token resolves `when`; every recognized token (not only the
 * first) is removed from `remainingTokens`. Returns `when: null` when
 * nothing in the closed set is found -- callers use `resolveWhen` to fall
 * back to `referenceDate` (FR-03).
 */
export function extractTemporalReference(
  tokens: string[],
  referenceDate: Date,
): TemporalExtractionResult {
  let when: Date | null = null;
  const remainingTokens: string[] = [];

  for (const token of tokens) {
    const resolved = resolveTemporalToken(token, referenceDate);

    if (resolved === null) {
      remainingTokens.push(token);
      continue;
    }

    if (when === null) {
      when = resolved;
    }
  }

  return { when, remainingTokens };
}

// Same 12-closed-month window that bounds monthly summary generation
// (kb.md "Piso de retroactividad", RF-11/FR-040): the first day of the
// month 12 months back from `referenceDate`'s month.
function retroactivityFloor(referenceDate: Date): Date {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
}

/**
 * Resolves the final `when` for the pipeline: `extracted` when a reference
 * was found, otherwise `referenceDate` itself (FR-03 -- never the system
 * clock). Rejects a resolved date that is future relative to
 * `referenceDate`, or that predates the 12-closed-month retroactivity
 * floor.
 */
export function resolveWhen(
  extracted: Date | null,
  referenceDate: Date,
): Date | RejectedExpense["reason"] {
  const today = atMidnight(referenceDate);
  const when = extracted !== null ? extracted : today;

  if (when.getTime() > today.getTime()) {
    return "future_date";
  }

  if (when.getTime() < retroactivityFloor(referenceDate).getTime()) {
    return "date_out_of_window";
  }

  return when;
}
