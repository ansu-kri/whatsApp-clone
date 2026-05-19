# 💬 Real-Time Chat App (FastAPI + React + WebSocket)

A full-stack real-time chat application built using **FastAPI**, **WebSockets**, **React (TypeScript)**, and **MongoDB**.  
It supports live messaging, online/offline status, typing indicators, and read receipts (✔ / ✔✔ blue tick system).

---

## ✨ Features

- ⚡ Real-time messaging using WebSockets
- 🟢 Online / Offline user status
- 👀 Seen / Delivered message status (WhatsApp-like ticks)
- ⌨️ Typing indicator
- 💬 One-to-one private chat
- 📜 Chat history stored in MongoDB
- 🔄 Auto-reconnection socket handling
- ⏱ Accurate timestamps (timezone supported)

---

## 🏗 Tech Stack

### Frontend
- React + TypeScript
- Redux Toolkit (RTK Query)
- Tailwind CSS
- WebSocket API

### Backend
- FastAPI
- WebSockets
- MongoDB (Motor async driver)
- Python datetime handling

---

## 📡 WebSocket Events

### Send Events
```json
{
  "type": "message",
  "senderId": "",
  "receiverId": "",
  "message": "",
  "createdAt": ""
}
📦 Project Structure
Backend (FastAPI)
app/
 ├── main.py
 ├── database.py
 ├── routes/
 │    ├── auth.py
 │    ├── user.py
 │    └── message.py
 ├── websocket/
 │    └── socket.py

 Frontend (React)
 src/
 ├── components/
 │    ├── ChatWindow.tsx
 │    ├── MessageBubble.tsx
 │    ├── MessageInput.tsx
 │    └── ChatHeader.tsx
 ├── socket/
 │    └── socket.ts
 ├── app/
 │    ├── userApi.ts
 │    └── messageApi.ts