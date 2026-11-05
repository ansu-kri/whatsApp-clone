let sockets: Record<string, WebSocket> = {};
let currentUserId: string | null = null;
let logoutRequested = false;
const privateSocketSubscribers = new Set<(socket: WebSocket) => void>();
const groupSocketSubscribers = new Map<
  string,
  Set<(socket: WebSocket) => void>
>();
const groupSocketUsers: Record<string, string> = {};

export const getSocket = (userId: string, notifySubscribers = true) => {
  currentUserId = userId;
  logoutRequested = false;

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

  if (notifySubscribers) {
    privateSocketSubscribers.forEach((subscriber) => subscriber(sockets[key]));
  }

  sockets[key].onclose = (event) => {
    console.log(" Private socket closed");

    if (event.code !== 1008) {
      setTimeout(() => {
        if (currentUserId && !logoutRequested) getSocket(currentUserId);
      }, 1500);
    }
  };

  return sockets[key];
};

export const subscribePrivateSocket = (
  userId: string,
  subscriber: (socket: WebSocket) => void,
) => {
  privateSocketSubscribers.add(subscriber);
  subscriber(getSocket(userId, false));
  return () => {
    privateSocketSubscribers.delete(subscriber);
  };
};

export const getGroupSocket = (
  groupId: string,
  userId?: string,
  notifySubscribers = true,
) => {
  const memberId = userId || currentUserId || "";
  if (memberId) groupSocketUsers[groupId] = memberId;
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

  if (notifySubscribers) {
    groupSocketSubscribers
      .get(groupId)
      ?.forEach((subscriber) => subscriber(socket));
  }

  socket.onerror = (e) => {
    console.log(" Socket error:", e);
  };

  socket.onclose = (event) => {
    console.log(" Socket closed:", groupId);
    if (sockets[key] === socket) delete sockets[key];
    if (
      event.code !== 1008 &&
      !logoutRequested &&
      groupSocketUsers[groupId] === currentUserId &&
      groupSocketSubscribers.has(groupId)
    ) {
      window.setTimeout(() => {
        if (
          !logoutRequested &&
          groupSocketSubscribers.has(groupId) &&
          groupSocketUsers[groupId] === currentUserId
        ) {
          getGroupSocket(groupId, currentUserId);
        }
      }, 1500);
    }
  };

  return socket;
};

export const subscribeGroupSocket = (
  groupId: string,
  userId: string,
  subscriber: (socket: WebSocket) => void,
) => {
  const subscribers =
    groupSocketSubscribers.get(groupId) ||
    new Set<(socket: WebSocket) => void>();
  subscribers.add(subscriber);
  groupSocketSubscribers.set(groupId, subscribers);
  groupSocketUsers[groupId] = userId;
  subscriber(getGroupSocket(groupId, userId, false));
  return () => {
    const current = groupSocketSubscribers.get(groupId);
    current?.delete(subscriber);
    if (!current?.size) {
      groupSocketSubscribers.delete(groupId);
      delete groupSocketUsers[groupId];
      const socket = sockets["group_" + groupId];
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    }
  };
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
    logoutRequested = true;
    Object.values(sockets).forEach((socket) => socket.close());
    sockets = {};
    currentUserId = null;
  });
}
