import apiSlice from "./api";

export interface ChatNotification {
  id: string;
  type: "message" | "activity" | "call" | string;
  eventId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  conversationType: "private" | "group";
  conversationId: string;
  read: boolean;
  createdAt: string;
}

type ReadResult = { updated?: number; deleted?: number; id?: string; read?: boolean };

export const notificationApis = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<ChatNotification[], void>({
      query: () => ({ url: "/api/notifications", method: "GET" }),
      providesTags: ["Notifications"],
    }),
    markNotificationRead: builder.mutation<ReadResult, string>({
      query: (id) => ({ url: `/api/notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: ["Notifications"],
    }),
    markAllNotificationsRead: builder.mutation<ReadResult, void>({
      query: () => ({ url: "/api/notifications/read-all", method: "PATCH" }),
      invalidatesTags: ["Notifications"],
    }),
    clearNotifications: builder.mutation<ReadResult, void>({
      query: () => ({ url: "/api/notifications", method: "DELETE" }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useClearNotificationsMutation,
} = notificationApis;
