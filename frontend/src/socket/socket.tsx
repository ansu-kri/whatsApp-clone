let socket: WebSocket | null = null;
let currentUserId: string | null = null;
let isConnecting = false;

export const getSocket = (userId: string) => {
  currentUserId = userId;

  if (
    socket &&
    socket.readyState === WebSocket.OPEN
  ) {
    return socket;
  }

  if (
    socket &&
    socket.readyState === WebSocket.CONNECTING
  ) {
    return socket;
  }

  if (isConnecting) return socket;

  isConnecting = true;

  socket = new WebSocket(
    `ws://127.0.0.1:8000/ws/chat?userId=${userId}`
  );

  socket.onopen = () => {
    console.log("✅ Socket connected:", userId);
    isConnecting = false;
  };

  socket.onclose = () => {
    console.log("❌ Socket disconnected");
    socket = null;
    isConnecting = false;

    setTimeout(() => {
      if (currentUserId) {
        console.log("♻ Reconnecting socket...");
        getSocket(currentUserId);
      }
    }, 1500);
  };
//   socket.onclose = () => {
//   console.log("❌ Socket disconnected");
//   socket = null;
//   isConnecting = false;
// };

  socket.onerror = (err) => {
    console.log("❌ Socket error:", err);
  };

  return socket;
};

export const sendSocketMessage = (data: any) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("❌ Socket not ready, retrying...");

    // retry once after reconnect
    setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    }, 300);

    return false;
  }

  try {
    socket.send(JSON.stringify(data));
    return true;
  } catch (err) {
    console.log("❌ Send failed:", err);
    return false;
  }
};

// let socket: WebSocket | null = null;
// let currentUserId: string | null = null;

// export const getSocket = (userId: string) => {
//   currentUserId = userId;

//   if (socket && socket.readyState === WebSocket.OPEN) return socket;
//   if (socket && socket.readyState === WebSocket.CONNECTING) return socket;

//   socket = new WebSocket(`ws://127.0.0.1:8000/ws/chat?userId=${userId}`);

//   socket.onopen = () => {
//     console.log("✅ Socket connected");
//   };

//   socket.onclose = () => {
//     console.log("❌ Socket disconnected");
//     socket = null;

//     setTimeout(() => {
//       if (currentUserId) getSocket(currentUserId);
//     }, 1500);
//   };

//   socket.onerror = (e) => {
//     console.log("Socket error:", e);
//   };

//   return socket;
// };

// export const sendSocketMessage = (data: any) => {
//   if (!socket || socket.readyState !== WebSocket.OPEN) {
//     console.log("❌ Socket not ready");
//     return false;
//   }

//   socket.send(JSON.stringify(data));
//   return true;
// };