import apiSlice from "./api";


export interface Message {
    _id: string;
    senderId: string;
    receiverId: string;
    message: string;
    createdAt: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
}

export const messageApis = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
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
    }),
});

export const { useGetMessageQuery } = messageApis;