import { MessageCircle } from "lucide-react";
import { useGetNotificationsQuery } from "@/app/notificationApi";

type Props = {
  active: boolean;
  unreadChats: number;
  onChatClick: () => void;
};

export default function NotificationCenter({ active, unreadChats, onChatClick }: Props) {
  const { data: notifications = [] } = useGetNotificationsQuery();
  const notificationCount = notifications.reduce(
    (total, notification) => total + (notification.read ? 0 : 1),
    0,
  );
  const badgeCount = notificationCount || unreadChats;

  return (
    <button
      type="button"
      aria-label={`Chats${badgeCount ? `, ${badgeCount} unread` : ""}`}
      title="Chats"
      onClick={onChatClick}
      className={`relative grid h-11 w-11 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${active ? "bg-[#e9e9e9] text-[#111b21]" : "text-[#54656f] hover:bg-[#eaeaea] hover:text-[#111b21]"}`}
    >
      <MessageCircle size={23} strokeWidth={2.3} />
      {badgeCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[#f7f7f7]">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </button>
  );
}
