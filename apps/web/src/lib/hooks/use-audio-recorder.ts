import * as React from "react";

export type AudioRecorderStatus = "idle" | "recording" | "error";

export interface UseAudioRecorderResult {
  status: AudioRecorderStatus;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
}

const UNSUPPORTED_MESSAGE = "Este navegador no admite grabación de audio.";
const PERMISSION_DENIED_MESSAGE =
  "No pudimos acceder al micrófono. Revisá los permisos del navegador.";

/**
 * Thin wrapper over the browser's `MediaRecorder` API (AC-08). Deliberately does not import
 * `notify` -- it only reports its state, the caller (Block 7) decides how to surface it, keeping
 * this hook decoupled from the UI layer.
 */
export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = React.useState<AudioRecorderStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const start = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMessage(UNSUPPORTED_MESSAGE);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("error");
      setErrorMessage(PERMISSION_DENIED_MESSAGE);
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.start();
    setErrorMessage(null);
    setStatus("recording");
  }, []);

  const stop = React.useCallback(async (): Promise<Blob> => {
    const recorder = recorderRef.current;
    const stream = streamRef.current;

    if (!recorder || !stream) {
      // Defensive no-op: stop() called without an active recording.
      return new Blob();
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

    stream.getTracks().forEach((track) => track.stop());

    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];

    setStatus("idle");

    return blob;
  }, []);

  return { status, errorMessage, start, stop };
}
