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

  const { data: oldMessages } = useGetMessageQuery(
    me && user
      ? { senderId: me.id, receiverId: user.id }
      : skipToken
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
          prev.includes(data.userId) ? prev : [...prev, data.userId]
        );
      }

      // USER OFFLINE
      if (data.type === "user_offline") {
        setOnlineUsers((prev) =>
          prev.filter((id) => id !== data.userId)
        );
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
              msg.createdAt === newMessage.createdAt
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
                m.createdAt === msg.createdAt
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
            if (
              msg.senderId === meId &&
              msg.receiverId === user.id
            ) {
              return {
                ...msg,
                status: "seen",
                seen: true,
              };
            }
            return msg;
          })
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
    <div className="flex-1 flex flex-col">
      <ChatHeader
        user={user}
        isOnline={onlineUsers.includes(user.id)}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 bg-[#f5f7fb]">
        {messages.map((chat, i) => (
          <MessageBubble
            key={i}
            message={chat}
            currentUserId={me?.id || ""}
          />
        ))}

        {typingUser === user.id && (
          <p className="text-sm text-gray-500 px-2">
            typing...
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageInput
        message={message}
        setMessage={setMessage}
        onSend={sendMessage}
        socket={socket}
        meId={me?.id}
        receiverId={user.id}
      />
    </div>
  );
}