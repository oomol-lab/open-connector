import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "zoom.on_recording_ready",
    name: "Cloud Recording Ready",
    description: "Receives completed cloud recordings hosted by the connected user.",
    providerPermissions: ["user:read:user", "cloud_recording:read:recording"],
    instructions:
      "Configure recording.completed in the Zoom application, enter the Webhook Secret Token, and validate the endpoint. The connected user must have cloud recording access.",
  },
];
