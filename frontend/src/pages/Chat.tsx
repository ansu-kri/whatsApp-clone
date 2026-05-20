import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import type { ChatUser } from "../components/types";
import { useEffect, useMemo, useState } from "react";
import { useGetUsersQuery } from "../app/userApi";

export default function Chat() {
  const { data: apiUsers = [], isLoading } = useGetUsersQuery();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

const users: ChatUser[] = useMemo(
  () =>
    apiUsers.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: `https://i.pravatar.cc/150?u=${user.id}`,
      recentMessage: "",
      lastChatTime: "",
      chats: [],
      isOnline: onlineUsers.includes(user.id),
    })),
  [apiUsers]
);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);

  useEffect(() => {
    if (users.length > 0 && !selectedUser) {
      setSelectedUser(users[0]);
    }
  }, [users, selectedUser]);

  if (isLoading) {
    return <div> Loading users...</div>;
  }

  if (!selectedUser) {
    return <div>No users found</div>;
  }

  return (
    <div className="h-screen bg-[#f5f7fb] flex overflow-hidden">
      <Sidebar
        users={users}
        selectedUser={selectedUser}
        onSelectUser={setSelectedUser}
      />

      <ChatWindow
        user={selectedUser}
        // messages={messages}
        // me={me}
        // message={message}
        // setMessage={setMessage}
        // sendMessage={sendMessage}
        // typingUser={typingUser}
        // onlineUsers={onlineUsers}
        // socket={socket}
        // bottomRef={bottomRef}
      />
    </div>
  );
}
