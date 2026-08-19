import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "evenium";

const paginationIntegerSchema = s.nonNegativeInteger("The non-negative pagination value returned by Evenium.");
const guestFieldsSchema = s.array(
  "Optional guest sub-resources to expand on guest responses.",
  s.stringEnum("One guest expansion field name accepted by Evenium.", ["REGISTRATION", "PRESENCE", "SIGNATURE"]),
);
const eventSchema = s.looseObject("One Evenium event returned by the organizer API.", {
  id: s.nonEmptyString("The Evenium event identifier."),
  title: s.string("The event title returned by Evenium."),
  description: s.string("The event description returned by Evenium."),
  startDate: s.string("The event start timestamp in ISO 8601 format."),
  endDate: s.string("The event end timestamp in ISO 8601 format."),
  creationDate: s.string("The event creation timestamp in ISO 8601 format."),
  status: s.string("The current Evenium event status."),
  url: s.string("The Evenium relative event URL."),
  fields: s.array(
    "Additional event field entries returned by Evenium.",
    s.looseObject("One Evenium event field entry."),
  ),
});
const guestSchema = s.looseObject("One Evenium guest returned by the organizer API.", {
  contactId: s.nonEmptyString("The Evenium contact identifier for the guest."),
  customId: s.string("The external custom identifier attached to the guest."),
  eventId: s.nonEmptyString("The Evenium event identifier that owns the guest."),
  guestCode: s.string("The Evenium guest code used for direct guest lookup."),
  firstName: s.string("The guest first name."),
  lastName: s.string("The guest last name."),
  email: s.string("The guest email address."),
  status: s.string("The guest RSVP status returned by Evenium."),
  fields: s.array("The custom fields attached to the guest.", s.looseObject("One Evenium custom field entry.")),
});

export const eveniumActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    description: "List Evenium events with optional title, status, date filters, and pagination.",
    inputSchema: s.object(
      "Input parameters for listing Evenium events.",
      {
        maxResults: s.nonNegativeInteger("The maximum number of events to return."),
        firstResult: s.nonNegativeInteger("The zero-based offset of the first event to return."),
        startsAfter: s.nonEmptyString("Only return events that start after this ISO 8601 timestamp."),
        startsBefore: s.nonEmptyString("Only return events that start before this ISO 8601 timestamp."),
        endsAfter: s.nonEmptyString("Only return events that end after this ISO 8601 timestamp."),
        endsBefore: s.nonEmptyString("Only return events that end before this ISO 8601 timestamp."),
        createdAfter: s.nonEmptyString("Only return events created after this ISO 8601 timestamp."),
        createdBefore: s.nonEmptyString("Only return events created before this ISO 8601 timestamp."),
        title: s.nonEmptyString("Only return events whose title contains this value."),
        status: s.nonEmptyString("Only return events with this Evenium status value."),
      },
      {
        optional: [
          "maxResults",
          "firstResult",
          "startsAfter",
          "startsBefore",
          "endsAfter",
          "endsBefore",
          "createdAfter",
          "createdBefore",
          "title",
          "status",
        ],
      },
    ),
    outputSchema: s.object("The normalized Evenium event list response.", {
      nbrResults: paginationIntegerSchema,
      maxResults: paginationIntegerSchema,
      firstResult: paginationIntegerSchema,
      more: s.boolean("Whether Evenium reports that more events are available."),
      events: s.array("The events returned by the current page.", eventSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Get one Evenium event by event ID or external event ID.",
    inputSchema: s.object("Input parameters for retrieving one Evenium event.", {
      eventId: s.nonEmptyString("The Evenium event identifier or external event ID."),
    }),
    outputSchema: s.object("The normalized Evenium event lookup response.", {
      event: eventSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_guests",
    description: "List guests for one Evenium event with optional attendee filters, expansions, and pagination.",
    inputSchema: s.object(
      "Input parameters for listing Evenium guests.",
      {
        eventId: s.nonEmptyString("The Evenium event identifier or external event ID."),
        maxResults: s.nonNegativeInteger("The maximum number of guests to return."),
        firstResult: s.nonNegativeInteger("The zero-based offset of the first guest to return."),
        fields: guestFieldsSchema,
        status: s.nonEmptyString("Only return guests with this Evenium RSVP status."),
        since: s.nonEmptyString("Only return guests updated after this ISO 8601 timestamp."),
        until: s.nonEmptyString("Only return guests updated before this ISO 8601 timestamp."),
        lastName: s.nonEmptyString("Only return guests whose last name matches this value."),
        firstName: s.nonEmptyString("Only return guests whose first name matches this value."),
        email: s.nonEmptyString("Only return guests whose email exactly matches this value."),
        company: s.nonEmptyString("Only return guests whose company matches this value."),
      },
      {
        optional: [
          "maxResults",
          "firstResult",
          "fields",
          "status",
          "since",
          "until",
          "lastName",
          "firstName",
          "email",
          "company",
        ],
      },
    ),
    outputSchema: s.object("The normalized Evenium guest list response.", {
      nbrResults: paginationIntegerSchema,
      maxResults: paginationIntegerSchema,
      firstResult: paginationIntegerSchema,
      more: s.boolean("Whether Evenium reports that more guests are available."),
      guests: s.array("The guests returned by the current page.", guestSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guest",
    description: "Get one Evenium guest by contact ID or guest code for a given event.",
    inputSchema: s.object(
      "Input parameters for retrieving one Evenium guest. Provide either contactId or guestCode.",
      {
        eventId: s.nonEmptyString("The Evenium event identifier or external event ID."),
        contactId: s.nonEmptyString("The Evenium contact identifier or external contact ID."),
        guestCode: s.nonEmptyString("The Evenium guest code."),
        fields: guestFieldsSchema,
      },
      { optional: ["contactId", "guestCode", "fields"] },
    ),
    outputSchema: s.object("The normalized Evenium guest lookup response.", {
      guest: guestSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_guest_status",
    description: "Get the current RSVP status for one Evenium guest.",
    inputSchema: s.object("Input parameters for retrieving one Evenium guest status.", {
      eventId: s.nonEmptyString("The Evenium event identifier or external event ID."),
      contactId: s.nonEmptyString("The Evenium contact identifier or external contact ID."),
    }),
    outputSchema: s.object("The normalized Evenium guest status response.", {
      guestStatus: s.object("The Evenium guest status payload.", {
        contactId: s.nonEmptyString("The Evenium contact identifier for the guest."),
        eventId: s.nonEmptyString("The Evenium event identifier that owns the guest."),
        status: s.string("The current RSVP status returned by Evenium."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_guest_post_status",
    description: "Get the current post-event attendance status for one Evenium guest.",
    inputSchema: s.object("Input parameters for retrieving one Evenium guest post-event status.", {
      eventId: s.nonEmptyString("The Evenium event identifier or external event ID."),
      contactId: s.nonEmptyString("The Evenium contact identifier or external contact ID."),
    }),
    outputSchema: s.object("The normalized Evenium guest post-status response.", {
      guestPostStatus: s.object("The Evenium guest post-status payload.", {
        contactId: s.nonEmptyString("The Evenium contact identifier for the guest."),
        eventId: s.nonEmptyString("The Evenium event identifier that owns the guest."),
        postStatus: s.string("The current post-event status returned by Evenium."),
      }),
    }),
  }),
];
