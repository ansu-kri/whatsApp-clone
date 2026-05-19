import { useRef } from "react";

type Props = {
  message: string;
  setMessage: (val: string) => void;
  onSend: () => void;

  socket?: WebSocket | null;

  meId?: string;
  receiverId?: string;
};

export default function MessageInput({
  message,
  setMessage,
  onSend,
  socket,
  meId,
  receiverId,
}: Props) {

  // =========================
  // TYPING COOLDOWN
  // =========================
  const typingCooldownRef = useRef<boolean>(false);

  // =========================
  // HANDLE TYPING
  // =========================
const handleTyping = () => {
  if (!socket || !meId || !receiverId) return;

  if (socket.readyState !== WebSocket.OPEN) return;

  if (typingCooldownRef.current) return;

  typingCooldownRef.current = true;

  socket.send(
    JSON.stringify({
      type: "typing",
      senderId: meId,
      receiverId,
    })
  );

  setTimeout(() => {
    typingCooldownRef.current = false;
  }, 1500);
};

  return (
    <div className="flex gap-2 p-4 border-t bg-white">
      <input
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          handleTyping();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSend();
          }
        }}
        className="flex-1 border rounded-full px-4 py-2 outline-none"
        placeholder="Type a message..."
      />

      <button
        onClick={onSend}
        className="bg-blue-500 text-white px-5 py-2 rounded-full"
      >
        Send
      </button>
    </div>
  );
}