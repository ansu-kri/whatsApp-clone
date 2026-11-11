import type { ChatUser } from "./types";
import {
  ArrowLeft,
  BellOff,
  CheckSquare,
  LogOut,
  MoreVertical,
  Phone,
  Search,
  Timer,
  UserRound,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLogoutMutation } from "../app/auth/authApi";
import { useNavigate } from "react-router-dom";
import AccountModal from "./AccountModal";
import GroupAvatar from "./GroupAvatar";
import UserAvatar from "./UserAvatar";
import { useGetMeQuery } from "@/app/userApi";

type GroupType = {
  id: string;
  name: string;
  members: { id: string; name: string; isAdmin?: boolean }[];
  groupImage?: string;
  createdBy?: string;
  admins?: string[];
};

type Props = {
  type?: "user" | "group";
  user?: Pick<ChatUser, "id" | "name" | "avatar" | "createdAt" | "lastSeen">;
  group?: GroupType;
  isOnline?: boolean;
  typingText?: string;
  onBack?: () => void;
  onLeaveGroup?: () => Promise<void>;
  onDeleteGroup?: () => Promise<void>;
  groupActionLoading?: boolean;
  onOpenContactInfo?: () => void;
};

export default function ChatHeader({
  user,
  group,
  type = "user",
  isOnline,
  typingText,
  onBack,
  onLeaveGroup,
  onDeleteGroup,
  groupActionLoading = false,
  onOpenContactInfo,
}: Props) {
  const [logout, { isLoading }] = useLogoutMutation();

  const navigate = useNavigate();
  const [openProfile, setOpenProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [disappearing, setDisappearing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        setMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [menuOpen]);
  const [groupConfirmation, setGroupConfirmation] = useState<
    "leave" | "delete" | null
  >(null);
  const { data: me } = useGetMeQuery();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      navigate("/", { replace: true });
    } catch (error) {
      console.log(error);
    }
  };

  const displayName = type === "group" ? group?.name : user?.name;
  const isGroupAdmin =
    !!me?.id &&
    (!!group?.admins?.includes(me.id) || group?.createdBy === me.id);
  const confirmGroupAction = async () => {
    try {
      if (groupConfirmation === "leave") await onLeaveGroup?.();
      if (groupConfirmation === "delete") await onDeleteGroup?.();
      setGroupConfirmation(null);
      setOpenProfile(false);
    } catch {
      // The action handler has already shown the API error; keep the dialog open.
    }
  };

  const subtitle =
    typingText ||
    (type === "group"
      ? `${group?.members?.length || 0} members`
      : isOnline
        ? "Online"
        : user?.lastSeen
          ? (() => {
              const lastSeen = new Date(user.lastSeen);
              if (Number.isNaN(lastSeen.getTime())) return "Offline";
              const age = Math.max(0, now - lastSeen.getTime());
              if (age < 60_000) return "Last seen just now";
              if (age < 60 * 60_000) {
                const minutes = Math.floor(age / 60_000);
                return `Last seen ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
              }
              const sameDay =
                lastSeen.toDateString() === new Date(now).toDateString();
              const time = lastSeen.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });
              if (sameDay) return `Last seen today at ${time}`;
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              if (lastSeen.toDateString() === yesterday.toDateString())
                return `Last seen yesterday at ${time}`;
              return `Last seen ${lastSeen.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
            })()
          : "Offline");

  return (
    <>
      {/* HEADER */}
      <header className="chat-header relative z-30 flex h-16 w-full shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to chats"
              className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 sm:hidden"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {type === "group" ? (
            <GroupAvatar
              name={group?.name || "Group"}
              imageUrl={group?.groupImage}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={onOpenContactInfo}
              aria-label="Open contact info"
              className="shrink-0 rounded-full"
            >
              <UserAvatar
                userId={user?.id}
                name={user?.name || "User"}
                imageUrl={user?.avatar}
                className="h-10 w-10 rounded-full object-cover"
              />
            </button>
          )}
          <div className="min-w-0">
            {type === "user" ? (
              <button
                type="button"
                onClick={onOpenContactInfo}
                className="block max-w-full truncate text-left text-[15px] font-medium leading-5 text-[#111b21]"
              >
                {displayName}
              </button>
            ) : (
              <h2 className="truncate text-[15px] font-medium leading-5 text-[#111b21]">
                {displayName}
              </h2>
            )}
            <p
              className={
                "truncate text-xs leading-4 " +
                (type === "group"
                  ? "text-gray-500"
                  : isOnline
                    ? "text-green-600"
                    : "text-gray-500")
              }
            >
              {subtitle}
            </p>
          </div>
        </div>

        {searchOpen && (
          <form
            className="absolute inset-y-0 left-0 z-10 flex w-full items-center gap-3 bg-white px-4 sm:left-1/4 sm:w-1/2"
            onSubmit={(event) => {
              event.preventDefault();
              const findText = (
                window as Window & { find?: (text: string) => boolean }
              ).find;
              if (searchTerm.trim()) findText?.call(window, searchTerm.trim());
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchTerm("");
              }}
              aria-label="Close search"
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
            >
              <ArrowLeft size={20} />
            </button>
            <input
              autoFocus
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search in conversation"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-500"
            />
          </form>
        )}

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            aria-label="Video call"
            title="Video call"
            className="rounded-full p-2.5 text-gray-700 transition hover:bg-gray-100"
          >
            <Video size={20} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Voice call"
            title="Voice call"
            className="rounded-full p-2.5 text-gray-700 transition hover:bg-gray-100"
          >
            <Phone size={20} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Search"
            title="Search"
            onClick={() => {
              setSearchOpen(true);
              setMenuOpen(false);
            }}
            className="rounded-full p-2.5 text-gray-700 transition hover:bg-gray-100"
          >
            <Search size={20} strokeWidth={2} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More options"
              title="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={
                "rounded-full p-2.5 text-gray-700 transition hover:bg-gray-100 " +
                (menuOpen ? "bg-gray-100" : "")
              }
            >
              <MoreVertical size={20} strokeWidth={2} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="chat-menu absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-[min(260px,calc(100vw-1.5rem))] overflow-y-auto rounded-lg bg-white py-2 text-[#3b4a54] shadow-[0_4px_18px_rgba(11,20,26,0.2)] ring-1 ring-black/5"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    if (type === "user") onOpenContactInfo?.();
                    else setOpenProfile(true);
                    setMenuOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100"
                >
                  <UserRound size={18} />
                  <span>Contact info</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setSearchOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100"
                >
                  <Search size={18} />
                  <span>Search</span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setSelectMode((active) => !active);
                    setMenuOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100"
                >
                  <CheckSquare size={18} />
                  <span>
                    {selectMode ? "Cancel selection" : "Select messages"}
                  </span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMuted((active) => !active);
                    setMenuOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100"
                >
                  <BellOff size={18} />
                  <span>
                    {muted ? "Unmute notifications" : "Mute notifications"}
                  </span>
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setDisappearing((active) => !active);
                    setMenuOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100"
                >
                  <Timer size={18} />
                  <span>
                    Disappearing messages {disappearing ? "· On" : ""}
                  </span>
                </button>
                {type === "group" && (
                  <>
                    <div className="my-2 border-t border-gray-200" />
                    <button
                      role="menuitem"
                      type="button"
                      disabled={groupActionLoading}
                      onClick={() => {
                        setGroupConfirmation("leave");
                        setMenuOpen(false);
                      }}
                      className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm transition hover:bg-gray-100 disabled:opacity-50"
                    >
                      <LogOut size={18} />
                      <span>Leave group</span>
                    </button>
                    {isGroupAdmin && (
                      <button
                        role="menuitem"
                        type="button"
                        disabled={groupActionLoading}
                        onClick={() => {
                          setGroupConfirmation("delete");
                          setMenuOpen(false);
                        }}
                        className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm text-red-600 transition hover:bg-gray-100 disabled:opacity-50"
                      >
                        <LogOut size={18} />
                        <span>Delete group</span>
                      </button>
                    )}
                  </>
                )}
                <div className="my-2 border-t border-gray-200" />
                <button
                  role="menuitem"
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setMenuOpen(false);
                    void handleLogout();
                  }}
                  className="flex h-10 w-full items-center gap-4 px-4 text-left text-sm text-red-600 transition hover:bg-gray-100 disabled:opacity-50"
                >
                  <LogOut size={18} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* PROFILE MODAL (UNCHANGED) */}

      {type === "group" ? (
        openProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#181424] p-6 text-center shadow-2xl">
              <GroupAvatar
                name={group?.name || "Group"}
                imageUrl={group?.groupImage}
                className="mx-auto h-24 w-24 rounded-full border-2 border-cyan-400 object-cover"
              />
              <h2 className="mt-4 text-xl font-semibold text-white">
                {group?.name}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Group information ({group?.members?.length || 0} members)
              </p>
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto text-left">
                {group?.members?.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200"
                  >
                    <span>{member.name}</span>
                    {(member.isAdmin ||
                      group.admins?.includes(member.id) ||
                      group.createdBy === member.id) && (
                      <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                        Admin
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                <button
                  disabled={groupActionLoading}
                  onClick={() => setGroupConfirmation("leave")}
                  className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Leave Group
                </button>
                {isGroupAdmin && (
                  <button
                    disabled={groupActionLoading}
                    onClick={() => setGroupConfirmation("delete")}
                    className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    Delete Group
                  </button>
                )}
                {groupConfirmation && (
                  <div
                    role="alertdialog"
                    aria-modal="true"
                    className="rounded-xl border border-red-500/30 bg-[#211522] p-4 text-left"
                  >
                    <p className="font-semibold text-white">
                      {groupConfirmation === "delete"
                        ? "Delete this group?"
                        : "Leave this group?"}
                    </p>
                    <p className="mt-1 text-sm text-gray-300">
                      {groupConfirmation === "delete"
                        ? "This removes the group for every member and revokes access to its messages and files. Historical records are retained."
                        : "You will be removed from the group and will no longer receive messages. Other members keep their message history."}
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        disabled={groupActionLoading}
                        onClick={() => setGroupConfirmation(null)}
                        className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={groupActionLoading}
                        onClick={() => void confirmGroupAction()}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {groupActionLoading
                          ? "Working..."
                          : groupConfirmation === "delete"
                            ? "Confirm delete"
                            : "Confirm leave"}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setOpenProfile(false)}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <AccountModal
          open={openProfile}
          onClose={() => setOpenProfile(false)}
          user={{
            id: me?.id,
            name: me?.name || "",
            avatar: me?.avatar || "",
            email: me?.email || "",
            createdAt: me?.createdAt || "",
          }}
        />
      )}
    </>
  );
}
