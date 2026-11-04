import type { ChatUser } from "./types";
import { Settings, LogOut, User, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
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
  onBack?: () => void;
  onLeaveGroup?: () => Promise<void>;
  onDeleteGroup?: () => Promise<void>;
  groupActionLoading?: boolean;
};

export default function ChatHeader({
  user,
  group,
  type = "user",
  isOnline,
  onBack,
  onLeaveGroup,
  onDeleteGroup,
  groupActionLoading = false,
}: Props) {
  const [logout, { isLoading }] = useLogoutMutation();

  const navigate = useNavigate();
  const [openProfile, setOpenProfile] = useState(false);
  const [groupConfirmation, setGroupConfirmation] = useState<"leave" | "delete" | null>(null);
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
  const isGroupAdmin = !!me?.id && (!!group?.admins?.includes(me.id) || group?.createdBy === me.id);
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
    type === "group"
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
          : "Offline";

  return (
    <>
      {/* HEADER */}
      <div
        className={`flex items-center justify-between
        px-4 sm:px-6 py-3 sm:py-4
        bg-white/5 backdrop-blur-xl
        border-b border-white/10 shadow-sm
        transition-all duration-300
        ${openProfile ? "blur-sm scale-[0.99]" : ""}
      `}
      >
        {/* LEFT */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="sm:hidden p-2 rounded-lg bg-white/5 border border-white/10"
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
          )}

          <div className="relative flex-shrink-0">
            {type === "group" ? (
              <GroupAvatar
                name={group?.name || "Group"}
                imageUrl={group?.groupImage}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-cyan-400 shadow-lg"
              />
            ) : (
              <UserAvatar
                userId={user?.id}
                name={user?.name || "User"}
                imageUrl={user?.avatar}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-cyan-400 shadow-lg"
              />
            )}

            {type === "user" && isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-[#0F172A] rounded-full"></span>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="font-semibold text-white text-base sm:text-lg truncate">
              {displayName}
            </h2>

            <p
              className={`text-xs sm:text-sm ${
                type === "group"
                  ? "text-gray-400"
                  : isOnline
                    ? "text-green-400"
                    : "text-gray-400"
              }`}
            >
              {subtitle}
            </p>
          </div>
        </div>

        {/* RIGHT (UNCHANGED) */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setOpenProfile(true)}
            className="p-2 sm:p-3 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 transition-all duration-300 group"
          >
            <User
              size={18}
              className="text-gray-300 group-hover:text-cyan-400"
            />
          </button>

          <button className="p-2 sm:p-3 rounded-xl bg-white/5 hover:bg-violet-500/20 border border-white/10 transition-all duration-300 group">
            <Settings
              size={18}
              className="text-gray-300 group-hover:text-violet-400"
            />
          </button>

          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="p-2 sm:p-3 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 transition-all duration-300 group"
          >
            <LogOut size={18} className="text-red-400" />
          </button>
        </div>
      </div>

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
                  <div key={member.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">
                    <span>{member.name}</span>
                    {(member.isAdmin || group.admins?.includes(member.id) || group.createdBy === member.id) && <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">Admin</span>}
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                <button disabled={groupActionLoading} onClick={() => setGroupConfirmation("leave")} className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50">Leave Group</button>
                {isGroupAdmin && <button disabled={groupActionLoading} onClick={() => setGroupConfirmation("delete")} className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">Delete Group</button>}
                {groupConfirmation && <div role="alertdialog" aria-modal="true" className="rounded-xl border border-red-500/30 bg-[#211522] p-4 text-left">
                  <p className="font-semibold text-white">{groupConfirmation === "delete" ? "Delete this group?" : "Leave this group?"}</p>
                  <p className="mt-1 text-sm text-gray-300">{groupConfirmation === "delete" ? "This removes the group for every member and revokes access to its messages and files. Historical records are retained." : "You will be removed from the group and will no longer receive messages. Other members keep their message history."}</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button disabled={groupActionLoading} onClick={() => setGroupConfirmation(null)} className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
                    <button disabled={groupActionLoading} onClick={() => void confirmGroupAction()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{groupActionLoading ? "Working..." : groupConfirmation === "delete" ? "Confirm delete" : "Confirm leave"}</button>
                  </div>
                </div>}
                <button onClick={() => setOpenProfile(false)} className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white">Close</button>
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
