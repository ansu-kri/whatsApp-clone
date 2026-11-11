import { useEffect, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Phone,
  Search,
  Video,
  X,
} from "lucide-react";
import type { ChatMessage, ChatUser } from "./types";
import UserAvatar from "./UserAvatar";
import { API_BASE_URL } from "@/app/api";

type Props = { user: ChatUser; messages: ChatMessage[]; onClose: () => void };

function MediaThumb({
  message,
  userId,
}: {
  message: ChatMessage;
  userId: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const token = localStorage.getItem("token");
    const url = message.attachmentUrl || "";
    fetch(
      url.startsWith("http") ? url : new URL(url, API_BASE_URL).toString(),
      {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.attachmentUrl, userId]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-[#f0f2f5]">
      {src ? (
        message.mediaType?.startsWith("video/") ? (
          <video src={src} className="h-full w-full object-cover" muted />
        ) : (
          <img
            src={src}
            alt={message.fileName || "Shared media"}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <div className="flex h-full items-center justify-center text-gray-400">
          <FileText size={22} />
        </div>
      )}
    </div>
  );
}

export default function ContactInfoPanel({ user, messages, onClose }: Props) {
  const media = messages.filter((m) => !!m.attachmentUrl && !m.deleted);
  const imageMedia = media.filter(
    (m) =>
      m.mediaType?.startsWith("image/") || m.mediaType?.startsWith("video/"),
  );
  const links = messages.filter(
    (m) => !m.deleted && /https?:\/\//i.test(m.message || ""),
  );
  const docs = media.filter(
    (m) =>
      !m.mediaType?.startsWith("image/") && !m.mediaType?.startsWith("video/"),
  );
  return (
    <aside
      aria-label="Contact info"
      className="absolute inset-0 z-40 flex min-w-0 flex-col border-l border-[#e9edef] bg-white sm:static sm:inset-auto sm:z-auto sm:w-[min(360px,42vw)] sm:shrink-0"
    >
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#e9edef] px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact info"
          className="rounded-full p-2 text-[#54656f] hover:bg-[#f0f2f5]"
        >
          <X size={22} />
        </button>
        <h2 className="text-base font-medium text-[#111b21]">Contact info</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="flex flex-col items-center px-5 pb-8 pt-5">
          <UserAvatar
            userId={user.id}
            name={user.name}
            imageUrl={user.avatar}
            className="h-[120px] w-[120px] rounded-full object-cover"
          />
          <h3 className="mt-4 text-2xl font-normal text-[#111b21]">
            {user.name}
          </h3>
          <p className="mt-1 text-sm text-[#667781]">
            {user.phone || user.email || ""}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              aria-label="Voice call"
              className="flex h-[70px] w-[78px] flex-col items-center justify-center gap-1 rounded-2xl bg-[#f5f6f6] text-[#111b21]"
            >
              <Phone size={21} />
              <span className="text-xs text-[#008069]">Voice</span>
            </button>
            <button
              type="button"
              aria-label="Video call"
              className="flex h-[70px] w-[78px] flex-col items-center justify-center gap-1 rounded-2xl bg-[#f5f6f6] text-[#111b21]"
            >
              <Video size={21} />
              <span className="text-xs text-[#008069]">Video</span>
            </button>
            <button
              type="button"
              aria-label="Search"
              className="flex h-[70px] w-[78px] flex-col items-center justify-center gap-1 rounded-2xl bg-[#f5f6f6] text-[#111b21]"
            >
              <Search size={21} />
              <span className="text-xs text-[#008069]">Search</span>
            </button>
          </div>
        </section>
        <section className="border-t border-[#e9edef] px-5 py-5">
          <div className="flex items-center gap-3 text-[#54656f]">
            <ImageIcon size={21} />
            <h3 className="flex-1 text-base font-medium text-[#111b21]">
              Media, links and docs
            </h3>
            <span className="text-sm">{media.length + links.length}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {imageMedia
              .slice(-6)
              .reverse()
              .map((item) => (
                <MediaThumb key={item.id} message={item} userId={user.id} />
              ))}
          </div>
          {imageMedia.length === 0 && (
            <p className="mt-3 text-sm text-[#667781]">No shared media</p>
          )}
          {(links.length > 0 || docs.length > 0) && (
            <div className="mt-4 flex gap-4 text-xs text-[#667781]">
              <span className="flex items-center gap-1">
                <LinkIcon size={14} />
                {links.length} links
              </span>
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {docs.length} docs
              </span>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
