import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eventee";

const emptyInputSchema = s.object("The input payload for this action.", {});
const hallSchema = s.looseObject("Eventee hall.", {
  id: s.integer("Unique identifier of the hall."),
  name: s.string("Display name of the hall."),
});
const sessionSchema = s.looseObject("Eventee lecture or workshop.", {
  id: s.integer("Unique identifier of the session."),
  name: s.string("Display name of the session."),
  description: s.string("Description of the session."),
  start: s.string("Session start timestamp."),
  end: s.string("Session end timestamp."),
});
const speakerSchema = s.looseObject("Eventee speaker.", {
  id: s.integer("Unique identifier of the speaker."),
  name: s.string("Display name of the speaker."),
  email: s.string("Email address of the speaker."),
});
const groupSchema = s.looseObject("Eventee attendee group.", {
  id: s.integer("Unique identifier of the attendee group."),
  name: s.string("Internal name of the attendee group."),
  public_name: s.string("Public label shown to attendees."),
});
const participantSchema = s.looseObject("Eventee participant.", {
  id: s.integer("Unique identifier of the participant."),
  email: s.string("Email address of the participant."),
  name: s.string("Full display name of the participant."),
});
const registrationSchema = s.looseObject("Eventee registration.", {
  id: s.integer("Unique identifier of the registration."),
  email: s.string("Email address of the registration."),
  first_name: s.string("First name captured in the registration."),
  last_name: s.string("Last name captured in the registration."),
});

export const eventeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_event_content",
    description: "Retrieve the event content export, including halls, sessions, pauses, speakers, and tracks.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Eventee content export response.", {
      content: s.object("Normalized Eventee content export.", {
        halls: s.array("Halls returned by Eventee.", hallSchema),
        lectures: s.array("Lectures returned by Eventee.", sessionSchema),
        workshops: s.array("Workshops returned by Eventee.", sessionSchema),
        pauses: s.array("Pauses returned by Eventee.", s.looseObject("Eventee pause.")),
        speakers: s.array("Speakers returned by Eventee.", speakerSchema),
        tracks: s.array("Tracks returned by Eventee.", s.looseObject("Eventee track.")),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_reviews",
    description: "List all session reviews submitted by attendees for the current Eventee event.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Eventee review list response.", {
      reviews: s.array("Reviews returned by Eventee.", s.looseObject("Eventee session review.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List all attendee groups configured for the current Eventee event.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Eventee group list response.", {
      groups: s.array("Groups returned by Eventee.", groupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_participants",
    description: "List all participants currently registered in the current Eventee event.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Eventee participant list response.", {
      participants: s.array("Participants returned by Eventee.", participantSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_registrations",
    description: "List all pending or completed registrations for the current Eventee event.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Eventee registration list response.", {
      registrations: s.array("Registrations returned by Eventee.", registrationSchema),
    }),
  }),
];
