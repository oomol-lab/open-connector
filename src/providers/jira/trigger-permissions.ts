import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "jira.on_issue_event",
    name: "Issue or Comment Event",
    description: "Maintains a shared Jira Cloud project webhook and verifies OAuth bearer callbacks.",
    providerPermissions: ["read:jira-work", "read:jira-user", "manage:jira-webhook"],
    instructions:
      "Use Jira Cloud OAuth with webhook management scopes and a configured application client secret. The public callback domain must be permitted by the OAuth application. Jira Data Center credentials are not supported.",
  },
];
