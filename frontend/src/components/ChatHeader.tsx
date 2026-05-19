import type { ChatUser } from "./types";

import {
  FiSettings,
  FiLogOut,
} from "react-icons/fi";

import { FaUserCircle } from "react-icons/fa";
import { useLogoutMutation } from "../app/auth/authApi";
import { useNavigate } from "react-router-dom";

type Props = {
  user: Pick<ChatUser, "id" | "name" | "avatar">;
  isOnline?: boolean;
};

export default function ChatHeader({
  user,
  isOnline,
}: Props) {
  const [logout, { isLoading }] = useLogoutMutation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      navigate("/", { replace: true });
    } catch (error) {
      console.log(error)
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-5 bg-white">

      {/* LEFT SIDE (UNCHANGED) */}
      <div className="flex items-center gap-3">
        <img
          src={user.avatar}
          className="w-10 h-10 rounded-full"
        />

        <div>
          <h2 className="font-semibold">
            {user.name}
          </h2>

          <p
            className={`text-xs ${
              isOnline
                ? "text-green-500"
                : "text-gray-400"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-3">

        {/* PROFILE */}
        <button
          className=" p-2 rounded-full hover:bg-gray-100 transition"
        >
          <FaUserCircle
            size={20}
            className="text-gray-600"
          />
        </button>

        {/* SETTINGS */}
        <button
          className="p-2 rounded-full hover:bg-gray-100 transition"
        >
          <FiSettings
            size={20}
            className="text-gray-600"
          />
        </button>

        {/* LOGOUT */}
        <button
          onClick={handleLogout}
          disabled ={isLoading}
          className="p-2 rounded-full hover:bg-red-100 transition cursor-pointer"
        >
          {/* {isLoading ? "Logging out...": "Logout"} */}
          <FiLogOut
            size={20}
            className="text-red-500"
          />
        </button>

      </div>
    </div>
  );
}