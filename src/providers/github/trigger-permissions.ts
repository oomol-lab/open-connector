export const triggerPermissions: readonly import("../../triggers/metadata.ts").TriggerPermission[] = [
  {
    id: "github.on_repo_event",
    name: "Repository Event",
    description: "Creates, updates and deletes a repository webhook and receives the selected repository events.",
    providerPermissions: ["repo"],
    instructions:
      "The connected user must be allowed to manage webhooks on the selected repository. The current OAuth provider uses the repo scope.",
  },
  {
    id: "github.watch_pull_request",
    name: "Watch Pull Request",
    description: "Manages a repository webhook and periodically reads the selected pull request to detect changes.",
    providerPermissions: ["repo"],
    instructions: "Requires repository read access and permission to manage repository webhooks.",
  },
];
