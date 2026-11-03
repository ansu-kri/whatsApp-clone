import { useRef, useState } from "react";
import { uploadMedia } from "../app/uploadMedia";
import VoiceMessageControls from "./VoiceMessageControls";
// import API from "../app/api";

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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");

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

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];
    if (!allowed.includes(file.type)) {
      setUploadError("Choose a JPEG, PNG, GIF, WebP, MP4, or WebM file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError("Files must be 25 MB or smaller.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setUploadError("Chat is reconnecting. Try again shortly.");
      return;
    }
    try {
      setUploadProgress(0);
      const uploaded = await uploadMedia(file, setUploadProgress);
      socket.send(
        JSON.stringify({
          type: "message",
          senderId: meId,
          receiverId,
          message: "",
          attachmentUrl: uploaded.mediaUrl,
          mediaType: uploaded.mediaType,
          fileName: uploaded.fileName,
        }),
      );
      setUploadProgress(null);
    } catch (error) {
      setUploadProgress(null);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    }
  };

  const addEmoji = (emoji: string) => {
    setMessage(message + emoji);
  };

  return (
    <div className="w-full px-2 sm:px-4">
      <div className="flex items-end gap-2 sm:gap-3 bg-white/80 backdrop-blur-xl border border-gray-200 shadow-lg rounded-2xl p-2 sm:p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
          >
            😊
          </button>

          <button
            onClick={handleFilePick}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
          >
            📎
          </button>

          <VoiceMessageControls
            socket={socket}
            meId={meId}
            receiverId={receiverId}
            message={message}
            setMessage={setMessage}
          />
        </div>

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

        <button
          onClick={onSend}
          className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 active:scale-95 transition text-white px-4 sm:px-6 py-2 rounded-xl shadow-md font-medium"
        >
          Send
        </button>
      </div>

      {uploadProgress !== null && (
        <div className="mx-2 mt-2 text-sm text-gray-600" role="status">
          Uploading media: {uploadProgress}%
          <progress className="ml-2 w-40" max="100" value={uploadProgress} />
        </div>
      )}
      {uploadError && (
        <p className="mx-2 mt-2 text-sm text-red-600" role="alert">
          {uploadError}
        </p>
      )}
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
