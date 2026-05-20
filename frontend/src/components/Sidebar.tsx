
import type { ChatUser } from "./types";

type Props = {
  users: ChatUser[];
  selectedUser: ChatUser;
  onSelectUser: (user: ChatUser) => void;
};

export default function Sidebar({
  users,
  selectedUser,
  onSelectUser,
}: Props) {

  return (
    <div className="w-[340px] bg-white border-r flex flex-col">
      <div className="p-4 border-b">
        <input
          placeholder="Search users..."
          className="w-full bg-gray-100 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {users.map((user) => (
          <div
            key={user.id}
            onClick={() => onSelectUser(user)}
            className={`flex items-center gap-3 px-4 py-4 cursor-pointer transition-all
            ${
              selectedUser.id === user.id
                ? "bg-blue-50"
                : "hover:bg-gray-100"
            }`}
          >
            <img
              src={user.avatar}
              alt=""
              className="w-14 h-14 rounded-full object-cover"
            />

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-800 truncate">
                  {user.name}
                </h3>

                <span className="text-xs text-gray-400">
                  {user.lastChatTime}
                </span>
              </div>

              <p className="text-sm text-gray-500 truncate">
                {user.recentMessage}
              </p>
            </div>
          </div>
        ))}
      </div>
      {/* <button
      onClick={handleLogout}
      disabled = {isLoading}
      className="cursor-pointer"
      >
      {isLoading ? "Logging out...": "Logout"}
        </button> */}
    </div>
  );
}



// import type { ChatUser } from "./types";
// import { Search } from "lucide-react";

// type Props = {
//   users: ChatUser[];
//   selectedUser?: ChatUser | null;
//   onSelectUser: (user: ChatUser) => void;
// };

// export default function Sidebar({
//   users,
//   selectedUser,
//   onSelectUser,
// }: Props) {
//   return (
//     <aside className="w-[340px] h-screen bg-[#120d1b] border-r border-white/10 flex flex-col">
//       {/* HEADER */}
//       <div className="p-5 border-b border-white/10">
//         <h1 className="text-2xl font-bold text-white mb-4">
//           Chatty
//         </h1>

//         {/* SEARCH */}
//         <div className="relative">
//           <Search
//             size={18}
//             className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
//           />

//           <input
//             type="text"
//             placeholder="Search users..."
//             className=" w-full bg-[#1d1729] text-white placeholder:text-gray-500 pl-10 pr-4 py-3 rounded-xl outline-none border border-transparent focus:border-purple-500 transition-all"
//           />
//         </div>
//       </div>

//       {/* USERS */}
//       <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#3b2d56]">
//         {users.map((user) => {
//           const isActive = selectedUser?.id === user.id;

//           return (
//             <button
//               key={user.id}
//               onClick={() => onSelectUser(user)}
//               className={` w-full flex items-center gap-4 px-5 py-4 transition-all duration-200 border-l-4
//                 ${
//                   isActive
//                     ? "bg-[#1f1830] border-purple-500"
//                     : "border-transparent hover:bg-[#191325]"
//                 }
//               `}
//             >
//               {/* AVATAR */}
//               <div className="relative">
//                 <img
//                   src={user.avatar}
//                   alt={user.name}
//                   className=" w-14 h-14 rounded-full object-cover border-2 border-white/10"
//                 />

//                 {user.isOnline && (
//                   <span
//                     className=" absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-[#120d1b] rounded-full"
//                   />
//                 )}
//               </div>

//               {/* INFO */}
//               <div className="flex-1 text-left min-w-0">
//                 <div className="flex justify-between items-center">
//                   <h3 className="font-semibold text-white truncate">
//                     {user.name}
//                   </h3>

//                   <span className="text-xs text-gray-500">
//                     {user.lastChatTime}
//                   </span>
//                 </div>

//                 <p className="text-sm text-gray-400 truncate mt-1">
//                   {user.recentMessage || "Start conversation..."}
//                 </p>
//               </div>
//             </button>
//           );
//         })}
//       </div>
//     </aside>
//   );
// }