export type ChatMessage = {
  senderId: string;
  receiverId: string;
  message: string;
  createdAt: string;
  status: "sent" | "delivered" | "seen";
};

export type ChatUser = {
  id: string;
  name: string;
  avatar: string;
  recentMessage: string;
  lastChatTime: string;
  chats: ChatMessage[];
};