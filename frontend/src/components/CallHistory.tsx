import { useCallback, useEffect, useState } from "react";
import { Phone, Video, X } from "lucide-react";
import { API_BASE_URL } from "@/app/api";
import type { ChatUser } from "./types";

type Item = {
  id: string;
  callerId: string;
  receiverId: string;
  callType: "audio" | "video";
  status: string;
  startTime: string | null;
  duration: number;
};
type Props = {
  users: ChatUser[];
  userId: string;
  onCall: (user: ChatUser, type: "audio" | "video") => void;
  open: boolean;
  onClose: () => void;
};
export default function CallHistory({ users, userId, onCall, open, onClose }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/calls/history`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) setItems(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex justify-center bg-black/45 p-4 sm:items-center"
          onClick={onClose}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Call history"
            className="mt-auto max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white text-[#111b21] shadow-2xl sm:my-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">Call history</h2>
              <button
                onClick={onClose}
                aria-label="Close call history"
              >
                <X size={20} />
              </button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto">
              {loading ? (
                <p className="p-6 text-center text-sm text-gray-500">
                  Loading calls…
                </p>
              ) : items.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-500">
                  No calls yet
                </p>
              ) : (
                items.map((item) => {
                  const outgoing = item.callerId === userId;
                  const other = users.find(
                    (candidate) =>
                      candidate.id ===
                      (outgoing ? item.receiverId : item.callerId),
                  );
                  const missed =
                    item.status === "missed" || item.status === "rejected";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border-b px-5 py-3"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${missed ? "bg-red-50 text-red-600" : "bg-purple-50 text-purple-700"}`}
                      >
                        {item.callType === "video" ? (
                          <Video size={17} />
                        ) : (
                          <Phone size={17} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${missed ? "text-red-600" : "text-gray-800"}`}
                        >
                          {other?.name || "Chatty user"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {outgoing
                            ? "Outgoing"
                            : missed
                              ? "Missed"
                              : "Incoming"}{" "}
                          · {item.callType} ·{" "}
                          {item.startTime
                            ? new Date(item.startTime).toLocaleString()
                            : ""}
                          {item.duration
                            ? ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, "0")}`
                            : ""}
                        </p>
                      </div>
                      {other && (
                        <button
                          className="rounded-full p-2 text-purple-700 hover:bg-purple-50"
                          title={`Call ${other.name}`}
                          onClick={() => {
                            onClose();
                            onCall(other, item.callType);
                          }}
                        >
                          {item.callType === "video" ? (
                            <Video size={18} />
                          ) : (
                            <Phone size={18} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
