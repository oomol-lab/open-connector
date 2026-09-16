const microsoftTeamsProviderScopes = {
  userRead: "User.Read",
  teamReadBasicAll: "Team.ReadBasic.All",
  channelReadBasicAll: "Channel.ReadBasic.All",
  channelMessageReadAll: "ChannelMessage.Read.All",
  channelMessageSend: "ChannelMessage.Send",
  chatRead: "Chat.Read",
  chatMessageSend: "ChatMessage.Send",
  offlineAccess: "offline_access",
};

export const microsoftTeamsProfileScopes: string[] = [microsoftTeamsProviderScopes.userRead];
export const microsoftTeamsTeamScopes: string[] = [microsoftTeamsProviderScopes.teamReadBasicAll];
export const microsoftTeamsChannelScopes: string[] = [microsoftTeamsProviderScopes.channelReadBasicAll];
export const microsoftTeamsChannelMessageReadScopes: string[] = [microsoftTeamsProviderScopes.channelMessageReadAll];
export const microsoftTeamsChannelMessageSendScopes: string[] = [microsoftTeamsProviderScopes.channelMessageSend];
export const microsoftTeamsChatReadScopes: string[] = [microsoftTeamsProviderScopes.chatRead];
export const microsoftTeamsChatMessageSendScopes: string[] = [microsoftTeamsProviderScopes.chatMessageSend];
export const microsoftTeamsOAuthScopes: string[] = [
  microsoftTeamsProviderScopes.userRead,
  microsoftTeamsProviderScopes.teamReadBasicAll,
  microsoftTeamsProviderScopes.channelReadBasicAll,
  microsoftTeamsProviderScopes.channelMessageReadAll,
  microsoftTeamsProviderScopes.channelMessageSend,
  microsoftTeamsProviderScopes.chatRead,
  microsoftTeamsProviderScopes.chatMessageSend,
  microsoftTeamsProviderScopes.offlineAccess,
];
