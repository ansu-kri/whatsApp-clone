import UserAvatar from "./UserAvatar";
import { useEffect, useState } from "react";
import { ImagePlus, X, Users } from "lucide-react";
import { useCreateGroupMutation, useUploadImageMutation } from "@/app/groupApi";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { useGetMeQuery } from "@/app/userApi";

type User = {
  id: string;
  name: string;
  avatar: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
};

export default function CreateGroupModal({ isOpen, onClose, users }: Props) {
  const [groupName, setGroupName] = useState("");
  const [groupImage, setGroupImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [createGroup, { isLoading }] = useCreateGroupMutation();
  const [uploadImage, { isLoading: isUploading }] = useUploadImageMutation();
  const { data: me } = useGetMeQuery();
  const authUserId = useSelector((state: any) => state.auth.user?.userId);
  const currentUserId = me?.id || authUserId;

  useEffect(() => {
    if (!groupImage) {
      setImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(groupImage);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [groupImage]);

  if (!isOpen) return null;

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id)
        ? prev.filter((memberId) => memberId !== id)
        : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    if (groupImage) {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(groupImage.type)
      ) {
        toast.error("Choose a PNG, JPG, JPEG, or WEBP image");
        return;
      }
      if (groupImage.size > 5 * 1024 * 1024) {
        toast.error("Group images must be 5 MB or smaller");
        return;
      }
    }

    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }

    if (!currentUserId) {
      toast.error("You must be logged in to create a group");
      return;
    }

    try {
      let imageUrl = "";

      if (groupImage) {
        const imageResponse = await uploadImage(groupImage).unwrap();
        imageUrl = imageResponse.mediaUrl;
      }

      await createGroup({
        name: groupName.trim(),
        members: selectedMembers,
        groupImage: imageUrl,
        createdBy: currentUserId,
      }).unwrap();

      toast.success("Group created successfully");

      setGroupName("");
      setGroupImage(null);
      setSelectedMembers([]);

      onClose();
    } catch (error: any) {
      console.error(error);

      const detail = error?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "Failed to create group",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-sm sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--modal-text)] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--modal-border)] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Users className="text-purple-500 dark:text-purple-400" size={20} />
            <h2 id="create-group-title" className="text-lg font-semibold">
              Create Group
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close create group"
            className="rounded-lg p-1 text-[var(--modal-muted)] transition hover:bg-black/5 hover:text-[var(--modal-text)] dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div>
            <label className="mb-2 block text-sm text-[var(--modal-muted)]">
              Group Name
            </label>

            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full rounded-xl border border-[var(--modal-border)] bg-[var(--modal-input)] px-4 py-3 text-[var(--modal-text)] outline-none placeholder:text-[var(--modal-placeholder)] focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[var(--modal-muted)]">
              Group Image
            </label>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (
                  file &&
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                ) {
                  toast.error("Choose a PNG, JPG, JPEG, or WEBP image");
                  e.target.value = "";
                  setGroupImage(null);
                  return;
                }
                if (file && file.size > 5 * 1024 * 1024) {
                  toast.error("Group images must be 5 MB or smaller");
                  e.target.value = "";
                  setGroupImage(null);
                  return;
                }
                setGroupImage(file);
              }}
              className="block w-full cursor-pointer rounded-xl border border-[var(--modal-border)] bg-[var(--modal-input)] px-3 py-2 text-sm text-[var(--modal-muted)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-purple-700"
            />
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Group image preview"
                className="mt-3 h-20 w-20 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="mt-3 flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[var(--modal-border)] bg-[var(--modal-input)] text-purple-500 dark:text-purple-300">
                <ImagePlus size={24} />
              </div>
            )}
          </div>

          <div>
            <label className="mb-3 block text-sm text-[var(--modal-muted)]">
              Select Members
            </label>

            <div className="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {users
                .filter((user) => user.id !== currentUserId)
                .map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleMember(user.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition
                    ${
                      selectedMembers.includes(user.id)
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-[var(--modal-border)] bg-[var(--modal-input)] hover:border-purple-400/60"
                    }`}
                  >
                    <UserAvatar
                      userId={user.id}
                      name={user.name}
                      imageUrl={user.avatar}
                      className="w-10 h-10 rounded-full object-cover"
                    />

                    <span className="min-w-0 truncate text-[var(--modal-text)]">
                      {user.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={
              isLoading ||
              isUploading ||
              !groupName.trim() ||
              selectedMembers.length === 0
            }
            className="w-full shrink-0 rounded-xl bg-purple-600 py-3 font-semibold text-white transition hover:bg-purple-700 active:bg-purple-800 disabled:cursor-not-allowed disabled:bg-purple-400 disabled:text-white/90 dark:disabled:bg-purple-800 dark:disabled:text-white/70"
          >
            {isUploading
              ? "Uploading image..."
              : isLoading
                ? "Creating..."
                : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
