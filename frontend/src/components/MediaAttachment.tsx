import { useEffect, useState } from "react";

type Props = {
  url: string;
  mediaType?: string;
  fileName?: string;
  voiceMessage?: boolean;
  durationSeconds?: number;
};

export default function MediaAttachment({
  url,
  mediaType = "",
  fileName = "media",
  voiceMessage = false,
  durationSeconds,
}: Props) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const token = localStorage.getItem("token");
    fetch(url.startsWith("http") ? url : `http://127.0.0.1:8000${url}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Media is unavailable or you do not have access.");
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSrc(objectUrl);
      })
      .catch((e) => active && setError(e.message || "Could not load media."));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  if (error) return <p className="mt-2 text-xs text-red-600">{error}</p>;
  if (!src)
    return <p className="mt-2 text-xs text-gray-500">Loading media...</p>;
  const video = mediaType.startsWith("video/");
  const audio = voiceMessage || mediaType.startsWith("audio/");
  return (
    <div className="mt-2 max-w-full">
      {audio ? (
        <div className="flex items-center gap-2">
          <audio className="max-w-full" src={src} controls preload="metadata" />
          <span className="text-xs">
            {durationSeconds
              ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`
              : "Voice message"}
          </span>
        </div>
      ) : video ? (
        <video
          className="max-h-80 max-w-full rounded-lg"
          src={src}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          className="max-h-80 max-w-full rounded-lg object-contain"
          src={src}
          alt={fileName}
        />
      )}
      <a
        className="mt-1 block text-xs underline"
        href={src}
        download={fileName}
      >
        Download {fileName}
      </a>
    </div>
  );
}
