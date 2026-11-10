import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: readonly TriggerPermission[] = [
  {
    id: "gitlab.on_project_event",
    name: "Project Event",
    description: "Creates, updates and deletes a project webhook and receives the selected project events.",
    providerPermissions: ["api"],
    instructions:
      "Use a token with api scope and a project role permitted to manage webhooks, normally Maintainer or Owner.",
  },
];
