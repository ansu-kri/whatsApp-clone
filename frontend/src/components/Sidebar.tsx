import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatUser } from "./types";
import {
  CheckSquare,
  CircleDot,
  Image,
  LogOut,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import GroupAvatar from "./GroupAvatar";
import type { ChatMessage } from "./types";
import UserAvatar from "./UserAvatar";
import { useGetMeQuery } from "../app/userApi";
import { useLogoutMutation } from "../app/auth/authApi";
import { useMarkAllReadMutation } from "../app/messageApi";
import { useNavigate } from "react-router-dom";
import AccountModal from "./AccountModal";

export interface Group {
  id: string;
  name: string;
  members: { id: string; name: string; avatar?: string; isAdmin?: boolean }[];
  groupImage?: string;
  createdBy?: string;
  admins?: string[];
  avatar?: string;
  messages?: ChatMessage[];
}

type Props = {
  users: ChatUser[];
  groups: Group[];
  selectedUser?: ChatUser | null;
  selectedGroup?: Group | null;
  onSelectUser: (user: ChatUser) => void;
  onSelectGroup: (group: Group) => void;
  activeTab: "chats" | "groups";
  onTabChange: (tab: "chats" | "groups") => void;
  onCreateGroup: () => void;
};

type NavItemProps = {
  label: string;
  active?: boolean;
  badge?: number;
  children: React.ReactNode;
  onClick?: () => void;
};

function NavItem({
  label,
  active = false,
  badge = 0,
  children,
  onClick,
}: NavItemProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`relative grid h-11 w-11 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${active ? "bg-[#e9e9e9] text-[#111b21]" : "text-[#54656f] hover:bg-[#eaeaea] hover:text-[#111b21]"}`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[#f7f7f7]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({
  users,
  groups,
  selectedUser,
  selectedGroup,
  onSelectUser,
  onSelectGroup,
  activeTab,
  onTabChange,
  onCreateGroup,
}: Props) {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();
  const [logout] = useLogoutMutation();
  const [markAllRead] = useMarkAllReadMutation();

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const toggleChatSelection = (id: string) =>
    setSelectedChats((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } finally {
      navigate("/", { replace: true });
    }
  };
  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        user.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );
  const filteredGroups = useMemo(
    () =>
      groups.filter((group) =>
        group.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [groups, search],
  );
  const unreadCount = users.reduce(
    (total, user) => total + (user.unreadCount || 0),
    0,
  );

  return (
    <aside className="theme-sidebar flex h-screen w-fit shrink-0 bg-gradient-to-br from-[#20163a] via-[#20163a] to-[#0b0814] border-r border-white/10 text-[#111b21]">
      <nav
        aria-label="Main navigation"
        className="z-10 flex h-full w-16 shrink-0 flex-col items-center border-r border-[#e9edef] bg-[#f7f7f7] py-3 sm:w-[68px]"
      >
        <div className="flex flex-col items-center gap-1.5">
          <NavItem
            label="Chats"
            active
            badge={unreadCount}
            onClick={() => onTabChange("chats")}
          >
            <MessageCircle size={23} strokeWidth={2.3} />
          </NavItem>
          <NavItem label="Calls">
            <Phone size={22} strokeWidth={2.1} />
          </NavItem>
          <NavItem label="Updates">
            <CircleDot size={22} strokeWidth={2.1} />
          </NavItem>
          <NavItem
            label="Communities"
            active={activeTab === "groups"}
            onClick={() => onTabChange("groups")}
          >
            <UsersRound size={23} strokeWidth={2.1} />
          </NavItem>
          <NavItem label="Channels">
            <Users size={22} strokeWidth={2.1} />
          </NavItem>
        </div>
        <div className="my-4 w-9 border-t border-[#d9dddf]" />
        <NavItem label="Explore features">
          <Sparkles size={22} strokeWidth={2.1} className="text-[#a855f7]" />
        </NavItem>
        <div className="mt-auto flex flex-col items-center gap-2">
          <NavItem label="Media">
            <Image size={22} strokeWidth={2.1} />
          </NavItem>
          <button
            type="button"
            aria-label="Open profile and settings"
            title="Profile and settings"
            onClick={() => setProfileOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-full p-1 transition-colors hover:bg-[#eaeaea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <UserAvatar
              userId={me?.id}
              name={me?.name || "User"}
              imageUrl={me?.avatar}
              className="h-9 w-9 rounded-full object-cover"
            />
          </button>
        </div>
      </nav>

      <section
        aria-label="Chats and groups"
        className="flex h-full min-h-0 w-[min(360px,calc(100vw-64px))] flex-col border-r border-[#e9edef] bg-white sm:w-[340px]"
      >
        <header className="border-b border-[#e9edef] px-5 pb-4 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-[21px] font-semibold tracking-tight text-[#00a884]">
              Chatty
            </h1>
            <div className="flex items-center gap-1">
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  title="More options"
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="grid h-9 w-9 place-items-center rounded-full text-[#54656f] hover:bg-[#f0f2f5]"
                >
                  <MoreHorizontal size={21} />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-11 z-50 w-[190px] rounded-2xl bg-white p-2 text-[#111b21] shadow-[0_8px_24px_rgba(11,20,26,0.18)] ring-1 ring-black/5"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onCreateGroup();
                      }}
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-[#f5f6f6]"
                    >
                      <UserPlus size={17} />
                      New group
                    </button>
                    <button
                      role="menuitem"
                      disabled
                      title="Starred messages are not supported yet"
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-[#667781] disabled:cursor-not-allowed"
                    >
                      <Star size={17} />
                      Starred messages
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setSelectMode(true);
                        setSelectedChats([]);
                        setMenuOpen(false);
                      }}
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-[#f5f6f6]"
                    >
                      <CheckSquare size={17} />
                      Select chats
                    </button>
                    <button
                      role="menuitem"
                      onClick={async () => {
                        setMenuOpen(false);
                        try {
                          await markAllRead().unwrap();
                        } catch {
                          /* RTK Query reports request errors. */
                        }
                      }}
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-[#f5f6f6]"
                    >
                      <MessageCircle size={17} />
                      Mark all as read
                    </button>
                    <div className="my-1.5 border-t border-[#e9edef]" />
                    <button
                      role="menuitem"
                      disabled
                      title="App lock is not configured in this app"
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-[#667781] disabled:cursor-not-allowed"
                    >
                      <LockKeyhole size={17} />
                      App lock
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void handleLogout();
                      }}
                      className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-[#f5f6f6]"
                    >
                      <LogOut size={17} />
                      Log out
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onCreateGroup}
                title="New group"
                aria-label="New group"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#008f72]"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
          <label className="flex h-10 items-center gap-3 rounded-lg bg-[#f0f2f5] px-3 text-[#667781] focus-within:ring-2 focus-within:ring-[#00a884]/40">
            <Search size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeTab === "chats"
                  ? "Search or start a new chat"
                  : "Search groups"
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
            />
          </label>
          {selectMode ? (
            <div className="mt-3 flex items-center justify-between text-sm text-[#54656f]">
              <span>{selectedChats.length} selected</span>
              <button
                type="button"
                onClick={() => {
                  setSelectMode(false);
                  setSelectedChats([]);
                }}
                className="rounded-full px-3 py-1 text-[#00a884] hover:bg-[#f0f2f5]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onTabChange("chats")}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${activeTab === "chats" ? "border-[#d9fdd3] bg-[#d9fdd3] text-[#075e54]" : "border-[#e9edef] text-[#54656f] hover:bg-[#f7f8fa]"}`}
              >
                Chats
              </button>
              <button
                type="button"
                onClick={() => onTabChange("groups")}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${activeTab === "groups" ? "border-[#d9fdd3] bg-[#d9fdd3] text-[#075e54]" : "border-[#e9edef] text-[#54656f] hover:bg-[#f7f8fa]"}`}
              >
                Groups
              </button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "chats" &&
            filteredUsers.map((user) => {
              const isActive = selectedUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() =>
                    selectMode
                      ? toggleChatSelection(user.id)
                      : onSelectUser(user)
                  }
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"}`}
                >
                  <span className="relative shrink-0">
                    <UserAvatar
                      userId={user.id}
                      name={user.name}
                      imageUrl={user.avatar}
                      className="h-[52px] w-[52px] rounded-full object-cover"
                    />
                    {user.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#25d366]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 border-b border-[#f0f2f5] pb-3 pt-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[16px] font-medium text-[#111b21]">
                        {user.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-[#667781]">
                        {user.lastChatTime}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-[13px] ${user.typing ? "italic text-[#00a884]" : "text-[#667781]"}`}
                      >
                        {user.typing
                          ? "typing..."
                          : user.recentMessage || "No messages yet"}
                      </span>
                      {!!user.unreadCount && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">
                          {user.unreadCount > 99 ? "99+" : user.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          {activeTab === "groups" &&
            filteredGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() =>
                  selectMode
                    ? toggleChatSelection("g-" + group.id)
                    : onSelectGroup(group)
                }
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${selectedGroup?.id === group.id ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"}`}
              >
                <GroupAvatar
                  name={group.name}
                  imageUrl={group.groupImage}
                  className="h-[52px] w-[52px] shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1 border-b border-[#f0f2f5] pb-3 pt-1">
                  <span className="block truncate text-[16px] font-medium">
                    {group.name}
                  </span>
                  <span className="mt-1 block text-[13px] text-[#667781]">
                    {group.members.length} members
                  </span>
                </span>
              </button>
            ))}
          {activeTab === "groups" && filteredGroups.length === 0 && (
            <div className="p-6 text-center text-sm text-[#667781]">
              No groups found
            </div>
          )}
          {activeTab === "chats" && filteredUsers.length === 0 && (
            <div className="p-6 text-center text-sm text-[#667781]">
              No chats found
            </div>
          )}
        </div>
      </section>
      <AccountModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={{
          id: me?.id,
          name: me?.name || "",
          email: me?.email || "",
          avatar: me?.avatar || "",
          createdAt: me?.createdAt || "",
        }}
      />
    </aside>
  );
}
