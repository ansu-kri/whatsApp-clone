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
  // =========================TYPING COOLDOWN
  const typingCooldownRef = useRef<boolean>(false);

  // ======================== HANDLE TYPING
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
      }),
    );

    setTimeout(() => {
      typingCooldownRef.current = false;
    }, 1500);
  };

  return (
    <div className="flex items-center gap-3">
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
        className=" flex-1 bg-gray-100 rounded-full px-5 py-3 outline-none border border-transparent focus:border-blue-400 focus:bg-white transition-all duration-200 "
        placeholder="Type a message..."
      />

      <button
        onClick={onSend}
        className=" bg-gradient-to-r from-blue-500 to-indigo-500 hover:scale-105 active:scale-95
      transition-all text-white px-5 py-3 rounded-full shadow-lg font-medium"
      >
        Send
      </button>
    </div>
  );
}
