import type { ChatUser } from "./types";
import { Settings, LogOut, User, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useLogoutMutation } from "../app/auth/authApi";
import { useNavigate } from "react-router-dom";
import AccountModal from "./AccountModal";
import GroupAvatar from "./GroupAvatar";
import { useGetMeQuery } from "@/app/userApi";

type GroupType = {
  id: string;
  name: string;
  members: any[];
  groupImage?: string;
};

type Props = {
  type?: "user" | "group";
  user?: Pick<ChatUser, "id" | "name" | "avatar" | "createdAt" | "lastSeen">;
  group?: GroupType;
  isOnline?: boolean;
  onBack?: () => void;
};

export default function ChatHeader({
  user,
  group,
  type = "user",
  isOnline,
  onBack,
}: Props) {
  const [logout, { isLoading }] = useLogoutMutation();

  const navigate = useNavigate();
  const [openProfile, setOpenProfile] = useState(false);
  const { data: me } = useGetMeQuery();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      navigate("/", { replace: true });
    } catch (error) {
      console.log(error);
    }
  };

  const displayName = type === "group" ? group?.name : user?.name;


  const subtitle =
    type === "group"
      ? `${group?.members?.length || 0} members`
      : isOnline
        ? "Online"
        : user?.lastSeen
          ? (() => {
              const lastSeenDate = new Date(Date.parse(user.lastSeen));
              const now = new Date();
              const isToday =
                lastSeenDate.toDateString() === now.toDateString();

              const yesterday = new Date();
              yesterday.setDate(now.getDate() - 1);

              const isYesterday =
                lastSeenDate.toDateString() === yesterday.toDateString();

              const time = lastSeenDate.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
              });

              if (isToday) return `Last seen today at ${time}`;
              if (isYesterday) return `Last seen yesterday at ${time}`;

              return `Last seen ${lastSeenDate.toLocaleDateString("en-IN")}`;
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
              <img
                src={user?.avatar}
                alt="avatar"
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
              <h2 className="mt-4 text-xl font-semibold text-white">{group?.name}</h2>
              <p className="mt-1 text-sm text-gray-400">Group information ({group?.members?.length || 0} members)</p>
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto text-left">
                {group?.members?.map((member) => (
                  <p key={member.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">{member.name}</p>
                ))}
              </div>
              <button onClick={() => setOpenProfile(false)} className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white">Close</button>
            </div>
          </div>
        )
      ) : (
        <AccountModal
          open={openProfile}
          onClose={() => setOpenProfile(false)}
          user={{
            name: me?.name || "",
            avatar: me?.avatar || user?.avatar || "",
            email: me?.email || "",
            createdAt: me?.createdAt || "",
          }}
        />
      )}
    </>
  );
}
