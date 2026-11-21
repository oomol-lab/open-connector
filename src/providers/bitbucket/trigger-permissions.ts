import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "bitbucket.on_repo_event",
    name: "Repository Event",
    description: "Manages a signed Bitbucket repository webhook and receives selected events.",
    providerPermissions: ["webhook"],
    instructions: "Use a Bitbucket connection with webhook management permission on the target repository.",
  },
];
