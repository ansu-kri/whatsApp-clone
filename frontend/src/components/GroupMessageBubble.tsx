import { useState } from "react";
import type { ChatMessage, GroupMessage } from "./types";

type Props = {
  message?: ChatMessage | GroupMessage;
  currentUserId: string;
  onEdit?: (msg: ChatMessage | GroupMessage) => void;
  onDelete?: (msg: ChatMessage | GroupMessage) => void;
};

export default function GroupMessageBubble({
  message,
  currentUserId,
  onEdit,
  onDelete,
}: Props) {
  const [showActions, setShowActions] = useState(false);

  // Prevent crash if message is undefined
  if (!message) {
    return null;
  }

  const isMe = message.senderId === currentUserId;
  const messageId = message.id;

  return (
    <div
      className={`w-full flex ${
        isMe ? "justify-end" : "justify-start"
      }`}
    >
      <div
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onClick={() => setShowActions((prev) => !prev)}
        className={`relative max-w-[320px] px-4 py-2 rounded-2xl shadow-sm break-words text-sm leading-relaxed transition-all duration-200
          ${
            message.deleted
              ? "bg-gray-100 text-gray-400 italic"
              : isMe
              ? "bg-green-100 text-black rounded-br-md"
              : "bg-white text-gray-800 rounded-bl-md border border-gray-100"
          }
        `}
      >
        {/* Edit/Delete Actions */}
        {isMe && showActions && !message.deleted && (
          <div className="absolute -bottom-8 right-0 z-50 flex gap-2 bg-white shadow-lg rounded-lg px-2 py-1 border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(message);
              }}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Edit
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (messageId) {
                  onDelete?.(message);
                }
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        )}

        {/* Message Content */}
        <p className="text-sm whitespace-pre-wrap">
          {message.deleted ? (
            <span className="italic text-gray-400">
              This message was deleted
            </span>
          ) : (
            message.message
          )}
        </p>

        {/* Footer */}
        <div className="text-[11px] text-gray-500 mt-1 flex justify-end items-center gap-1">
          {message.edited && !message.deleted && (
            <span className="italic">edited</span>
          )}

          <span>
            {message.createdAt
              ? new Date(message.createdAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
              : ""}
          </span>

          {isMe && (
            <span
              className={
                message.status === "seen"
                  ? "text-blue-500"
                  : "text-gray-400"
              }
            >
              {message.status === "sent" && "✓"}
              {message.status === "delivered" && "✓✓"}
              {message.status === "seen" && "✓✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}