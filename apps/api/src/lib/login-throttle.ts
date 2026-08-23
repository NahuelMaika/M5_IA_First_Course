const MAX_ATTEMPTS = 5; // FR-09
const WINDOW_MS = 15 * 60 * 1000; // FR-09

interface ThrottleEntry {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, ThrottleEntry>();

function normalize(email: string): string {
  return email.toLowerCase(); // threat-FEAT-004a.md R1 -- Citext is case-insensitive at the DB level, a JS Map is not
}

function pruneIfExpired(key: string): void {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.windowStart >= WINDOW_MS) {
    attempts.delete(key);
  }
}

export function isBlocked(email: string): boolean {
  const key = normalize(email);
  pruneIfExpired(key);
  const entry = attempts.get(key);
  return entry !== undefined && entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(email: string): void {
  const key = normalize(email);
  pruneIfExpired(key);
  const entry = attempts.get(key);

  if (entry) {
    entry.count += 1;
  } else {
    attempts.set(key, { count: 1, windowStart: Date.now() });
  }
}

export function reset(email: string): void {
  attempts.delete(normalize(email));
}
