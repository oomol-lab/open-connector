import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eventzilla";

const nullableString = s.nullable(s.string("The string value returned by Eventzilla when present."));
const nullableInteger = s.nullable(s.integer("The integer value returned by Eventzilla when present."));
const nullableBoolean = s.nullable(s.boolean("The boolean value returned by Eventzilla when present."));
const positiveId = (description: string) => s.positiveInteger(description);
const paginationInput = {
  offset: s.nonNegativeInteger("The zero-based offset used for Eventzilla pagination."),
  limit: s.positiveInteger("The maximum number of records to return for this Eventzilla request."),
};
const paginationSchema = s.object("Eventzilla pagination metadata.", {
  offset: nullableInteger,
  limit: nullableInteger,
  total: nullableInteger,
  raw: s.array(
    "The raw Eventzilla pagination array returned by the upstream API.",
    s.looseObject("One raw pagination object."),
  ),
});
const eventSchema = s.object("A normalized Eventzilla event.", {
  id: positiveId("The unique Eventzilla event identifier."),
  title: s.nonEmptyString("The Eventzilla event title."),
  description: nullableString,
  currency: nullableString,
  start_date: nullableString,
  start_time: nullableString,
  end_date: nullableString,
  end_time: nullableString,
  dateid: nullableInteger,
  time_zone: nullableString,
  tickets_sold: nullableInteger,
  tickets_total: nullableInteger,
  status: nullableString,
  show_remaining: nullableBoolean,
  twitter_hashtag: nullableString,
  utc_offset: nullableString,
  invite_code: nullableString,
  url: nullableString,
  logo_url: nullableString,
  bgimage_url: nullableString,
  venue: nullableString,
  categories: nullableString,
  language: nullableString,
  description_html: nullableString,
  timezone_code: nullableString,
  raw: s.looseObject("The raw Eventzilla event object."),
});
const ticketSchema = s.looseObject("A normalized Eventzilla ticket category.", {
  id: positiveId("The unique Eventzilla ticket identifier."),
  title: s.nonEmptyString("The Eventzilla ticket title."),
  raw: s.looseObject("The raw Eventzilla ticket object."),
});
const donationSchema = s.looseObject("A normalized Eventzilla donation ticket.", {
  donationid: positiveId("The unique Eventzilla donation ticket identifier."),
  title: s.nonEmptyString("The Eventzilla donation ticket title."),
  raw: s.looseObject("The raw Eventzilla donation object."),
});
const transactionSchema = s.looseObject("A normalized Eventzilla transaction.", {
  checkout_id: positiveId("The Eventzilla checkout identifier."),
  transaction_ref: nullableString,
  refno: nullableString,
  raw: s.looseObject("The raw Eventzilla transaction object."),
});
const attendeeSchema = s.looseObject("A normalized Eventzilla attendee.", {
  id: positiveId("The Eventzilla attendee identifier."),
  first_name: nullableString,
  last_name: nullableString,
  email: nullableString,
  questions: s.array(
    "The attendee custom question responses returned by Eventzilla.",
    s.looseObject("One attendee question response."),
  ),
  raw: s.looseObject("The raw Eventzilla attendee object."),
});
const userSchema = s.looseObject("A normalized Eventzilla organizer or sub-organizer.", {
  id: positiveId("The Eventzilla user identifier."),
  username: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  email: nullableString,
  raw: s.looseObject("The raw Eventzilla user object."),
});

export const eventzillaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    description:
      "List Eventzilla events visible to the authenticated organizer account with optional status or category filtering.",
    inputSchema: s.object(
      "The input payload for listing Eventzilla events.",
      {
        ...paginationInput,
        status: s.nonEmptyString("Optional Eventzilla event status filter such as live or completed."),
        category: s.nonEmptyString("Optional Eventzilla category filter such as music or conference."),
      },
      { optional: ["offset", "limit", "status", "category"] },
    ),
    outputSchema: s.object("The Eventzilla event list response.", {
      pagination: paginationSchema,
      events: s.array("The Eventzilla events returned for this page.", eventSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Get one Eventzilla event by its event identifier.",
    inputSchema: s.object("The input payload for reading one Eventzilla event.", {
      eventid: positiveId("The Eventzilla event identifier."),
    }),
    outputSchema: s.object("The Eventzilla single event response.", { event: s.nullable(eventSchema) }),
  }),
  defineProviderAction(service, {
    name: "list_event_tickets",
    description: "List Eventzilla ticket categories and donation entries for one event.",
    inputSchema: s.object("The input payload for listing Eventzilla tickets for one event.", {
      eventid: positiveId("The Eventzilla event identifier."),
    }),
    outputSchema: s.object("The Eventzilla ticket list response.", {
      tickets: s.array("The ticket categories returned by Eventzilla.", ticketSchema),
      donation: s.array("The donation ticket entries returned by Eventzilla.", donationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_event_transactions",
    description: "List Eventzilla transactions for one event.",
    inputSchema: s.object(
      "The input payload for listing Eventzilla transactions for one event.",
      {
        eventid: positiveId("The Eventzilla event identifier."),
        ...paginationInput,
      },
      { optional: ["offset", "limit"] },
    ),
    outputSchema: s.object("The Eventzilla event transactions response.", {
      pagination: paginationSchema,
      transactions: s.array("The transactions returned by Eventzilla for the requested event.", transactionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_event_attendees",
    description: "List Eventzilla attendees for one event.",
    inputSchema: s.object(
      "The input payload for listing Eventzilla attendees for one event.",
      {
        eventid: positiveId("The Eventzilla event identifier."),
        ...paginationInput,
      },
      { optional: ["offset", "limit"] },
    ),
    outputSchema: s.object("The Eventzilla event attendees response.", {
      attendees: s.array("The attendees returned by Eventzilla for the requested event.", attendeeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Eventzilla organizers and sub-organizers visible to the authenticated account.",
    inputSchema: s.object("The input payload for listing Eventzilla users.", paginationInput, {
      optional: ["offset", "limit"],
    }),
    outputSchema: s.object("The Eventzilla user list response.", {
      pagination: paginationSchema,
      users: s.array("The Eventzilla users returned for this page.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Eventzilla organizer or sub-organizer by user identifier.",
    inputSchema: s.object("The input payload for reading one Eventzilla user.", {
      userid: positiveId("The Eventzilla user identifier."),
    }),
    outputSchema: s.object("The Eventzilla single user response.", { user: s.nullable(userSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    description: "Get one Eventzilla transaction by checkout ID or order reference number.",
    inputSchema: s.object(
      "The input payload for reading one Eventzilla transaction. Provide exactly one of checkout_id or refno.",
      {
        checkout_id: positiveId("The Eventzilla checkout identifier."),
        refno: s.nonEmptyString("The Eventzilla order reference number."),
      },
      { optional: ["checkout_id", "refno"] },
    ),
    outputSchema: s.object("The Eventzilla single transaction response.", {
      transaction: s.nullable(transactionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_attendee",
    description: "Get one Eventzilla attendee by attendee identifier.",
    inputSchema: s.object("The input payload for reading one Eventzilla attendee.", {
      attendeeid: positiveId("The Eventzilla attendee identifier."),
    }),
    outputSchema: s.object("The Eventzilla single attendee response.", { attendee: s.nullable(attendeeSchema) }),
  }),
];
