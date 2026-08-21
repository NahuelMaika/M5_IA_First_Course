"use client";

// Centralized notifications module (Block 4 — spec-FEAT-003b).
//
// This is the ONLY place in the app allowed to decide when a notification
// appears or disappears (AGENTS.md: "toasts go through Base UI's `toast`
// component, with the dismissal policy centralized in a single module,
// never in the component that calls it"). Every screen calls `notify()`
// instead of implementing its own dismissal logic.
//
// It renders through Base UI's `toast` singleton (installed in Block 3, via
// `@/components/ui/toast`) so the actual UI stays whatever `<Toaster>`
// already draws -- this module only owns *which* notifications are active
// and *when* they go away, not how they look on screen.

import { toast } from "@/components/ui/toast";

import type { Notification, NotificationType } from "./types";

/** FR-02 / AC-56 (RF-64, RF-65, RF-66, RF-67 of PRD.md): at most 3 notifications are visible at
 * the same time. */
const MAX_VISIBLE_NOTIFICATIONS = 3;

/** Fixed delay before a "success" notification dismisses itself. */
export const SUCCESS_AUTO_DISMISS_MS = 5000;

let activeNotifications: Notification[] = [];
const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearAutoDismissTimer(id: string): void {
  const timer = autoDismissTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    autoDismissTimers.delete(id);
  }
}

function removeNotification(id: string): void {
  const stillActive = activeNotifications.some((notification) => notification.id === id);
  if (!stillActive) return;

  activeNotifications = activeNotifications.filter((notification) => notification.id !== id);
  clearAutoDismissTimer(id);
  toast.close(id);
}

/**
 * Frees a slot for an incoming notification once the visible limit is
 * reached. Evicts the oldest "success" notification first; only when every
 * visible notification is an "error" does it fall back to evicting the
 * oldest one overall (which, in that case, is necessarily an "error").
 */
function evictOldestToMakeRoom(): void {
  const oldestSuccess = activeNotifications.find(
    (notification) => notification.type === "success"
  );
  const target = oldestSuccess ?? activeNotifications[0];
  if (target) {
    removeNotification(target.id);
  }
}

/**
 * Adds a notification, applying the centralized dismissal policy:
 * - at most 3 visible at once (oldest "success" evicted first to make room,
 *   oldest "error" only if every visible notification is already an error);
 * - "error" notifications stay until the person dismisses them explicitly;
 * - "success" notifications auto-dismiss after `SUCCESS_AUTO_DISMISS_MS`;
 * - an empty (or whitespace-only) message adds nothing;
 * - a no-op call from outside a browser (no `window`) adds nothing.
 *
 * Returns whether a notification was actually added, so a caller passing a message that might be
 * empty or malformed (e.g. relayed from an API response) can fall back to a message of its own.
 */
export function notify(type: NotificationType, message: string): boolean {
  // Defensive, in addition to the "use client" directive above: a plain (non-component) function
  // export can still be called from a Server Component's render in some bundler configurations,
  // which would run this module-level singleton once per server process instead of once per
  // browser tab -- silently leaking notification state across every visitor. `window` only exists
  // in a real browser.
  if (typeof window === "undefined") return false;

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) return false;

  if (activeNotifications.length >= MAX_VISIBLE_NOTIFICATIONS) {
    evictOldestToMakeRoom();
  }

  const id = crypto.randomUUID();
  const notification: Notification = { id, type, message: trimmedMessage };
  activeNotifications = [...activeNotifications, notification];

  toast.add({
    id,
    type,
    description: trimmedMessage,
    // A value of 0 tells Base UI's toast manager to never auto-dismiss.
    timeout: type === "error" ? 0 : SUCCESS_AUTO_DISMISS_MS,
    onRemove: () => {
      // Keeps this module's own truth in sync when the toast is closed
      // through any other path (e.g. the person clicking its close button).
      clearAutoDismissTimer(id);
      activeNotifications = activeNotifications.filter((item) => item.id !== id);
    },
  });

  if (type === "success") {
    const timer = setTimeout(() => {
      removeNotification(id);
    }, SUCCESS_AUTO_DISMISS_MS);
    autoDismissTimers.set(id, timer);
  }

  return true;
}

/** Explicitly dismisses a notification (e.g. the person closing an error). */
export function dismiss(id: string): void {
  removeNotification(id);
}

/** Returns the notifications currently visible, oldest first. */
export function getActiveNotifications(): Notification[] {
  return activeNotifications;
}

/** Test-only: resets the module's in-memory state between test cases. */
export function __resetNotificationsForTests(): void {
  for (const timer of autoDismissTimers.values()) clearTimeout(timer);
  autoDismissTimers.clear();
  activeNotifications = [];
}
