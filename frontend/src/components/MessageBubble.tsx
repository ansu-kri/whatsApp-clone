import type { ChatMessage } from "./types";

type Props = {
  message: ChatMessage;
  currentUserId: string;
};

export default function MessageBubble({
  message,
  currentUserId,
}: Props) {
  console.log("MESSAGE:", message);
  const isMe = message.senderId === currentUserId;

  return (
    <div className={`w-full flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[320px]
          px-4
          py-2
          rounded-2xl
          shadow-sm
          break-words
          ${
            isMe
              ? "bg-[#d9fdd3] text-black rounded-br-md"
              : "bg-white text-black rounded-bl-md"
          }
        `}
      >
        <p className="text-sm">{message.message}</p>

        <div className="text-[11px] text-gray-500 text-right mt-1 flex items-center justify-end gap-1">
          <span>
            {new Date(message.createdAt).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}
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