import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: TriggerPermission[] = [
  {
    id: "thehive.on_event",
    name: "Alert or Case Event",
    description: "Polls TheHive alerts or cases for new and updated records.",
    providerPermissions: [],
    instructions: "Use a TheHive API key with read access to alerts and cases.",
  },
];
