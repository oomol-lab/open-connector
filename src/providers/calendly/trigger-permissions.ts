import type { TriggerPermission } from "../../triggers/metadata.ts";
export const triggerPermissions: TriggerPermission[] = [
  {
    id: "calendly.on_booking_event",
    name: "Booking Created or Canceled",
    description: "Manages a signed webhook and receives the selected business events.",
    providerPermissions: [],
    instructions:
      "Use a Personal Access Token connection with a webhook-capable plan and access to the selected user or organization. OAuth app signing keys are not configured by this Trigger.",
  },
];
