// Shared types for the notifications module (Block 4 — spec-FEAT-003b).
// Kept in their own file so both the store and its consumers depend on a
// single, framework-agnostic definition.

export type NotificationType = "success" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}
