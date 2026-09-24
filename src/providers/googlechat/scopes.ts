import { googleIdentityScopes } from "../googleads/scopes.ts";

export const googleChatSpacesReadonlyScope = "https://www.googleapis.com/auth/chat.spaces.readonly";
export const googleChatMessagesReadonlyScope = "https://www.googleapis.com/auth/chat.messages.readonly";

export const googleChatOAuthScopes: string[] = [
  googleChatSpacesReadonlyScope,
  googleChatMessagesReadonlyScope,
  ...googleIdentityScopes,
];
