import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/app/api";

type Props = {
  userId?: string;
  name: string;
  imageUrl?: string | null;
  className: string;
};

export default function UserAvatar({
  userId,
  name,
  imageUrl,
  className,
}: Props) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setFailed(false);
    if (!imageUrl)
      return () => {
        active = false;
      };
    const url = imageUrl.startsWith("http")
      ? imageUrl
      : new URL(imageUrl, API_BASE_URL).toString();
    const token = localStorage.getItem("token");
    fetch(url, {
      headers:
        imageUrl.includes("/api/upload/media/") && token
          ? { authorization: `Bearer ${token}` }
          : {},
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image unavailable");
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, imageUrl]);
  if (src && !failed)
    return (
      <img
        key={userId}
        src={src}
        alt={`${name} profile`}
        className={className}
      />
    );
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";
  return (
    <div
      aria-label={`${name} profile`}
      className={`${className} flex items-center justify-center bg-purple-900 text-purple-100 font-semibold`}
    >
      {initials}
    </div>
  );
}
