import * as React from "react";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import { notify } from "@/lib/notifications/notifications";
import type { AudioRecorderStatus } from "@/lib/hooks/use-audio-recorder";

import { ExpenseForm } from "./expense-form";

// Block 7 (spec-FEAT-003b) wires submit to the real `POST /expenses` call. Every test in this file
// mocks both boundary modules so no test ever touches the network or the real toast UI:
// - `@/lib/api/client`: the ONLY module allowed to build a request towards `apps/api` (Block 5).
// - `@/lib/notifications/notifications`: the ONLY module allowed to raise a notification (Block 4).
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));
// Block 8 (spec-FEAT-004b): `submitExpense` now reuses `useRedirectOnUnauthorized`, which calls
// `useRouter()` from `next/navigation` -- without this mock, every render below fails with
// "invariant expected app router to be mounted".
const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

// Block 7 (spec-FEAT-006): fakes `useAudioRecorder` (Block 6) with a controllable, but otherwise
// state-faithful, in-memory implementation -- `start()`/`stop()` really flip `status` via React
// state (so the component's own re-renders drive the UI, exactly like the real hook), while
// `audioRecorderMock` lets each test decide the initial status and whether `start()` fails, without
// touching real `MediaRecorder`/`getUserMedia` APIs (already covered by Block 6's own tests).
const audioRecorderMock = vi.hoisted(() => ({
  initialStatus: "idle" as AudioRecorderStatus,
  errorMessage: null as string | null,
  startShouldFail: false,
  stopBlob: new Blob(["fake-audio"], { type: "audio/webm" }),
}));
vi.mock("@/lib/hooks/use-audio-recorder", () => ({
  useAudioRecorder: () => {
    const [status, setStatus] = React.useState<AudioRecorderStatus>(
      audioRecorderMock.initialStatus
    );
    const [errorMessage, setErrorMessage] = React.useState<string | null>(
      audioRecorderMock.errorMessage
    );

    const start = React.useCallback(async () => {
      if (audioRecorderMock.startShouldFail) {
        setStatus("error");
        setErrorMessage(audioRecorderMock.errorMessage);
        return;
      }
      setStatus("recording");
    }, []);

    const stop = React.useCallback(async () => {
      setStatus("idle");
      return audioRecorderMock.stopBlob;
    }, []);

    return { status, errorMessage, start, stop };
  },
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedNotify = vi.mocked(notify);

const VALID_INPUT = "Almuerzo $2000";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREATED_EXPENSE_BODY = {
  amount: "2000.00",
  place: "restaurante",
  when: "2026-08-20T00:00:00.000Z",
  category: "Comida",
  categoryOrigin: "automatica",
  description: "",
  name: "Almuerzo",
  type: "Personal",
  currency: "ARS",
};

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
  mockedNotify.mockReset();
  mockedPush.mockClear();
  audioRecorderMock.initialStatus = "idle";
  audioRecorderMock.errorMessage = null;
  audioRecorderMock.startShouldFail = false;
  audioRecorderMock.stopBlob = new Blob(["fake-audio"], { type: "audio/webm" });
});

describe("ExpenseForm — client-side validation (Block 6, still exercised through Block 7's wiring)", () => {
  it("shows the required error on blur, not while typing the first character", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    expect(
      screen.queryByText(/escribí un gasto antes de guardar/i)
    ).not.toBeInTheDocument();

    await user.tab();
    expect(
      screen.getByText(/escribí un gasto antes de guardar/i)
    ).toBeInTheDocument();
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it("shows the length error for 501 characters", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const tooLongValue = "a".repeat(501);

    await user.click(textarea);
    await user.paste(tooLongValue);
    await user.tab();

    expect(screen.getByText(/máximo 500 caracteres/i)).toBeInTheDocument();
  });

  it("hides an already-visible error as soon as the value becomes valid, without a new submit attempt", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.tab();
    expect(
      screen.getByText(/escribí un gasto antes de guardar/i)
    ).toBeInTheDocument();

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);

    expect(
      screen.queryByText(/escribí un gasto antes de guardar/i)
    ).not.toBeInTheDocument();
  });

  it("associates the error message via aria-describedby and marks aria-invalid while the error is visible", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.tab();

    const errorMessage = screen.getByText(
      /escribí un gasto antes de guardar/i
    );
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", errorMessage.id);
  });

  it("the submit button is reachable and operable via keyboard alone, with a visible focus indicator", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.tab();
    const button = screen.getByRole("button", { name: /guardar/i });

    expect(button).toHaveFocus();
    // Inherited from the Block 3 Button primitive (Base UI) -- confirms the focus-visible ring
    // is not stripped by this component's own usage.
    expect(button.className).toMatch(/focus-visible:ring-3/);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
  });
});

// Block 7 (spec-FEAT-003b): submit, resultado interpretado y rechazo.
describe("ExpenseForm — submit (Block 7)", () => {
  it("201 with recognizable Monto and Lugar shows the interpreted detail, visually separated, with the amount as the most visually prominent datum, and clears the field", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    const amountText = await screen.findByText(/2000\.00/);
    expect(screen.getByText("Almuerzo")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
    // The amount carries the strongest visual weight of the interpreted detail -- a larger, bolder
    // typographic scale than the rest of the detail (name/category/date use the default scale).
    expect(amountText.className).toMatch(/text-3xl/);
    expect(amountText.className).toMatch(/font-bold/);

    expect(textarea).toHaveValue("");
  });

  it("shows a progress indicator and disables the button while the request is in flight, and returns to normal once it resolves", async () => {
    let resolveRequest!: (response: Response) => void;
    mockedApiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    const inFlightButton = screen.getByRole("button", { name: /guardando/i });
    expect(inFlightButton).toBeDisabled();

    resolveRequest(jsonResponse(201, CREATED_EXPENSE_BODY));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
    });
  });

  it("422 does not clear the text field and does not add anything to the interpreted result", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(422, { reason: "amount_zero" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith("error", expect.any(String));
    expect(textarea).toHaveValue(VALID_INPUT);
    expect(screen.queryByText("Comida")).not.toBeInTheDocument();
  });

  it("400/500 show a generic error notification without attempting to read `reason` from the response, and do not redirect (regression, Block 8)", async () => {
    for (const status of [400, 500]) {
      mockedApiRequest.mockReset();
      mockedNotify.mockReset();
      // Deliberately includes a valid `reason` in the body: if the component read it, the
      // notification would carry the mapped "amount_zero" message instead of the generic one.
      mockedApiRequest.mockResolvedValueOnce(jsonResponse(status, { reason: "amount_zero" }));
      const user = userEvent.setup();
      render(<ExpenseForm />);
      const textarea = screen.getByRole("textbox", { name: /gasto/i });
      const button = screen.getByRole("button", { name: /guardar/i });

      await user.click(textarea);
      await user.type(textarea, VALID_INPUT);
      await user.click(button);

      await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
      const [, message] = mockedNotify.mock.calls[0]!;
      expect(message).toMatch(/ocurrió un error/i);
      expect(message).not.toMatch(/\$0/);
      expect(textarea).toHaveValue(VALID_INPUT);
      // Block 8 regression guard: only 401 redirects -- 400/500 keep showing the generic
      // notification and never navigate.
      expect(mockedPush).not.toHaveBeenCalled();

      cleanup();
    }
  });

  // Block 8 (spec-FEAT-004b): a 401 means the session expired or is absent while submitting a
  // gasto -- redirect to /login instead of the generic notification, same policy Block 7 already
  // applies to `expense-list.tsx`'s initial load.
  it("401 redirects to /login without calling notify", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(401, { reason: "amount_zero" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it("a network failure (fetch rejects) is treated the same as a 500, without redirecting", async () => {
    mockedApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith("error", expect.stringMatching(/ocurrió un error/i));
    expect(textarea).toHaveValue(VALID_INPUT);
    expect(mockedPush).not.toHaveBeenCalled();
  });
});

// Shared by Block 7's and Block 8's audio-recording describe blocks below.
async function recordAndStop(user: ReturnType<typeof userEvent.setup>) {
  const micButton = screen.getByRole("button", { name: /grabar audio/i });
  await user.click(micButton);
  const stopButton = await screen.findByRole("button", { name: /detener grabación/i });
  await user.click(stopButton);
}

// Block 7 (spec-FEAT-006): grabación de audio, envío y manejo de sus respuestas.
describe("ExpenseForm — audio recording (Block 7, FEAT-006)", () => {

  it("happy path: record -> stop -> 201 renders the same interpreted detail as the text flow (AC-01/AC-10)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    expect(await screen.findByText(/2000\.00/)).toBeInTheDocument();
    expect(screen.getByText("Almuerzo")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/expenses/audio",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("the stop button stays enabled while recording, even while a text submit is in flight (AC-06)", async () => {
    let resolveTextRequest!: (response: Response) => void;
    mockedApiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTextRequest = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ExpenseForm />);

    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const saveButton = screen.getByRole("button", { name: /guardar/i });
    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(saveButton);

    // The text submit is now in flight (isSubmitting === true).
    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();

    const micButton = screen.getByRole("button", { name: /grabar audio/i });
    await user.click(micButton);
    const stopButton = await screen.findByRole("button", { name: /detener grabación/i });

    expect(stopButton).not.toBeDisabled();

    resolveTextRequest(jsonResponse(201, CREATED_EXPENSE_BODY));
  });

  it("shows a progress indicator and disables the submit control while the audio request is in flight (AC-09)", async () => {
    let resolveAudioRequest!: (response: Response) => void;
    mockedApiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAudioRequest = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    const inFlightButton = screen.getByRole("button", { name: /guardando/i });
    expect(inFlightButton).toBeDisabled();

    resolveAudioRequest(jsonResponse(201, CREATED_EXPENSE_BODY));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
    });
  });

  it("microphone permission denied notifies the error and leaves the text Textarea present and enabled (AC-08)", async () => {
    audioRecorderMock.initialStatus = "error";
    audioRecorderMock.errorMessage =
      "No pudimos acceder al micrófono. Revisá los permisos del navegador.";
    render(<ExpenseForm />);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith(
      "error",
      "No pudimos acceder al micrófono. Revisá los permisos del navegador."
    );

    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toBeEnabled();
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it("422 transcripcion_vacia shows the specific empty-transcription message via notify (AC-03)", async () => {
    mockedApiRequest.mockResolvedValueOnce(
      jsonResponse(422, { reason: "transcripcion_vacia" })
    );
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith(
      "error",
      "No pudimos reconocer texto en el audio grabado. Probá de nuevo o escribí el gasto."
    );
  });

  it("502 shows the specific transcription-failed message via notify (AC-05)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(502, { error: "transcription_failed" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith(
      "error",
      "No pudimos transcribir el audio. Probá de nuevo o escribí el gasto."
    );
  });

  it("sends the audio as FormData without a manual Content-Type header (browser must set the multipart boundary)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
    const [path, init] = mockedApiRequest.mock.calls[0]!;
    expect(path).toBe("/expenses/audio");
    expect(init?.body).toBeInstanceOf(FormData);
    const headers = init?.headers as Headers | Record<string, string> | undefined;
    if (headers instanceof Headers) {
      expect(headers.has("Content-Type")).toBe(false);
    } else {
      expect(headers?.["Content-Type"]).toBeUndefined();
    }
  });

  it("401 on /expenses/audio redirects to /login without calling notify, same as the text flow", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(401, { reason: "amount_zero" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it("422 with a domain reason shows the resolveRejectionMessage text, same as the text flow", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(422, { reason: "amount_zero" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    const [, message] = mockedNotify.mock.calls[0]!;
    expect(message).toMatch(/monto no puede ser \$0/i);
  });

  it("400/413/500 and a network failure show the generic error notification", async () => {
    for (const status of [400, 413, 500]) {
      mockedApiRequest.mockReset();
      mockedNotify.mockReset();
      mockedApiRequest.mockResolvedValueOnce(jsonResponse(status, {}));
      const user = userEvent.setup();
      render(<ExpenseForm />);

      await recordAndStop(user);

      await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/ocurrió un error/i)
      );

      cleanup();
    }

    mockedApiRequest.mockReset();
    mockedNotify.mockReset();
    mockedApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith("error", expect.stringMatching(/ocurrió un error/i));
  });
});

// Block 8 (spec-FEAT-006, spec loop 2): fix del filename ausente en el FormData de audio y del
// layout del botón de mic.
describe("ExpenseForm — Block 8 fixes (spec-FEAT-006 loop 2)", () => {
  it("sends the audio FormData with a derived filename instead of the browser default 'blob' (AC-01 root cause)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
    const [, init] = mockedApiRequest.mock.calls[0]!;
    const formData = init?.body as FormData;
    const file = formData.get("file") as File;
    // audioRecorderMock.stopBlob has type "audio/webm" -> subtype "webm" -> "recording.webm".
    expect(file.name).toBe("recording.webm");
  });

  it("derives the extension from a mimeType with a codecs parameter (e.g. 'audio/webm;codecs=opus' -> 'recording.webm')", async () => {
    audioRecorderMock.stopBlob = new Blob(["fake-audio"], {
      type: "audio/webm;codecs=opus",
    });
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
    const [, init] = mockedApiRequest.mock.calls[0]!;
    const file = (init?.body as FormData).get("file") as File;
    expect(file.name).toBe("recording.webm");
  });

  it("falls back to 'recording.webm' when blob.type is an empty string", async () => {
    audioRecorderMock.stopBlob = new Blob(["fake-audio"], { type: "" });
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await recordAndStop(user);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
    const [, init] = mockedApiRequest.mock.calls[0]!;
    const file = (init?.body as FormData).get("file") as File;
    expect(file.name).toBe("recording.webm");
  });

  it("keeps the tab order unchanged: the 'Guardar' button is still focusable before the mic button", async () => {
    render(<ExpenseForm />);

    const focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]"
      )
    );
    const saveIndex = focusableElements.findIndex(
      (element) => element.getAttribute("type") === "submit"
    );
    const micIndex = focusableElements.findIndex((element) =>
      /grabar audio/i.test(element.getAttribute("aria-label") ?? element.textContent ?? "")
    );

    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(micIndex).toBeGreaterThan(saveIndex);
  });
});
