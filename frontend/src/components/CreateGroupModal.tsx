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

export default function CreateGroupModal({
  isOpen,
  onClose,
  users,
}: Props) {
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
        : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    if (groupImage) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(groupImage.type)) {
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
        typeof detail === "string"
          ? detail
          : "Failed to create group"
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#181424] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Users className="text-purple-400" size={20} />
            <h2 className="text-lg font-semibold text-white">
              Create Group
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Group Name
            </label>

            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full bg-[#241d34] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Group Image
            </label>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
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
              className="w-full text-sm text-gray-400"
            />
            {imagePreview ? (
              <img src={imagePreview} alt="Group image preview" className="mt-3 h-20 w-20 rounded-full border border-white/10 object-cover" />
            ) : (
              <div className="mt-3 flex h-20 w-20 items-center justify-center rounded-full bg-[#241d34] text-purple-300"><ImagePlus size={24} /></div>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-3">
              Select Members
            </label>

            <div className="max-h-56 overflow-y-auto space-y-2">
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
                        ? "bg-purple-600/20 border border-purple-500"
                        : "bg-[#241d34] border border-transparent hover:border-white/10"
                    }`}
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />

                  <span className="text-white">
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
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition"
          >
            {isUploading ? "Uploading image..." : isLoading ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
