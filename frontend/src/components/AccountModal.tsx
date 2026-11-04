import {
  Camera,
  Mail,
  ShieldCheck,
  CalendarDays,
  User,
  X,
  Pencil,
  Save,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/app/api";
import { useUpdateMeMutation } from "@/app/userApi";
import UserAvatar from "./UserAvatar";

type Profile = {
  id?: string;
  name: string;
  avatar?: string;
  email?: string;
  createdAt?: string;
};
type Props = { open: boolean; onClose: () => void; user: Profile };

export default function AccountModal({ open, onClose, user }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updateMe, { isLoading }] = useUpdateMeMutation();

  useEffect(() => {
    setName(user.name);
    setEmail(user.email || "");
    setFile(null);
    setPreview("");
    setEditing(false);
  }, [user.id, user.name, user.email, user.avatar]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!open) return null;

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("Profile images must be 5 MB or smaller.");
      return;
    }
    setError("");
    setSuccess("");
    setFile(selected);
  };

  const saveProfile = async () => {
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Full name cannot be empty.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      let avatar = user.avatar || "";
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(
          `${API_BASE_URL}/api/upload/?purpose=profile-avatar`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            },
            body: form,
          },
        );
        const upload = await response.json();
        if (!response.ok)
          throw new Error(upload.detail || "Profile image upload failed.");
        avatar = upload.mediaUrl;
      }
      await updateMe({
        name: name.trim(),
        email: email.trim(),
        avatar,
      }).unwrap();
      setFile(null);
      setSuccess("Profile updated successfully.");
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update profile. Please try again.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#111827]/95 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          aria-label="Close profile"
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-red-500/20 transition"
        >
          <X className="text-white" size={18} />
        </button>
        <div className="px-5 pt-5 pb-4 flex flex-col items-center border-b border-white/10">
          <div className="relative">
            <UserAvatar
              userId={user.id}
              name={name || user.name || "User"}
              imageUrl={preview || user.avatar}
              className="w-24 h-24 rounded-full object-cover border-4 border-cyan-400 shadow-xl"
            />
            {editing && (
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Choose profile picture"
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg"
              >
                <Camera className="text-white" size={16} />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={handleImageChange}
            />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-white">
            {editing ? name || "Your profile" : user.name}
          </h1>
          <p className="text-gray-400 text-sm">Your profile information</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <User size={16} />
              Full Name
            </label>
            <input
              type="text"
              value={editing ? name : user.name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!editing}
              maxLength={100}
              className="w-full h-11 px-4 rounded-xl bg-[#1F2937] border border-white/10 text-white outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <Mail size={16} />
              Email Address
            </label>
            <input
              type="email"
              value={editing ? email : user.email || ""}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!editing}
              maxLength={254}
              className="w-full h-11 px-4 rounded-xl bg-[#1F2937] border border-white/10 text-white outline-none"
            />
            {editing && (
              <p className="mt-1 text-xs text-gray-500">
                Email changes update your sign-in address. This app does not
                currently provide email verification.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-green-400">
              {success}
            </p>
          )}
          <div className="rounded-2xl bg-[#1F2937]/60 border border-white/10 p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Account Information
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-gray-400">
                <CalendarDays size={17} />
                Member Since
              </div>
              <span className="text-gray-200">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-gray-400">
                <ShieldCheck size={17} />
                Status
              </div>
              <span className="text-green-400 font-semibold">Active</span>
            </div>
          </div>
          {editing ? (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setName(user.name);
                  setEmail(user.email || "");
                  setFile(null);
                  setError("");
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save size={16} />
                {isLoading ? "Saving?" : "Save changes"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setError("");
                setSuccess("");
                setEditing(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Pencil size={16} />
              Edit Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
