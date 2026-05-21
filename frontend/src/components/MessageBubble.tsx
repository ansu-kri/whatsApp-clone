import type { ChatMessage } from "./types";

type Props = {
  message: ChatMessage;
  currentUserId: string;
};

export default function MessageBubble({ message, currentUserId }: Props) {
  console.log("MESSAGE:", message);
  const isMe = message.senderId === currentUserId;

  return (
    <div className={`w-full flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={` max-w-[320px] px-4 py-2 rounded-2xl shadow-sm break-words text-sm leading-relaxed transition
          ${
            isMe
              ? "bg-gradient-to-r from-green-200 to-green-100 text-black rounded-br-md"
              : "bg-white text-gray-800 rounded-bl-md border border-gray-100"
          }
        `}
      >
        <p className="text-sm">{message.message}</p>

        <div className="text-[11px] text-gray-500 mt-1 flex justify-end gap-1 items-center">
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
                message.status === "seen" ? "text-blue-500" : "text-gray-400"
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
