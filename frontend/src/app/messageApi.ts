import apiSlice from "./api";
import { userApis } from "./userApi";


export interface Message {
    _id: string;
    senderId: string;
    receiverId: string;
    message: string;
    createdAt: string;
    edited?: boolean;
    deleted?: boolean;
}

export interface MessageMutationResponse {
    id: string;
    message?: string;
    edited?: boolean;
    deleted?: boolean;
}

export interface User {
    id: string;
    name: string;
    email: string;
}

export const messageApis = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        markAllRead: builder.mutation<{ updated: number }, void>({
            query: () => ({ url: "/api/messages/read-all", method: "PATCH" }),
            invalidatesTags: ["User", "Messages"],
        }),
        //Get messages between two users
        getMessage: builder.query<
        Message[],
        { senderId: string; receiverId: string }
        >({
            query: ({ senderId, receiverId }) => ({
                url: `/api/messages/${senderId}/${receiverId}`,
                method: "GET",
            }),
        }),

        //Edit Message
        editMessage: builder.mutation<
            MessageMutationResponse,
            { id: string; message: string }
        >({
            query: ({ id, message }) => ({
                url: `/api/messages/edit/${id}`,
                method: "PUT",
                body: { message },
            }),
            async onQueryStarted({ id, message }, { dispatch, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    dispatch(userApis.util.updateQueryData("getUsers", undefined, (users) => {
                        const user = users.find((candidate) => candidate.latestMessageId === id);
                        if (user) user.recentMessage = message;
                    }));
                } catch {
                    // A failed edit must not change the cached sidebar preview.
                }
            },
        }),

        //Delete Message
        deleteMessage: builder.mutation<
            MessageMutationResponse,
            string
        >({
            query: (id) => ({
                url: `/api/messages/delete/${id}`,
                method: "DELETE",
            }),
            async onQueryStarted(id, { dispatch, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    dispatch(userApis.util.updateQueryData("getUsers", undefined, (users) => {
                        const user = users.find((candidate) => candidate.latestMessageId === id);
                        if (user) user.recentMessage = "This message was deleted";
                    }));
                } catch {
                    // A failed delete must not change the cached sidebar preview.
                }
            },
        }),
    }),
});

export const { useGetMessageQuery, useEditMessageMutation, useDeleteMessageMutation, useMarkAllReadMutation } = messageApis;