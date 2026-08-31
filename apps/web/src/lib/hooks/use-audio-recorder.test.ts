import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "./use-audio-recorder";

/**
 * Minimal `MediaRecorder` fake: captures the `ondataavailable`/`onstop` handlers the hook
 * assigns, and exposes `emitData`/`emitStop` so tests can drive it manually -- jsdom does not
 * implement `MediaRecorder` at all.
 */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";
  started = false;
  stopped = false;

  constructor(public stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
    // Real MediaRecorder flushes any pending data before firing `onstop`.
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function makeFakeStream(): MediaStream {
  const track = { stop: vi.fn() };
  return {
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function stubGetUserMedia(resolveWith: MediaStream | Error) {
  const getUserMedia =
    resolveWith instanceof Error
      ? vi.fn().mockRejectedValue(resolveWith)
      : vi.fn().mockResolvedValue(resolveWith);

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  return getUserMedia;
}

describe("useAudioRecorder", () => {
  afterEach(() => {
    FakeMediaRecorder.instances = [];
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });

  it("transitions to status recording after a successful start()", async () => {
    const stream = makeFakeStream();
    stubGetUserMedia(stream);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const { result } = renderHook(() => useAudioRecorder());

    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("recording");
  });

  it("sets status error with a message when getUserMedia rejects (permission denied)", async () => {
    stubGetUserMedia(new Error("Permission denied"));
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("sets status error without throwing when navigator.mediaDevices is absent", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await expect(result.current.start()).resolves.not.toThrow();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("stop() resolves with a Blob assembled from the recorded chunks and releases the stream", async () => {
    const stream = makeFakeStream();
    stubGetUserMedia(stream);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    let blob: Blob | undefined;
    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBeGreaterThan(0);
    expect(blob?.type).toBe("audio/webm");

    const [track] = stream.getTracks();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("stop() called without an active recording is a no-op and does not change status", async () => {
    const { result } = renderHook(() => useAudioRecorder());

    expect(result.current.status).toBe("idle");

    let blob: Blob | undefined;
    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBe(0);
    expect(result.current.status).toBe("idle");
  });
});
