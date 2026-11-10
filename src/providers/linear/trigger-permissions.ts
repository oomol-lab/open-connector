import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: readonly TriggerPermission[] = [
  {
    id: "linear.on_issue_event",
    name: "Issue Event",
    description: "Registers, maintains and deletes issue webhooks in a Linear workspace.",
    providerPermissions: ["admin"],
    instructions: "Use an API key owned by a workspace admin, or explicitly authorize the OAuth admin scope.",
  },
  {
    id: "linear.on_issue_changed",
    name: "Issue Created or Updated",
    description:
      "Queries issues and configuration options to detect newly created or updated issues matching the selected filters.",
    providerPermissions: ["read"],
    instructions:
      "Grant read access to the selected workspace and teams. API key access is limited by the key owner and selected teams.",
  },
];
