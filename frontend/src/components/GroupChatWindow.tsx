import { useState } from "react";
import type { Group } from "../components/Sidebar";
import ChatHeader from "./ChatHeader";
import GroupMessageBubble from "./GroupMessageBubble";
import GroupMessageInput from "./GroupMessageInput";
import type { ChatMessage } from "./types";

type Props = {
  group: Group;
  setMessage: (val: string) => void;
  onBack: () => void;
  onSend: () => void;
  socket?: WebSocket | null;
};

export default function GroupChatWindow({ group, onBack, onSend }: Props) {
  const currentUserId = localStorage.getItem("userId") || "";
  const [message, setMessag] = useState("");
  // const socketRef = useRef<WebSocket | null>(null);
  // const socket = socketRef.current;

  return (
    <div className="flex-1 flex flex-col h-screen bg-gradient-to-br from-[#20163a] via-[#20163a] to-[#0b0814]">
      {/* HEADER */}
      <ChatHeader type="group" group={group} onBack={onBack} />

      {/* MEMBERS */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm text-gray-400 mb-2 text-center">Members</h3>

        <div className="flex flex-wrap justify-center gap-3">
          {group.members?.map((member: any) => (
            <div
              key={member._id}
              className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg"
            >
              <img
                src={member.avatar}
                alt={member.name}
                className="w-8 h-8 rounded-full object-cover"
              />

              <span className="text-white text-sm">{member.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {group.messages?.length ? (
          group.messages.map((msg: ChatMessage) => (
            <div key={msg.id} className="animate-fadeIn">
              <GroupMessageBubble message={msg} currentUserId={currentUserId} />
            </div>
          ))
        ) : (
          <div className="text-center text-gray-400 mt-10">No messages yet</div>
        )}
      </div>

      {/* INPUT */}
      <div className="sticky bottom-0 px-4 md:px-8 py-4 bg-white/10 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md px-3 py-2">
          <GroupMessageInput
            message={message}
            setMessage={setMessag}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  );
}
