import React, { useEffect, useRef, useState } from "react";
import type { Group } from "../components/Sidebar";
import ChatHeader from "./ChatHeader";
import UserAvatar from "./UserAvatar";
import GroupMessageBubble from "./GroupMessageBubble";
import GroupMessageInput from "./GroupMessageInput";
import type { ChatUser, GroupMessage } from "./types";
import {
  useAddGroupMembersMutation,
  useGetGroupMessageQuery,
  useRemoveGroupMemberMutation,
  useLeaveGroupMutation,
  useDeleteGroupMutation,
} from "@/app/groupApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { getGroupSocket, sendSocketMessage } from "@/socket/socket";
import { useGetMeQuery } from "@/app/userApi";
import toast from "react-hot-toast";

type Props = {
  group: Group;
  users: ChatUser[];
  onBack: () => void;
  onGroupUpdated: (group: Group) => void;
  setRecentMessages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
};

export default function GroupChatWindow({
  group,
  users,
  onBack,
  onGroupUpdated,
  setRecentMessages,
}: Props) {
  const { data: me } = useGetMeQuery();
  const currentUserId = me?.id || "";

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [typingUser, setTypingUser] = useState("");
  const [memberToAdd, setMemberToAdd] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [addMembers, { isLoading: addingMembers }] =
    useAddGroupMembersMutation();
  const [removeMember, { isLoading: removingMember }] = useRemoveGroupMemberMutation();
  const [leaveGroup, { isLoading: isLeaving }] = useLeaveGroupMutation();
  const [deleteGroup, { isLoading: isDeleting }] = useDeleteGroupMutation();

  const { data: groupMessages = [] } = useGetGroupMessageQuery(
    group?.id ? { groupId: group.id } : skipToken,
  );

  useEffect(() => {
    const normalized: GroupMessage[] = groupMessages.map((m: any) => ({
      id: m.id || m._id,
      senderId: m.senderId,
      senderName: m.senderName,
      groupId: m.groupId,
      message: m.message,
      attachmentUrl: m.attachmentUrl,
      mediaType: m.mediaType,
      fileName: m.fileName,
      voiceMessage: m.voiceMessage,
      durationSeconds: m.durationSeconds,
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

  useEffect(() => {
    if (!group?.id || !currentUserId) return;

    const socket = getGroupSocket(group.id, currentUserId);
    socketRef.current = socket;

    const handleOpen = () => {
      console.log("Socket ready for group:", group.id);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (data.type === "group_members_updated") {
        if (data.group?.id === group.id) {
          const stillMember = data.group.members?.some((member: { id: string }) => member.id === currentUserId);
          if (stillMember) onGroupUpdated(data.group);
        }
        return;
      }

      if (data.type === "group_system_event") {
        if (data.memberId === currentUserId && data.event === "member_removed") {
          onBack();
        } else if (data.actorId !== currentUserId && !(data.memberId === currentUserId && data.event === "member_left")) {
          toast(data.message || "Group membership changed.");
        }
        return;
      }

      if (data.type === "group_deleted") {
        onBack();
        return;
      }

      if (data.type === "group_typing") {
        if (data.senderId !== currentUserId) {
          const member = group.members?.find(
            (item: any) => item.id === data.senderId,
          );
          setTypingUser(member?.name || "Someone");
          setTimeout(() => setTypingUser(""), 1500);
        }
        return;
      }

      if (data.type === "group_message") {
        const incoming = data.data || {};
        const normalized: GroupMessage = {
          id: incoming.id,
          senderId: incoming.senderId,
          senderName: incoming.senderName,
          groupId: incoming.groupId || incoming.roomId || group.id,
          message: incoming.message,
          attachmentUrl: incoming.attachmentUrl,
          mediaType: incoming.mediaType,
          fileName: incoming.fileName,
          voiceMessage: incoming.voiceMessage,
          durationSeconds: incoming.durationSeconds,
          createdAt: incoming.createdAt,
          status: incoming.status || "sent",
          edited: incoming.edited || false,
          deleted: incoming.deleted || false,
        };

        setMessages((prev) => {
          if (prev.some((msg) => msg.id === normalized.id)) {
            return prev;
          }
          return [...prev, normalized];
        });

        setRecentMessages((prev) => ({
          ...prev,
          [group.id]: normalized.deleted
            ? "This message was deleted"
            : normalized.message,
        }));
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
    };
  }, [group.id, currentUserId, group.members, onBack, onGroupUpdated, setRecentMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim() || !currentUserId) return;

    const success = sendSocketMessage(
      {
        type: "group_message",
        groupId: group.id,
        senderId: currentUserId,
        message: message.trim(),
      },
      "group",
      group.id,
    );

    if (!success) {
      toast.error("Group chat is still connecting. Try again in a moment.");
      return;
    }

    setMessage("");
  };

  const availableUsers = users.filter(
    (user) => !group.members?.some((member: any) => member.id === user.id),
  );

  const handleAddMember = async () => {
    if (!memberToAdd) return;

    try {
      const updated = await addMembers({
        groupId: group.id,
        memberIds: [memberToAdd],
      }).unwrap();
      onGroupUpdated(updated);
      setMemberToAdd("");
      toast.success("Member added");
    } catch (error: any) {
      toast.error(error?.data?.detail || "Failed to add member");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const member = group.members.find((item: any) => item.id === memberId);
    if (!window.confirm(`Remove ${member?.name || "this member"} from the group?`)) return;
    try {
      const updated = await removeMember({
        groupId: group.id,
        memberId,
      }).unwrap();
      onGroupUpdated(updated);
      toast.success(
        memberId === currentUserId ? "You left the group" : "Member removed",
      );
      if (memberId === currentUserId) {
        onBack();
      }
    } catch (error: any) {
      toast.error(error?.data?.detail || "Failed to remove member");
    }
  };

  const isGroupAdmin = !!currentUserId && (group.admins?.includes(currentUserId) || group.createdBy === currentUserId);

  const handleLeaveGroup = async () => {
    try {
      await leaveGroup(group.id).unwrap();
      toast.success("You left the group");
      onBack();
    } catch (error: any) {
      toast.error(error?.data?.detail || "Failed to leave group");
      throw error;
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteGroup(group.id).unwrap();
      toast.success("Group deleted");
      onBack();
    } catch (error: any) {
      toast.error(error?.data?.detail || "Failed to delete group");
      throw error;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-gradient-to-br from-[#20163a] via-[#20163a] to-[#0b0814]">
      <ChatHeader type="group" group={group} onBack={onBack} onLeaveGroup={handleLeaveGroup} onDeleteGroup={handleDeleteGroup} groupActionLoading={isLeaving || isDeleting} />

      <div className="px-4 py-3 border-b border-white/5">
        <h3 className="text-sm text-gray-400 mb-2 text-center">Members</h3>

        <div className="flex flex-wrap justify-center gap-3">
          {group.members?.map((member: any) => (
            <div
              key={member.id}
              className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg"
            >
              <UserAvatar
                userId={member.id}
                name={member.name || "User"}
                imageUrl={member.avatar}
                className="w-8 h-8 rounded-full object-cover"
              />

              <span className="text-white text-sm">
                {member.name}
                {member.isAdmin || group.admins?.includes(member.id) || member.id === group.createdBy ? " (admin)" : ""}
              </span>

              {isGroupAdmin && member.id !== currentUserId ? (
                <button
                  disabled={removingMember}
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {isGroupAdmin && availableUsers.length > 0 && (
          <div className="mt-3 flex justify-center gap-2">
            <select
              value={memberToAdd}
              onChange={(e) => setMemberToAdd(e.target.value)}
              className="bg-[#241d34] text-white text-sm rounded-lg px-3 py-2 border border-white/10"
            >
              <option value="">Add a member</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddMember}
              disabled={!memberToAdd || addingMembers}
              className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

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

              <p className="text-sm text-gray-500">{typingUser} is typing...</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

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
