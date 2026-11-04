let sockets: Record<string, WebSocket> = {};
let currentUserId: string | null = null;

export const getSocket = (userId: string) => {
  currentUserId = userId;

  const key = "private";

  if (sockets[key]?.readyState === WebSocket.OPEN) {
    return sockets[key];
  }

  if (sockets[key]?.readyState === WebSocket.CONNECTING) {
    return sockets[key];
  }

  const token = localStorage.getItem("token");
  const wsBase = (
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
  ).replace(/^http/, "ws");
  sockets[key] = new WebSocket(
    `${wsBase}/ws/chat?token=${encodeURIComponent(token || "")}`,
  );

  sockets[key].onopen = () => {
    console.log("Private socket connected");
  };

  sockets[key].onclose = () => {
    console.log(" Private socket closed");

    setTimeout(() => {
      if (currentUserId) getSocket(currentUserId);
    }, 1500);
  };

  return sockets[key];
};

export const getGroupSocket = (groupId: string, userId?: string) => {
  void userId; // The server derives identity from the authenticated token.
  const key = `group_${groupId}`;

  const existing = sockets[key];

  if (existing && existing.readyState !== WebSocket.CLOSED) {
    return existing;
  }

  const token = localStorage.getItem("token");
  const wsBase = (
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
  ).replace(/^http/, "ws");
  const socket = new WebSocket(
    `${wsBase}/ws/group/${groupId}?token=${encodeURIComponent(token || "")}`,
  );

  sockets[key] = socket;

  socket.onopen = () => {
    console.log(" Group socket OPEN:", groupId);
  };

  socket.onerror = (e) => {
    console.log(" Socket error:", e);
  };

  socket.onclose = () => {
    console.log(" Socket closed:", groupId);
    delete sockets[key];
  };

  return socket;
};

export const sendSocketMessage = (
  data: any,
  type: "private" | "group" = "private",
  id?: string,
) => {
  let socket;

  if (type === "group" && id) {
    socket = sockets[`group_${id}`];
  } else {
    socket = sockets["private"];
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log(" Socket not ready");
    return false;
  }

  try {
    socket.send(JSON.stringify(data));
    return true;
  } catch (err) {
    console.log(" Send failed:", err);
    return false;
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("logout", () => {
    Object.values(sockets).forEach((socket) => socket.close());
    sockets = {};
    currentUserId = null;
  });
}
