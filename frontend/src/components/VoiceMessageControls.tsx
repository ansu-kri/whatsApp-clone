import { useEffect, useRef, useState } from "react";
import { uploadMedia } from "../app/uploadMedia";
type Props = {
  socket?: WebSocket | null;
  meId?: string;
  receiverId?: string;
  groupId?: string;
  message: string;
  setMessage: (v: string) => void;
  onBeforeSend?: () => void;
};
const fmt = (n: number) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
export default function VoiceMessageControls({
  socket,
  meId,
  receiverId,
  groupId,
  message,
  setMessage,
  onBeforeSend,
}: Props) {
  const speechRec = useRef<any>(null),
    rec = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    canceled = useRef(false),
    started = useRef(0);
  const [recording, R] = useState(false),
    [blob, B] = useState<Blob | null>(null),
    [src, S] = useState(""),
    [seconds, D] = useState(0),
    [progress, P] = useState<number | null>(null),
    [error, E] = useState(""),
    [speech, Q] = useState(false),
    [notice, N] = useState("");
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () => D(Math.floor((Date.now() - started.current) / 1000)),
      250,
    );
    return () => clearInterval(id);
  }, [recording]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );
  const startRecording = async () => {
    E("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      E("Voice recording is not supported in this browser.");
      return;
    }
    if (!window.isSecureContext) {
      E("Microphone access requires HTTPS or localhost.");
      return;
    }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = st;
      const mt = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const r = mt
        ? new MediaRecorder(st, { mimeType: mt })
        : new MediaRecorder(st);
      rec.current = r;
      chunks.current = [];
      canceled.current = false;
      started.current = Date.now();
      D(0);
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = () => {
        st.getTracks().forEach((t) => t.stop());
        stream.current = null;
        R(false);
        if (canceled.current) return;
        const b = new Blob(chunks.current, {
          type: r.mimeType || "audio/webm",
        });
        if (!b.size) {
          E("No audio was recorded.");
          return;
        }
        B(b);
        D(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        S(URL.createObjectURL(b));
      };
      r.start();
      R(true);
    } catch (e) {
      E(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied. Allow access in browser settings."
          : "Could not access the microphone.",
      );
    }
  };
  const clear = () => {
    if (recording) {
      canceled.current = true;
      if (rec.current?.state === "recording") rec.current.stop();
    }
    B(null);
    if (src) URL.revokeObjectURL(src);
    S("");
    D(0);
    E("");
  };
  const send = async () => {
    if (!blob || !meId || !socket || socket.readyState !== WebSocket.OPEN) {
      E("Chat is reconnecting. Keep this recording and try again.");
      return;
    }
    try {
      P(0);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const u = await uploadMedia(
        new File([blob], `voice-message.${ext}`, {
          type: blob.type.split(";")[0],
        }),
        P,
      );
      onBeforeSend?.();
      socket.send(
        JSON.stringify({
          type: groupId ? "group_message" : "message",
          senderId: meId,
          ...(groupId ? { groupId } : { receiverId }),
          message: "",
          attachmentUrl: u.mediaUrl,
          mediaType: u.mediaType,
          fileName: u.fileName,
          voiceMessage: true,
          durationSeconds: seconds,
        }),
      );
      P(null);
      clear();
    } catch (e) {
      P(null);
      E(e instanceof Error ? e.message : "Voice upload failed.");
    }
  };
  const speechToText = () => {
    const w = window as any,
      SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      N(
        "Speech-to-text is not supported by this browser. Voice recording is still available.",
      );
      return;
    }
    if (speech) {
      speechRec.current?.stop();
      Q(false);
      return;
    }
    const sr = new SR();
    speechRec.current = sr;
    sr.lang = navigator.language || "en-US";
    sr.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .map((x: any) => x[0].transcript)
        .join(" ")
        .trim();
      if (text) setMessage(message ? `${message.trim()} ${text}` : text);
    };
    sr.onerror = (e: any) => {
      N(
        e.error === "not-allowed"
          ? "Microphone permission denied for speech-to-text."
          : "Speech recognition stopped.",
      );
      Q(false);
    };
    sr.onend = () => Q(false);
    try {
      sr.start();
      Q(true);
      N("Listening. Recognized text can be edited before sending.");
    } catch {
      N("Speech recognition could not start.");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {recording ? (
        <button
          type="button"
          onClick={() => rec.current?.stop()}
          className="text-red-600"
        >
          Stop {fmt(seconds)}
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          disabled={progress !== null || speech}
          aria-label="Record voice message"
        >
          Record
        </button>
      )}
      <button
        type="button"
        onClick={speechToText}
        disabled={recording}
        aria-label="Speech to text"
      >
        {speech ? "Stop listening" : "Speak to text"}
      </button>
      {blob && !recording && (
        <>
          <audio
            src={src}
            controls
            className="w-36"
            aria-label="Voice recording preview"
          />
          <span className="text-xs">{fmt(seconds)}</span>
          <button type="button" onClick={clear}>
            Delete
          </button>
          <button type="button" onClick={send} disabled={progress !== null}>
            Send voice
          </button>
        </>
      )}
      {progress !== null && <span role="status">Uploading {progress}%</span>}
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
      {notice && (
        <span role="status" className="text-xs text-gray-600">
          {notice}
        </span>
      )}
    </div>
  );
}
