import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "zoom.on_recording_ready",
    name: "Cloud Recording Ready",
    description: "Receives completed cloud recordings hosted by the connected user.",
    providerScopeAlternatives: ["cloud_recording:read:recording", "cloud_recording:read:recording:admin"],
    providerPermissions: ["user:read:user", "cloud_recording:read:recording"],
    instructions:
      "Configure recording.completed in the Zoom application, enter the Webhook Secret Token, and validate the endpoint. Authorize cloud_recording:read:recording or cloud_recording:read:recording:admin and reconnect existing connections that lack recording access.",
  },
];
