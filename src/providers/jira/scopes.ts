export const jiraReadWorkScope = "read:jira-work";
export const jiraReadUserScope = "read:jira-user";
export const jiraWriteWorkScope = "write:jira-work";
export const jiraOfflineAccessScope = "offline_access";

export const jiraReadScopes: string[] = [jiraReadWorkScope, jiraReadUserScope];
export const jiraWriteScopes: string[] = [jiraWriteWorkScope];
export const jiraOAuthScopes: string[] = [
  "manage:jira-webhook",
  jiraReadWorkScope,
  jiraReadUserScope,
  jiraWriteWorkScope,
  jiraOfflineAccessScope,
];
