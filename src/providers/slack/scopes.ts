export const slackReadScopes: string[] = [
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "users:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "files:read",
  "reactions:read",
];

export const slackWriteScopes: string[] = ["chat:write", "im:write", "files:write", "reactions:write"];

export const slackBotOAuthScopes: string[] = [...slackReadScopes, ...slackWriteScopes];

export const slackUserOAuthScopes: string[] = [...slackReadScopes, ...slackWriteScopes, "search:read"];

export const slackSearchOAuthScopes: string[] = ["search:read.public", "search:read.private", "search:read.users"];
