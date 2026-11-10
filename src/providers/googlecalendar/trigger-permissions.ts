import type { TriggerPermission } from "../../triggers/metadata.ts";

export const triggerPermissions: readonly TriggerPermission[] = [
  {
    id: "googlecalendar.on_event_changed",
    name: "Event Changed",
    description:
      "Reads events in the selected calendar to detect created, updated or cancelled events. Does not modify the calendar.",
    providerPermissions: ["https://www.googleapis.com/auth/calendar.readonly"],
    instructions: "The connected account must have read access to the selected calendar.",
  },
];
