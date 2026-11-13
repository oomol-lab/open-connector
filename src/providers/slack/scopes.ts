const slackReadScopes = [
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

const slackWriteScopes = ["chat:write", "im:write", "files:write", "reactions:write"];

export const slackBotOAuthScopes: string[] = [...slackReadScopes, ...slackWriteScopes, "app_mentions:read"];

// Real-time Search has distinct app eligibility and private-content consent requirements.
export const slackUserOAuthScopes: string[] = [...slackReadScopes, ...slackWriteScopes, "search:read"];
