export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  attachmentUrl?: string;
  mediaType?: string;
  fileName?: string;
  voiceMessage?: boolean;
  durationSeconds?: number;
  createdAt: string;
  status: "sent" | "delivered" | "seen";
  seen?: boolean;
  edited?: boolean;
  deleted?: boolean;
};

export type ChatUser = {
  id: string;
  name: string;
  avatar: string;
  recentMessage: string;
  lastChatTime: string;
  chats: ChatMessage[];
  isOnline: boolean;
  typing?: boolean;
  unreadCount?: number;
  createdAt?: string;
  lastSeen?: string;
};

export interface GroupMember {
  id: string;
  name: string;
  avatar?: string;
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  groupImage?: string;
  createdBy?: string;
  members: GroupMember[];
  messages?: ChatMessage[];
}

export interface GroupMessage {
  id: string;
  senderId: string;
  senderName?: string;
  groupId: string;
  message: string;
  attachmentUrl?: string;
  mediaType?: string;
  fileName?: string;
  voiceMessage?: boolean;
  durationSeconds?: number;
  createdAt: string;
  status?: string;
  edited?: boolean;
  deleted?: boolean;
}
