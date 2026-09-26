import { googleIdentityScopes } from "../googleads/scopes.ts";

export const googleChatSpacesReadonlyScope = "https://www.googleapis.com/auth/chat.spaces.readonly";
export const googleChatMessagesReadonlyScope = "https://www.googleapis.com/auth/chat.messages.readonly";
/**
 * Grants only "compose and send messages". Deliberately not `chat.messages`,
 * which Google describes as "see, compose, send, update, and delete messages"
 * plus reactions — far beyond what sending a message needs.
 */
export const googleChatMessagesCreateScope = "https://www.googleapis.com/auth/chat.messages.create";
/** Lists the members of a space, which is the only way to learn a direct message's other participant. */
export const googleChatMembershipsReadonlyScope = "https://www.googleapis.com/auth/chat.memberships.readonly";
/**
 * Reads Workspace directory profiles through the People API. Chat reports members
 * as `users/{id}` with no name under user authentication, and this is the narrowest
 * scope that turns that id into a name. It exposes the organization directory, not
 * just the peer, and Workspace admins can restrict it or disable profile sharing.
 */
export const googleDirectoryReadonlyScope = "https://www.googleapis.com/auth/directory.readonly";

/**
 * Scopes minted into service account tokens. Frozen at what existing domain-wide
 * delegations already grant: a token request that asks for an undelegated scope
 * fails as a whole, which would break every Chat action, not just the new ones.
 * Service account connections therefore cannot send messages or name members.
 */
export const googleChatServiceAccountScopes: string[] = [
  googleChatSpacesReadonlyScope,
  googleChatMessagesReadonlyScope,
  ...googleIdentityScopes,
];

export const googleChatOAuthScopes: string[] = [
  ...googleChatServiceAccountScopes,
  googleChatMessagesCreateScope,
  googleChatMembershipsReadonlyScope,
  googleDirectoryReadonlyScope,
];
