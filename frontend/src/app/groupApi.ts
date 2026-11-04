import apiSlice from "./api";

export interface UploadImageResponse {
    mediaUrl: string;
    mediaType: string;
    fileName: string;
}

export interface CreateGroupRequest {
    name: string;
    members: string[];
    groupImage?: string;
    createdBy: string;
}

export interface GroupMember {
    id: string;
    name: string;
    avatar?: string;
    isAdmin?: boolean;
}

export interface Group {
    id: string;
    name: string;
    members: GroupMember[];
    groupImage?: string;
    createdBy?: string;
    admins?: string[];
}

export interface CreateGroupResponse {
    groupId: string;
    group: Group;
}

export interface GroupMessage {
    id: string;
    senderId: string;
    senderName?: string;
    groupId: string;
    message: string;
    createdAt: string;
    edited?: boolean;
    deleted?: boolean;
    status?: string;
}

export const groupApis = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        uploadImage: builder.mutation<UploadImageResponse, File>({
            query: (file) => {
                const formData = new FormData();
                formData.append("file", file);

                return {
                    url: "/api/upload/?purpose=group-avatar",
                    method: "POST",
                    body: formData,
                };
            },
        }),

        createGroup: builder.mutation<CreateGroupResponse, CreateGroupRequest>({
            query: ({ name, members, groupImage, createdBy }) => ({
                url: `/api/group/create`,
                method: "POST",
                body: {
                    name,
                    members,
                    groupImage,
                    createdBy,
                },
            }),
            invalidatesTags: ["Groups"],
        }),

        getGroups: builder.query<Group[], string>({
            query: (userId) => ({
                url: `/api/group/user/${userId}`,
                method: "GET",
            }),
            providesTags: ["Groups"],
        }),

        getGroupMessage: builder.query<GroupMessage[], { groupId: string }>({
            query: ({ groupId }) => ({
                url: `/api/group/messages/${groupId}`,
                method: "GET",
            }),
            providesTags: (_result, _error, arg) => [
                { type: "Groups", id: `messages-${arg.groupId}` },
            ],
        }),

        addGroupMembers: builder.mutation<
            Group,
            { groupId: string; memberIds: string[] }
        >({
            query: ({ groupId, memberIds }) => ({
                url: `/api/group/${groupId}/members`,
                method: "POST",
                body: { memberIds },
            }),
            invalidatesTags: ["Groups"],
        }),


        leaveGroup: builder.mutation<Group, string>({
            query: (groupId) => ({ url: `/api/group/${groupId}/members/me`, method: "DELETE" }),
            invalidatesTags: ["Groups"],
        }),

        deleteGroup: builder.mutation<{ id: string; deleted: boolean }, string>({
            query: (groupId) => ({ url: `/api/group/${groupId}`, method: "DELETE" }),
            invalidatesTags: ["Groups"],
        }),
        removeGroupMember: builder.mutation<
            Group,
            { groupId: string; memberId: string }
        >({
            query: ({ groupId, memberId }) => ({
                url: `/api/group/${groupId}/members/${memberId}`,
                method: "DELETE",
            }),
            invalidatesTags: ["Groups"],
        }),
    }),
});

export const {
    useUploadImageMutation,
    useCreateGroupMutation,
    useGetGroupsQuery,
    useGetGroupMessageQuery,
    useAddGroupMembersMutation,
    useRemoveGroupMemberMutation,
    useLeaveGroupMutation,
    useDeleteGroupMutation,
} = groupApis;
