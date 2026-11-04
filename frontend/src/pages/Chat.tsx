import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import type { ChatUser } from "../components/types";
import { useEffect, useMemo, useState } from "react";
import { useGetUsersQuery } from "../app/userApi";
import CreateGroupModal from "@/components/CreateGroupModal";
import { useGetGroupsQuery } from "@/app/groupApi";
import { useDispatch, useSelector } from "react-redux";
import apiSlice from "@/app/api";
import type { Group } from "../components/Sidebar";
import GroupChatWindow from "@/components/GroupChatWindow";
import { getSocket } from "@/socket/socket";
import toast from "react-hot-toast";

export default function Chat() {
  const { data: apiUsers = [], isLoading } = useGetUsersQuery();

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [liveLastSeen, setLiveLastSeen] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [recentMessages, setRecentMessages] = useState<Record<string, string>>(
    {},
  );
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats");
  const userId = useSelector((state: any) => state.auth.user?.userId);
  const dispatch = useDispatch();
  // console.log("userId", userId);
  const { data: groups = [], refetch } = useGetGroupsQuery(userId, {
    skip: !userId,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (userId) refetch();
  }, [userId, refetch]);

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket(userId);
    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "online_list") setOnlineUsers(data.users || []);
      if (data.type === "user_online")
        setOnlineUsers((old) =>
          old.includes(data.userId) ? old : [...old, data.userId],
        );
      if (data.type === "user_offline") {
        setOnlineUsers((old) => old.filter((id) => id !== data.userId));
        if (data.lastSeen)
          setLiveLastSeen((old) => ({ ...old, [data.userId]: data.lastSeen }));
      }
      if (data.type === "user_activity")
        setLiveLastSeen((old) => ({ ...old, [data.userId]: data.lastSeen }));
      if (data.type === "group_members_updated") {
        dispatch(apiSlice.util.invalidateTags(["Groups"]));
        if (data.group?.id) setSelectedGroup((current) => {
          if (current?.id !== data.group.id) return current;
          return data.group.members?.some((member: { id: string }) => member.id === userId) ? data.group : null;
        });
      }
      if (data.type === "group_system_event" && data.event === "member_removed" && data.memberId === userId) {
        toast.error("You were removed from a group.");
      }
      if (data.type === "group_deleted") {
        dispatch(apiSlice.util.invalidateTags(["Groups"]));
        if (data.deletedBy !== userId) toast("A group you belong to was deleted.");
        setSelectedGroup((current) => current?.id === data.groupId ? null : current);
      }
    };
    socket.addEventListener("message", onMessage);
    let idleTimer: number;
    const markInactive = () => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "inactive" }));
    };
    const activity = () => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "activity" }));
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(markInactive, 5 * 60_000);
    };
    activity();
    window.addEventListener("focus", activity);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("touchstart", activity);
    return () => {
      socket.removeEventListener("message", onMessage);
      window.clearTimeout(idleTimer);
      window.removeEventListener("focus", activity);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("touchstart", activity);
    };
  }, [userId, dispatch]);

  const users: ChatUser[] = useMemo(
    () =>
      apiUsers.map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar || "",
        recentMessage: recentMessages[user.id] || "",
        lastChatTime: "",
        chats: [],
        isOnline: onlineUsers.includes(user.id),
        typing: false,
        unreadCount: 0,
        lastSeen: liveLastSeen[user.id] || user.lastSeen || "",
      })),

    [apiUsers, onlineUsers, recentMessages, liveLastSeen],
  );

  useEffect(() => {
    if (users.length > 0 && !selectedUser) {
      setSelectedUser(null); // IMPORTANT: start empty
    }
  }, [users]);

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="h-screen flex bg-[#f5f7fb] overflow-hidden">
      <div className={`${selectedUser ? "hidden sm:block" : "block"} sm:block`}>
        <Sidebar
          users={users}
          groups={groups}
          selectedUser={selectedUser}
          selectedGroup={selectedGroup}
          onSelectUser={(user) => {
            setSelectedGroup(null);
            setSelectedUser(user);
          }}
          onSelectGroup={(group) => {
            setSelectedUser(null);
            setSelectedGroup(group);
          }}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === "chats") {
              setSelectedGroup(null);
            } else {
              setSelectedUser(null);
            }
          }}
          onCreateGroup={() => setIsCreateGroupOpen(true)}
        />
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <ChatWindow
            key={selectedUser.id}
            user={selectedUser}
            onBack={() => setSelectedUser(null)}
            setRecentMessages={setRecentMessages}
          />
        ) : selectedGroup ? (
          <GroupChatWindow
            group={selectedGroup}
            users={users}
            onBack={() => setSelectedGroup(null)}
            onGroupUpdated={(updated) => setSelectedGroup(updated)}
            setRecentMessages={setRecentMessages}
          />
        ) : (
          <div className="flex-1 h-screen bg-gradient-to-br from-[#1a1325] via-[#20163a] to-[#0b0814] flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl bg-[#2a203d] flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
                <svg
                  width="34"
                  height="34"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 10h8M8 14h5" />
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>

              <h1 className="text-4xl font-bold text-white mb-3">
                Welcome to Chatty!
              </h1>

              <p className="text-gray-400 text-lg">
                Select a conversation from the sidebar to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        users={users}
      />
    </div>
  );
}
