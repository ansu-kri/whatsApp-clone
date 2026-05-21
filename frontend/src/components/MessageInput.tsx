
import { useRef, useState } from "react";

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
  const typingCooldownRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showEmoji, setShowEmoji] = useState(false);

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

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TODO: upload logic here
    console.log("Selected file:", file);
  };

  const addEmoji = (emoji: string) => {
    setMessage(message + emoji);
  };

  return (
    <div className="w-full px-2 sm:px-4">
      <div className="flex items-end gap-2 sm:gap-3 bg-white/80 backdrop-blur-xl border border-gray-200 shadow-lg rounded-2xl p-2 sm:p-3">
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Emoji */}
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
            title="Emoji"
          >
            😊
          </button>

          {/* File */}
          <button
            onClick={handleFilePick}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
            title="Attach file"
          >
            📎
          </button>

          {/* Voice */}
          <button
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
            title="Voice message"
          >
            🎙
          </button>
        </div>

        {/* INPUT */}
        <input
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          className="flex-1 bg-transparent outline-none text-gray-700 placeholder:text-gray-400 px-2 py-2"
          placeholder="Type a message..."
        />

        {/* SEND */}
        <button
          onClick={onSend}
          className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 active:scale-95 transition text-white px-4 sm:px-6 py-2 rounded-xl shadow-md font-medium"
        >
          Send
        </button>
      </div>

      {/* SIMPLE EMOJI PANEL (placeholder) */}
      {showEmoji && (
        <div className="mt-2 flex gap-2 flex-wrap bg-white border rounded-xl p-2 shadow">
          {["😀", "😂", "😍", "😎", "😭", "👍", "🔥", "🎉"].map((e) => (
            <button
              key={e}
              onClick={() => addEmoji(e)}
              className="text-xl hover:scale-110 transition"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}