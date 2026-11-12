import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Volume2,
  VolumeX,
} from "lucide-react";
import { subscribePrivateSocket } from "@/socket/socket";
import { API_BASE_URL } from "@/app/api";
import type { ChatUser } from "./types";
import UserAvatar from "./UserAvatar";
import toast from "react-hot-toast";

type Kind = "audio" | "video";
type Call = {
  callId: string;
  callerId: string;
  receiverId: string;
  callType: Kind;
  status: string;
};
type Props = {
  userId: string;
  users: ChatUser[];
  startCall: { user: ChatUser; type: Kind } | null;
  onStartHandled: () => void;
};
const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export default function CallManager({
  userId,
  users,
  startCall,
  onStartHandled,
}: Props) {
  const [call, setCall] = useState<Call | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">(
    "user",
  );
  const [speakerOn, setSpeakerOn] = useState(true);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const callRef = useRef<Call | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const ringtone = useRef<{ ctx: AudioContext; osc: OscillatorNode } | null>(
    null,
  );
  const peer = call
    ? users.find(
        (u) =>
          u.id === (call.callerId === userId ? call.receiverId : call.callerId),
      )
    : undefined;
  const isCaller = call?.callerId === userId;
  const send = (data: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(data));
    return true;
  };
  const stopRing = () => {
    try {
      ringtone.current?.osc.stop();
      void ringtone.current?.ctx.close();
    } catch {
      /* already stopped */
    }
    ringtone.current = null;
  };
  const cleanup = () => {
    stopRing();
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocal(null);
    setRemote(null);
    setMuted(false);
    setCameraOn(true);
    setCameraFacing("user");
    setSpeakerOn(true);
    pendingIce.current = [];
    setElapsed(0);
  };
  const endCall = (status = "ended") => {
    const current = callRef.current;
    if (current) send({ type: "call_end", callId: current.callId, status });
    cleanup();
    callRef.current = null;
    setCall(null);
  };
  const setCurrentCall = (next: Call | null) => {
    callRef.current = next;
    setCall(next);
  };
  const startMedia = async (kind: Kind) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
    localRef.current = stream;
    setLocal(stream);
    return stream;
  };

  useEffect(
    () =>
      subscribePrivateSocket(userId, (ws) => {
        socketRef.current = ws;
      }),
    [userId],
  );
  useEffect(() => {
    if (!startCall || callRef.current) return;
    void (async () => {
      try {
        await startMedia(startCall.type);
        await waitForSocket(socketRef);
        if (
          !send({
            type: "call_start",
            receiverId: startCall.user.id,
            callType: startCall.type,
          })
        )
          throw new Error("The call server is unavailable.");
      } catch (error) {
        cleanup();
        window.alert(
          error instanceof Error
            ? error.message
            : "Please allow microphone and camera access to call.",
        );
        onStartHandled();
      }
    })();
  }, [startCall]);

  useEffect(() => {
    const handle = async (event: MessageEvent) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "call_incoming") {
        setCurrentCall(data.call);
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 440;
          gain.gain.value = 0.04;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          ringtone.current = { ctx, osc };
        } catch {
          /* autoplay policy may block ringtone */
        }
      } else if (data.type === "call_ringing") {
        setCurrentCall(data.call);
        onStartHandled();
      } else if (data.type === "call_accepted") {
        stopRing();
        const current = callRef.current;
        const stream = localRef.current;
        if (!current || !stream || current.callId !== data.callId) return;
        if (data.offer) {
          await ensurePeer(
            current,
            stream,
            send,
            pcRef,
            setRemote,
            remoteVideo,
          );
          await pcRef.current!.setRemoteDescription(data.offer);
          await flushIce(pcRef.current, pendingIce.current);
          const answer = await pcRef.current!.createAnswer();
          await pcRef.current!.setLocalDescription(answer);
          send({ type: "call_answer", callId: current.callId, answer });
        } else {
          await ensurePeer(
            current,
            stream,
            send,
            pcRef,
            setRemote,
            remoteVideo,
          );
          const offer = await pcRef.current!.createOffer();
          await pcRef.current!.setLocalDescription(offer);
          send({ type: "call_offer", callId: current.callId, offer });
        }
        setCurrentCall({ ...current, status: "connecting" });
      } else if (data.type === "call_offer") {
        const current = callRef.current;
        const stream = localRef.current;
        if (!current || !stream || current.callId !== data.callId) return;
        await ensurePeer(current, stream, send, pcRef, setRemote, remoteVideo);
        await pcRef.current!.setRemoteDescription(data.offer);
        await flushIce(pcRef.current, pendingIce.current);
        const answer = await pcRef.current!.createAnswer();
        await pcRef.current!.setLocalDescription(answer);
        send({ type: "call_answer", callId: current.callId, answer });
        setCurrentCall({ ...current, status: "connecting" });
      } else if (
        data.type === "call_answer" &&
        callRef.current?.callId === data.callId
      ) {
        const pc = pcRef.current;
        if (pc) {
          await pc.setRemoteDescription(data.answer);
          await flushIce(pc, pendingIce.current);
        }
      } else if (
        data.type === "call_ice" &&
        callRef.current?.callId === data.callId
      ) {
        if (!pcRef.current?.remoteDescription)
          pendingIce.current.push(data.candidate);
        else {
          try {
            await pcRef.current.addIceCandidate(data.candidate);
          } catch {
            /* stale candidate */
          }
        }
      } else if (
        data.type === "call_ended" &&
        callRef.current?.callId === data.callId
      ) {
        cleanup();
        callRef.current = null;
        setCall(null);
      } else if (data.type === "call_failed") {
        cleanup();
        callRef.current = null;
        setCall(null);
        onStartHandled();
        if (data.reason === "offline") {
          toast("This person is currently offline.", {
            duration: 3000,
            style: { background: "#20163a", color: "#fff", borderRadius: "12px" },
          });
        } else {
          window.alert(
            data.reason === "busy"
              ? "This person is already on another call."
              : data.reason || "Call could not be connected.",
          );
        }
      }
    };
    const bind = (ws: WebSocket) => {
      socketRef.current = ws;
      ws.addEventListener("message", handle);
    };
    const unsub = subscribePrivateSocket(userId, bind);
    return () => {
      unsub();
      socketRef.current?.removeEventListener("message", handle);
    };
  }, [userId]);
  useEffect(() => {
    const connected = () => {
      const current = callRef.current;
      if (current) setCurrentCall({ ...current, status: "connected" });
    };
    const failed = () => {
      cleanup();
      callRef.current = null;
      setCall(null);
    };
    window.addEventListener("chatty-call-connected", connected);
    window.addEventListener("chatty-call-failed", failed);
    return () => {
      window.removeEventListener("chatty-call-connected", connected);
      window.removeEventListener("chatty-call-failed", failed);
    };
  }, []);
  useEffect(() => {
    if (!call || call.status !== "connected") return;
    const timer = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [call?.status]);
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = local;
  }, [local]);
  useEffect(() => {
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = remote;
      remoteVideo.current.muted = true;
    }
    if (remoteAudio.current) {
      remoteAudio.current.srcObject = remote;
      remoteAudio.current.muted = !speakerOn;
    }
  }, [remote, speakerOn]);
  useEffect(() => () => cleanup(), []);

  const accept = async () => {
    if (!call) return;
    try {
      await startMedia(call.callType);
      await waitForSocket(socketRef);
      if (!send({ type: "call_accept", callId: call.callId }))
        throw new Error("The call server is unavailable.");
      stopRing();
      setCurrentCall({ ...call, status: "connecting" });
    } catch {
      endCall("failed");
      window.alert("Please allow microphone and camera access to answer.");
    }
  };
  if (!call) return null;
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101820] text-white">
      <audio ref={remoteAudio} autoPlay className="hidden" />
      {call.callType === "video" && (
        <>
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            className="absolute right-4 top-4 h-32 w-24 rounded-xl bg-black object-cover sm:right-6 sm:top-6 sm:h-48 sm:w-36"
          />
        </>
      )}
      <div className="relative z-10 flex flex-col items-center gap-5 rounded-3xl bg-black/35 p-8 backdrop-blur-sm">
        <UserAvatar
          userId={peer?.id}
          name={peer?.name || "Contact"}
          imageUrl={peer?.avatar}
          className="h-28 w-28 animate-pulse rounded-full object-cover"
        />
        <h2 className="text-2xl font-semibold">{peer?.name || "Contact"}</h2>
        <p className="text-white/75">
          {call.status === "connected"
            ? time
            : call.status === "connecting"
              ? "Connecting…"
              : isCaller
                ? "Calling…"
                : `Incoming ${call.callType} call`}
        </p>
        <div className="flex gap-5">
          {!isCaller && call.status === "ringing" && (
            <button
              onClick={() => void accept()}
              aria-label="Accept call"
              className="rounded-full bg-green-600 p-4"
            >
              <PhoneOff className="rotate-[135deg]" />
            </button>
          )}
          {!isCaller && call.status === "ringing" && (
            <button
              onClick={() => endCall("rejected")}
              aria-label="Reject call"
              className="rounded-full bg-red-600 p-4"
            >
              <PhoneOff />
            </button>
          )}
          {(call.status === "connected" || call.status === "connecting") && (
            <>
              <button
                onClick={() => {
                  const next = !muted;
                  localRef.current
                    ?.getAudioTracks()
                    .forEach((t) => (t.enabled = !next));
                  setMuted(next);
                }}
                aria-label="Toggle microphone"
                className="rounded-full bg-white/20 p-4"
              >
                {muted ? <MicOff /> : <Mic />}
              </button>
              {call.callType === "video" && (
                <>
                  <button
                    onClick={() => {
                      const next = !cameraOn;
                      localRef.current
                        ?.getVideoTracks()
                        .forEach((t) => (t.enabled = !next));
                      setCameraOn(next);
                    }}
                    aria-label="Toggle camera"
                    className="rounded-full bg-white/20 p-4"
                  >
                    {cameraOn ? <Camera /> : <CameraOff />}
                  </button>
                  <button
                    onClick={() => {
                      const next =
                        cameraFacing === "user" ? "environment" : "user";
                      void (async () => {
                        let replacement: MediaStreamTrack | undefined;
                        try {
                          replacement = (
                            await navigator.mediaDevices.getUserMedia({
                              video: { facingMode: { ideal: next } },
                              audio: false,
                            })
                          ).getVideoTracks()[0];
                          const current = localRef.current;
                          const previous = current?.getVideoTracks()[0];
                          if (!replacement || !current || !previous) return;
                          const sender = pcRef.current
                            ?.getSenders()
                            .find((item) => item.track?.kind === "video");
                          await sender?.replaceTrack(replacement);
                          current.removeTrack(previous);
                          current.addTrack(replacement);
                          previous.stop();
                          setLocal(new MediaStream(current.getTracks()));
                          setCameraFacing(next);
                        } catch {
                          replacement?.stop();
                        }
                      })();
                    }}
                    aria-label="Switch camera"
                    className="rounded-full bg-white/20 p-4"
                  >
                    <SwitchCamera />
                  </button>
                </>
              )}
              <button
                onClick={() => setSpeakerOn((active) => !active)}
                aria-label="Toggle speaker"
                className="rounded-full bg-white/20 p-4"
              >
                {speakerOn ? <Volume2 /> : <VolumeX />}
              </button>
            </>
          )}
          <button
            onClick={() => endCall(isCaller ? "cancelled" : "ended")}
            aria-label="End call"
            className="rounded-full bg-red-600 p-4"
          >
            <PhoneOff />
          </button>
        </div>
      </div>
    </div>
  );
}

async function ensurePeer(
  call: Call,
  stream: MediaStream,
  send: (data: object) => void,
  pcRef: React.MutableRefObject<RTCPeerConnection | null>,
  setRemote: (stream: MediaStream) => void,
  remoteVideo: React.RefObject<HTMLVideoElement | null>,
) {
  if (pcRef.current) return;
  let servers = iceServers;
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_BASE_URL}/api/calls/ice-servers`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (response.ok) servers = (await response.json()).iceServers || servers;
  } catch {
    /* STUN fallback */
  }
  const pc = new RTCPeerConnection({ iceServers: servers });
  pcRef.current = pc;
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  pc.ontrack = (event) => {
    const incoming = event.streams[0];
    setRemote(incoming);
    if (remoteVideo.current) remoteVideo.current.srcObject = incoming;
  };
  pc.onicecandidate = (event) => {
    if (event.candidate)
      send({
        type: "call_ice",
        callId: call.callId,
        candidate: event.candidate,
      });
  };
  let disconnectTimer: number | undefined;
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      window.clearTimeout(disconnectTimer);
      window.dispatchEvent(new CustomEvent("chatty-call-connected"));
    } else if (pc.connectionState === "disconnected") {
      disconnectTimer = window.setTimeout(() => {
        if (pc.connectionState === "disconnected") {
          send({ type: "call_end", callId: call.callId, status: "failed" });
          window.dispatchEvent(new CustomEvent("chatty-call-failed"));
        }
      }, 12000);
    } else if (pc.connectionState === "failed") {
      send({ type: "call_end", callId: call.callId, status: "failed" });
      window.dispatchEvent(new CustomEvent("chatty-call-failed"));
    }
  };
}

async function flushIce(
  pc: RTCPeerConnection | null,
  queue: RTCIceCandidateInit[],
) {
  if (!pc?.remoteDescription) return;
  const pending = queue.splice(0);
  for (const candidate of pending) {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      /* ignore stale candidate */
    }
  }
}

async function waitForSocket(ref: React.MutableRefObject<WebSocket | null>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (ref.current?.readyState === WebSocket.OPEN) return;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("Could not connect to the call server. Please try again.");
}
