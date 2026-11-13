import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import type { ChatUser } from "../components/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGetUsersQuery } from "../app/userApi";
import CreateGroupModal from "@/components/CreateGroupModal";
import { useGetGroupsQuery } from "@/app/groupApi";
import { useDispatch, useSelector } from "react-redux";
import apiSlice from "@/app/api";
import type { Group } from "../components/Sidebar";
import GroupChatWindow from "@/components/GroupChatWindow";
import { subscribePrivateSocket } from "@/socket/socket";
import toast from "react-hot-toast";
import { API_BASE_URL } from "@/app/api";
import { useGetNotificationsQuery } from "@/app/notificationApi";
import CallManager from "@/components/CallManager";
import CallHistory from "@/components/CallHistory";

export default function Chat() {
  const { data: apiUsers = [], isLoading } = useGetUsersQuery();
  const { data: notifications = [] } = useGetNotificationsQuery();

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [liveLastSeen, setLiveLastSeen] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    user: ChatUser;
    type: "audio" | "video";
  } | null>(null);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [recentMessages, setRecentMessages] = useState<Record<string, string>>(
    {},
  );
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
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
  const activeConversationRef = useRef<{
    userId: string | null;
    groupId: string | null;
  }>({ userId: null, groupId: null });
  useEffect(() => {
    activeConversationRef.current = {
      userId: selectedUser?.id || null,
      groupId: selectedGroup?.id || null,
    };
  }, [selectedUser?.id, selectedGroup?.id]);

  useEffect(() => {
    if (!userId) return;
    let currentSocket: WebSocket | null = null;
    let idleTimer: number | undefined;

    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "notification" && data.notification?.id) {
        const notification = data.notification;
        dispatch(apiSlice.util.invalidateTags(["Notifications"]));
        if (notification.message)
          setRecentMessages((current) => ({
            ...current,
            [notification.conversationId]: notification.message,
          }));

        const active = activeConversationRef.current;
        const viewingConversation =
          notification.conversationType === "group"
            ? active.groupId === notification.conversationId
            : active.userId === notification.conversationId;
        if (
          viewingConversation &&
          document.visibilityState === "visible" &&
          document.hasFocus()
        ) {
          const token = localStorage.getItem("token");
          void fetch(
            `${API_BASE_URL}/api/notifications/${notification.id}/read`,
            {
              method: "PATCH",
              headers: token ? { authorization: `Bearer ${token}` } : {},
            },
          ).finally(() =>
            dispatch(apiSlice.util.invalidateTags(["Notifications"])),
          );
        } else if (
          (document.visibilityState !== "visible" || !document.hasFocus()) &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const browserNotification = new Notification(
            notification.senderName || "New chat activity",
            {
              body: notification.message || "You have a new notification",
              tag: notification.eventId || notification.id,
            },
          );
          browserNotification.onclick = () => {
            window.focus();
            browserNotification.close();
          };
        }
      }
      if (data.type === "notifications_read")
        dispatch(apiSlice.util.invalidateTags(["Notifications"]));
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
        if (data.group?.id)
          setSelectedGroup((current) => {
            if (current?.id !== data.group.id) return current;
            return data.group.members?.some(
              (member: { id: string }) => member.id === userId,
            )
              ? data.group
              : null;
          });
      }
      if (
        data.type === "group_system_event" &&
        data.event === "member_removed" &&
        data.memberId === userId
      )
        toast.error("You were removed from a group.");
      if (data.type === "group_deleted") {
        dispatch(apiSlice.util.invalidateTags(["Groups"]));
        if (data.deletedBy !== userId)
          toast("A group you belong to was deleted.");
        setSelectedGroup((current) =>
          current?.id === data.groupId ? null : current,
        );
      }
    };

    const sendActivity = () => {
      if (currentSocket?.readyState === WebSocket.OPEN)
        currentSocket.send(JSON.stringify({ type: "activity" }));
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (currentSocket?.readyState === WebSocket.OPEN)
          currentSocket.send(JSON.stringify({ type: "inactive" }));
      }, 5 * 60_000);
    };

    const bindSocket = (socket: WebSocket) => {
      if (currentSocket === socket) return;
      currentSocket?.removeEventListener("message", onMessage);
      currentSocket?.removeEventListener("open", sendActivity);
      currentSocket = socket;
      socket.addEventListener("message", onMessage);
      socket.addEventListener("open", sendActivity);
      if (socket.readyState === WebSocket.OPEN) sendActivity();
    };

    const unsubscribe = subscribePrivateSocket(userId, bindSocket);
    window.addEventListener("focus", sendActivity);
    window.addEventListener("pointerdown", sendActivity);
    window.addEventListener("keydown", sendActivity);
    window.addEventListener("touchstart", sendActivity);
    return () => {
      unsubscribe();
      currentSocket?.removeEventListener("message", onMessage);
      currentSocket?.removeEventListener("open", sendActivity);
      window.clearTimeout(idleTimer);
      window.removeEventListener("focus", sendActivity);
      window.removeEventListener("pointerdown", sendActivity);
      window.removeEventListener("keydown", sendActivity);
      window.removeEventListener("touchstart", sendActivity);
    };
  }, [userId, dispatch]);

  const notificationPreviews = useMemo(() => {
    const previews: Record<string, string> = {};
    for (const notification of notifications) {
      if (
        notification.type === "message" &&
        notification.message &&
        !previews[notification.conversationId]
      ) {
        previews[notification.conversationId] = notification.message;
      }
    }
    return previews;
  }, [notifications]);

  const users: ChatUser[] = useMemo(
    () =>
      apiUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar || "",
        recentMessage:
          recentMessages[user.id] || notificationPreviews[user.id] || "",
        lastChatTime: "",
        chats: [],
        isOnline: onlineUsers.includes(user.id),
        typing: false,
        unreadCount: user.unreadCount || 0,
        lastSeen: liveLastSeen[user.id] || user.lastSeen || "",
      })),

    [apiUsers, onlineUsers, recentMessages, notificationPreviews, liveLastSeen],
  );

  const activeSelectedUser = selectedUser
    ? users.find((candidate) => candidate.id === selectedUser.id) ||
      selectedUser
    : null;

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
            setContactInfoOpen(false);
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
          onCallHistory={() => setCallHistoryOpen(true)}
        />
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <ChatWindow
            key={selectedUser.id}
            user={activeSelectedUser || selectedUser}
            onBack={() => setSelectedUser(null)}
            setRecentMessages={setRecentMessages}
            onStartCall={(type) =>
              setOutgoingCall({
                user: activeSelectedUser || selectedUser,
                type,
              })
            }
            contactInfoOpen={contactInfoOpen}
            setContactInfoOpen={setContactInfoOpen}
          />
        ) : selectedGroup ? (
          <GroupChatWindow
            key={selectedGroup.id}
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
      {userId && (
        <CallHistory
          userId={userId}
          users={users}
          open={callHistoryOpen}
          onClose={() => setCallHistoryOpen(false)}
          onCall={(user, type) => setOutgoingCall({ user, type })}
        />
      )}
      {userId && (
        <CallManager
          userId={userId}
          users={users}
          startCall={outgoingCall}
          onStartHandled={() => setOutgoingCall(null)}
        />
      )}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        users={users}
      />
    </div>
  );
}
