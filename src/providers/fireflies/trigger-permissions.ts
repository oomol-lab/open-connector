import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "fireflies.on_meeting_ready",
    name: "Meeting Transcript or Summary Ready",
    description: "Receives signed transcript and summary events and verifies access to the meeting.",
    providerPermissions: [],
    instructions:
      "Configure Webhooks V2 with the supplied URL and a Signing Secret. Enable the selected events and send an event for an accessible meeting. API access and webhook availability depend on the Fireflies plan.",
  },
];
