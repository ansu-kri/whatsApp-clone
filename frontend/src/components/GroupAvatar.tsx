import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { API_BASE_URL } from "@/app/api";

type Props = {
  name: string;
  imageUrl?: string;
  className: string;
};

export default function GroupAvatar({ name, imageUrl, className }: Props) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setFailed(false);
    setSrc("");
    if (!imageUrl) return () => { active = false; };

    const sourceUrl = imageUrl.startsWith("http")
      ? imageUrl
      : new URL(imageUrl, API_BASE_URL).toString();
    const token = localStorage.getItem("token");

    fetch(sourceUrl, {
      headers: imageUrl.includes("/api/upload/media/") && token
        ? { authorization: `Bearer ${token}` }
        : {},
    }).then(async (response) => {
      if (!response.ok) throw new Error("Image unavailable");
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setSrc(objectUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl]);

  if (!imageUrl || failed) {
    return <div aria-label={`${name} group`} className={`${className} flex items-center justify-center bg-purple-900/70 text-purple-200`}><Users size={22} /></div>;
  }
  if (!src) {
    return <div aria-label={`Loading ${name} group image`} className={`${className} flex items-center justify-center bg-purple-900/70 text-purple-200`}><Users size={22} /></div>;
  }
  return <img src={src} alt={`${name} group`} className={className} />;
}
