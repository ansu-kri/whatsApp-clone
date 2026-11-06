import apiSlice from "./api";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt?: string;
  lastSeen?: string;
  isOnline?: boolean;
  unreadCount?: number;
}

export const userApis = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => ({ url: "/api/user", method: "GET" }),
      providesTags: ["User"],
    }),

    getMe: builder.query<User, void>({
      query: () => ({
        url: "/api/user/me",
        method: "GET",
      }),
      providesTags: ["User"],
    }),
    updateMe: builder.mutation<
      User,
      Partial<Pick<User, "name" | "email" | "avatar">>
    >({
      query: (body) => ({ url: "/api/user/me", method: "PATCH", body }),
      invalidatesTags: ["User"],
    }),
  }),
});

export const { useGetUsersQuery, useGetMeQuery, useUpdateMeMutation } =
  userApis;
