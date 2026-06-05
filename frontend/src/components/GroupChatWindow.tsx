import React, { useEffect, useRef, useState } from "react";
import type { Group } from "../components/Sidebar";
import ChatHeader from "./ChatHeader";
import GroupMessageBubble from "./GroupMessageBubble";
import GroupMessageInput from "./GroupMessageInput";
import type { GroupMessage } from "./types";
import { useGetGroupMessageQuery } from "@/app/groupApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { getGroupSocket, sendSocketMessage } from "@/socket/socket";

type Props = {
  group: Group;
  onBack: () => void;
  setRecentMessages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
};

export default function GroupChatWindow({
  group,
  onBack,
  setRecentMessages,
}: Props) {
  const currentUserId = localStorage.getItem("userId") || "";

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [typingUser] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ================= LOAD MESSAGES =================

  const { data: groupMessages = [] } = useGetGroupMessageQuery(
    group?.id ? { groupId: group.id } : skipToken
  );

  useEffect(() => {
    if (!groupMessages.length) return;

    const normalized: GroupMessage[] = groupMessages.map((m: any) => ({
      id: m.id,
      senderId: m.senderId,
      groupId: m.groupId,
      message: m.message,
      createdAt: m.createdAt,
      status: m.status || "sent",
      edited: m.edited || false,
      deleted: m.deleted || false,
    }));

    setMessages(normalized);

    const lastMsg = normalized[normalized.length - 1];

    if (lastMsg) {
      setRecentMessages((prev) => ({
        ...prev,
        [group.id]: lastMsg.deleted
          ? "This message was deleted"
          : lastMsg.message,
      }));
    }
  }, [groupMessages, group.id, setRecentMessages]);

  // ================= SOCKET INIT =================

  useEffect(() => {
  if (!group?.id || !currentUserId) return;

  const socket = getGroupSocket(group.id);
  socketRef.current = socket;

  const handleOpen = () => {
    console.log("Socket ready for group:", group.id);
  };

  socket.addEventListener("open", handleOpen);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "group_message") {
      setMessages((prev) => [...prev, data.data]);
    }
  };

  return () => {
    socket.removeEventListener("open", handleOpen);
  };
}, [group.id, currentUserId]);

  // ================= AUTO SCROLL =================

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // ================= SEND MESSAGE =================

const sendMessage = () => {
  if (!message.trim()) return;

  const success = sendSocketMessage(
    {
      type: "group_message",
      groupId: group.id,
      senderId: currentUserId,
      message,
      createdAt: new Date().toISOString(),
    },
    "group",
    group.id
  );

  if (!success) {
    console.log("Group socket not ready OR still connecting");
    return;
  }

  setMessage("");
};

  return (
    <div className="flex-1 flex flex-col h-screen bg-gradient-to-br from-[#20163a] via-[#20163a] to-[#0b0814]">
      {/* HEADER */}
      <ChatHeader type="group" group={group} onBack={onBack} />

      {/* MEMBERS */}
      <div className="px-4 py-3">
        <h3 className="text-sm text-gray-400 mb-2 text-center">
          Members
        </h3>

        <div className="flex flex-wrap justify-center gap-3">
          {group.members?.map((member: any) => (
            <div
              key={member.id}
              className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg"
            >
              <img
                src={member.avatar}
                alt={member.name}
                className="w-8 h-8 rounded-full object-cover"
              />

              <span className="text-white text-sm">
                {member.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.length ? (
            messages.map((chat) => (
              <div key={chat.id} className="animate-fadeIn">
                <GroupMessageBubble
                  message={chat}
                  currentUserId={currentUserId}
                />
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 mt-10">
              No messages yet
            </div>
          )}

          {typingUser && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow w-fit">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-300"></span>

              <p className="text-sm text-gray-500">
                {typingUser} is typing...
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* INPUT */}
      <div className="sticky bottom-0 px-4 md:px-8 py-4">
        <GroupMessageInput
          message={message}
          setMessage={setMessage}
          onSend={sendMessage}
          socket={socketRef.current}
          meId={currentUserId}
          groupId={group.id}
        />
      </div>
    </div>
  );
}