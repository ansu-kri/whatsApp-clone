import { useState, useEffect, useRef } from "react";
import type { ChatUser, ChatMessage } from "./types";
import ChatHeader from "./ChatHeader";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { getSocket, sendSocketMessage } from "../socket/socket";
import { useGetMeQuery } from "../app/userApi";
import { useGetMessageQuery } from "../app/messageApi";
import { skipToken } from "@reduxjs/toolkit/query";

type Props = {
  user: ChatUser;
};

export default function ChatWindow({ user }: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meRef = useRef<any>(null);

  const { data: me } = useGetMeQuery();

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    setMessage("");
  }, [user.id]);

  const { data: oldMessages } = useGetMessageQuery(
    me && user ? { senderId: me.id, receiverId: user.id } : skipToken,
  );

  // ================= SOCKET INIT =================
  useEffect(() => {
    if (!me?.id) return;
    if (socketRef.current) return;

    socketRef.current = getSocket(me.id);
  }, [me]);

  const socket = socketRef.current;

  // ================= LOAD OLD MESSAGES =================
  useEffect(() => {
    if (!oldMessages) return;

    const normalized = oldMessages.map((m: any) => ({
      ...m,
      status: m.status || (m.seen ? "seen" : "sent"),
    }));

    setMessages(normalized);
  }, [oldMessages]);

  // ================= MARK AS SEEN =================
  useEffect(() => {
    if (!me?.id || !user?.id) return;

    sendSocketMessage({
      type: "seen",
      senderId: user.id,
      receiverId: me.id,
    });
  }, [user, me]);

  // ================= SOCKET EVENTS =================
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      // ONLINE USERS
      if (data.type === "online_list") {
        setOnlineUsers(data.users || []);
      }

      // USER ONLINE
      if (data.type === "user_online") {
        setOnlineUsers((prev) =>
          prev.includes(data.userId) ? prev : [...prev, data.userId],
        );
      }

      // USER OFFLINE
      if (data.type === "user_offline") {
        setOnlineUsers((prev) => prev.filter((id) => id !== data.userId));
      }

      // NEW MESSAGE
      if (data.type === "message") {
        const newMessage = {
          ...data.data,
          status: data.data.status || "sent",
        };

        setMessages((prev) => {
          const index = prev.findIndex(
            (msg) =>
              msg.senderId === newMessage.senderId &&
              msg.receiverId === newMessage.receiverId &&
              msg.createdAt === newMessage.createdAt,
          );

          if (index !== -1) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              ...newMessage,
            };
            return updated;
          }

          return [...prev, newMessage];
        });
      }

      // SYNC MESSAGES
      if (data.type === "sync_messages") {
        const normalized = data.data.map((msg: any) => ({
          ...msg,
          status: msg.status || (msg.seen ? "seen" : "sent"),
        }));

        setMessages((prev) => {
          const merged = [...prev];

          normalized.forEach((msg: any) => {
            const index = merged.findIndex(
              (m) =>
                m.senderId === msg.senderId &&
                m.receiverId === msg.receiverId &&
                m.createdAt === msg.createdAt,
            );

            if (index !== -1) {
              merged[index] = { ...merged[index], ...msg };
            } else {
              merged.push(msg);
            }
          });

          return merged;
        });
      }

      // TYPING
      if (data.type === "typing") {
        setTypingUser(data.senderId);

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          setTypingUser(null);
        }, 1200);
      }

      // ================= SEEN UPDATE (FIXED) =================
      if (data.type === "seen_update") {
        const meId = meRef.current?.id;

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.senderId === meId && msg.receiverId === user.id) {
              return {
                ...msg,
                status: "seen",
                seen: true,
              };
            }
            return msg;
          }),
        );
      }
    };

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, user]);

  // ================= AUTO SCROLL =================
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ================= SEND MESSAGE =================
  const sendMessage = () => {
    if (!message.trim() || !me?.id) return;

    sendSocketMessage({
      type: "message",
      senderId: me.id,
      receiverId: user.id,
      message,
      createdAt: new Date().toISOString(),
    });

    setMessage("");
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#e0f2fe]">
      {/* HEADER */}
      <div className="backdrop-blur-xl bg-white/70 border-b border-white/20 shadow-sm">
        <ChatHeader user={user} isOnline={onlineUsers.includes(user.id)} />
      </div>

      {/* CHAT AREA */}
      <div
        className="
        flex-1
        overflow-y-auto
        px-6
        md:px-10
        py-6
        space-y-4
        scrollbar-thin
        scrollbar-thumb-gray-300
      "
      >
        {/* Welcome Section */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-gray-700">
            Conversation with {user.name}
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Real-time messaging experience ⚡
          </p>
        </div>

        {/* Messages */}
        <div className="space-y-3">
          {messages.map((chat, i) => (
            <div
              key={i}
              className="
              animate-fadeIn
              transition-all
              duration-300
            "
            >
              <MessageBubble message={chat} currentUserId={me?.id || ""} />
            </div>
          ))}
        </div>

        {/* Typing */}
        {typingUser === user.id && (
          <div className="flex items-center gap-2 px-3 py-2 w-fit bg-white rounded-full shadow-md">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150"></span>
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-300"></span>
            </div>

            <p className="text-sm text-gray-500">typing...</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT AREA */}
      <div
        className="
        sticky
        bottom-0
        px-4
        md:px-8
        py-4
        backdrop-blur-xl
        bg-white/70
        border-t
        border-white/20
      "
      >
        <div
          className="
          max-w-5xl
          mx-auto
          rounded-2xl
          shadow-lg
          bg-white
          px-3
          py-2
        "
        >
          <MessageInput
            message={message}
            setMessage={setMessage}
            onSend={sendMessage}
            socket={socket}
            meId={me?.id}
            receiverId={user.id}
          />
        </div>
      </div>
    </div>
  );
}
