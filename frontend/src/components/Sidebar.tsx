import { useMemo, useState } from "react";
import type { ChatUser } from "./types";
import { Search } from "lucide-react";

type Props = {
  users: ChatUser[];
  selectedUser?: ChatUser | null;
  onSelectUser: (user: ChatUser) => void;
};

export default function Sidebar({ users, selectedUser, onSelectUser }: Props) {
  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    return users.filter((user) =>
      user.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [users, search]);

  return (
    <aside
      className=" w-full sm:w-[340px] h-screen sm:relative fixed sm:static inset-y-0 left-0 bg-gradient-to-br from-[#20163a] via-[#20163a] to-[#0b0814] border-r border-white/10 flex flex-col z-40"
    >
      {/* HEADER */}
      <div className="p-5 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white mb-4">Chatty</h1>

        {/* SEARCH */}
        <div className="relative">
          <Search
            size={18}
            className=" absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"           />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className=" w-full bg-[#1d1729] text-white placeholder:text-gray-500 pl-10 pr-4 py-3 rounded-xl outline-none border border-transparent focus:border-purple-500 transition-all
            "
          />
        </div>
      </div>

      {/* USERS */}
      <div
        className=" flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#3b2d56] "
      >
        {filteredUsers.map((user) => {
          const isActive = selectedUser?.id === user.id;

          return (
            <button
              key={user.id}
              onClick={() => onSelectUser(user)}
              className={` w-full flex items-center gap-4 px-5 py-4 transition-all duration-200 border-l-4
                ${
                  isActive
                    ? "bg-[#1f1830] border-purple-500"
                    : "border-transparent hover:bg-[#191325]"
                }
              `}
            >
              {/* AVATAR */}
              <div className="relative flex-shrink-0">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className=" w-14 h-14 rounded-full object-cover border-2 border-white/10"
                />

                {user.isOnline && (
                  <span
                    className=" absolute bottom-0 right-0 w-4 h-4 bg-green-400 border-2 border-[#120d1b] rounded-full"
                  />
                )}
              </div>

              {/* INFO */}
              <div className="flex-1 text-left min-w-0">
                {/* TOP */}
                <div className="flex justify-between items-center">
                  <h3
                    className=" font-semibold text-white truncate"
                  >
                    {user.name}
                  </h3>

                  <span
                    className=" text-xs text-gray-500"
                  >
                    {user.lastChatTime}
                  </span>
                </div>

                {/* BOTTOM */}
                <div className="flex items-center justify-between mt-1">
                  <p
                    className={`
                      text-xs sm:text-sm
                      truncate
                      max-w-[180px]
                      sm:max-w-[220px]
                      ${user.typing ? "text-green-400 italic" : "text-gray-400"}
                    `}
                  >
                    {user.typing
                      ? "typing..."
                      : user.recentMessage || "No messages yet"}
                  </p>

                  {!!user.unreadCount && (
                    <span
                      className=" ml-2 min-w-[20px] h-5 px-1 rounded-full bg-green-500 text-white text-[11px] flex items-center justify-center font-semibold"
                    >
                      {user.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
