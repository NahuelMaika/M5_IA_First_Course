import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetNotificationsForTests,
  getActiveNotifications,
  notify,
  SUCCESS_AUTO_DISMISS_MS,
} from "./notifications";

describe("notifications module (Block 4 — dismissal policy)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetNotificationsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("with 3 notifications already visible, a 4th success evicts the oldest success before any error", () => {
    notify("success", "Gasto guardado 1");
    notify("error", "No se pudo interpretar el monto");
    notify("success", "Gasto guardado 2");

    notify("success", "Gasto guardado 3");

    const messages = getActiveNotifications().map((n) => n.message);
    expect(messages).toHaveLength(3);
    expect(messages).not.toContain("Gasto guardado 1");
    expect(messages).toEqual([
      "No se pudo interpretar el monto",
      "Gasto guardado 2",
      "Gasto guardado 3",
    ]);
  });

  it("with 3 visible notifications all of type error, a 4th success discards the oldest error (no success available to free a slot first)", () => {
    notify("error", "Error 1");
    notify("error", "Error 2");
    notify("error", "Error 3");

    notify("success", "Gasto guardado");

    const notifications = getActiveNotifications();
    expect(notifications).toHaveLength(3);
    expect(notifications.map((n) => n.message)).toEqual([
      "Error 2",
      "Error 3",
      "Gasto guardado",
    ]);
    expect(notifications.every((n) => n.type !== "error" || n.message !== "Error 1")).toBe(true);
  });

  it("an error notification does not auto-dismiss with the passage of time; only an explicit action removes it", () => {
    notify("error", "No se pudo crear el gasto");

    vi.advanceTimersByTime(SUCCESS_AUTO_DISMISS_MS * 10);

    const notifications = getActiveNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe("No se pudo crear el gasto");
  });

  it("a success notification auto-dismisses after a fixed time, without the person taking any action", () => {
    notify("success", "Gasto guardado");
    expect(getActiveNotifications()).toHaveLength(1);

    vi.advanceTimersByTime(SUCCESS_AUTO_DISMISS_MS);

    expect(getActiveNotifications()).toHaveLength(0);
  });

  it("an empty message does not add any visible notification", () => {
    notify("success", "");
    notify("error", "   ");

    expect(getActiveNotifications()).toHaveLength(0);
  });
});
