import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "luma";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const dateTimeString = nonEmptyString("ISO 8601 date-time accepted by Luma, for example 2022-10-19T03:27:13.673Z.");
const paginationLimit = s.positiveInteger("Maximum number of records to return. Luma enforces its own maximum.");
const paginationCursor = nonEmptyString("Cursor token returned as next_cursor by a previous Luma page.");
const sortDirectionSchema = s.stringEnum("The Luma sort direction.", [
  "asc",
  "desc",
  "asc nulls last",
  "desc nulls last",
]);

const lumaUserSchema = s.looseObject("A Luma user profile.", {
  id: s.string("The Luma user ID."),
  name: s.nullableString("The user's display name."),
  avatar_url: s.string("The user's avatar URL."),
  email: s.email("The user's email address."),
  first_name: s.nullableString("The user's first name."),
  last_name: s.nullableString("The user's last name."),
});

const lumaCalendarSchema = s.looseObject("A Luma calendar.", {
  id: s.string("The Luma calendar ID."),
  name: s.string("The calendar name."),
  slug: s.nullableString("The calendar slug."),
  avatar_url: s.nullableString("The calendar avatar URL."),
  url: s.string("The public Luma calendar URL."),
  description: s.nullableString("The calendar description."),
  is_personal: s.boolean("Whether this is a personal calendar."),
});

const lumaEventSchema = s.looseObject("A Luma event.", {
  platform: s.string("The event platform, such as luma."),
  id: s.string("The Luma event ID."),
  user_id: s.string("The event creator's Luma user ID."),
  calendar_id: s.string("The managing Luma calendar ID."),
  start_at: s.string("The event start time."),
  end_at: s.string("The event end time."),
  created_at: s.string("The event creation time."),
  timezone: s.string("The event timezone."),
  name: s.string("The event name."),
  description: s.string("The event description."),
  description_md: s.string("The event description in Markdown."),
  url: s.string("The public Luma event URL."),
  visibility: s.string("The event visibility returned by Luma."),
  access: s.string("The API key's access level for this event."),
});

const lumaGuestSchema = s.looseObject("A Luma event guest.", {
  id: s.string("The Luma guest ID."),
  user_id: s.string("The guest's Luma user ID."),
  user_email: s.email("The guest's email address."),
  user_name: s.nullableString("The guest's display name."),
  user_first_name: s.nullableString("The guest's first name."),
  user_last_name: s.nullableString("The guest's last name."),
  approval_status: s.string("The guest approval status."),
  check_in_qr_code: s.string("The guest check-in QR code value."),
  invited_at: s.nullableString("When the guest was invited, or null."),
  registered_at: s.nullableString("When the guest registered, or null."),
  phone_number: s.nullableString("The guest phone number, or null."),
});

const listCalendarEventsInputSchema = s.object(
  "Query parameters for listing Luma calendar events.",
  {
    before: dateTimeString,
    after: dateTimeString,
    pagination_cursor: paginationCursor,
    pagination_limit: paginationLimit,
    platforms: s.array(
      "Event platforms to include, such as luma or external.",
      s.stringEnum("A Luma event platform.", ["luma", "external"]),
    ),
    sort_column: s.stringEnum("The Luma event sort column.", ["start_at"]),
    sort_direction: sortDirectionSchema,
    status: s.stringEnum("The calendar submission status to include.", ["approved", "pending"]),
    access: s.array("Access values to include.", s.stringEnum("A Luma event access value.", ["manage", "view"])),
  },
  {
    optional: [
      "before",
      "after",
      "pagination_cursor",
      "pagination_limit",
      "platforms",
      "sort_column",
      "sort_direction",
      "status",
      "access",
    ],
  },
);

const getEventInputSchema = s.object("Query parameters for retrieving a Luma event.", {
  event_id: nonEmptyString("Luma event ID, usually starting with evt-."),
});

const listEventGuestsInputSchema = s.object(
  "Query parameters for listing Luma event guests.",
  {
    event_id: nonEmptyString("Luma event ID, usually starting with evt-."),
    approval_status: s.stringEnum("Guest approval status to include.", [
      "approved",
      "session",
      "pending_approval",
      "invited",
      "declined",
      "waitlist",
    ]),
    pagination_cursor: paginationCursor,
    pagination_limit: paginationLimit,
    sort_column: s.stringEnum("The Luma guest sort column.", [
      "name",
      "email",
      "created_at",
      "registered_at",
      "checked_in_at",
    ]),
    sort_direction: sortDirectionSchema,
  },
  {
    required: ["event_id"],
    optional: ["approval_status", "pagination_cursor", "pagination_limit", "sort_column", "sort_direction"],
  },
);

const getEventGuestInputSchema = s.object("Query parameters for retrieving a Luma event guest.", {
  event_id: nonEmptyString("Luma event ID, usually starting with evt-."),
  id: nonEmptyString("Guest identifier: guest ID, ticket key, guest key, or email address."),
});

const listEventsOutputSchema = s.object("Paginated Luma events response.", {
  events: s.array("Events returned by Luma.", lumaEventSchema),
  hasMore: s.boolean("Whether Luma has more events to fetch."),
  nextCursor: s.nullableString("Cursor to pass into the next request, when one is available."),
});

const listGuestsOutputSchema = s.object("Paginated Luma event guests response.", {
  guests: s.array("Guests returned by Luma.", lumaGuestSchema),
  hasMore: s.boolean("Whether Luma has more guests to fetch."),
  nextCursor: s.nullableString("Cursor to pass into the next request, when one is available."),
});

export const lumaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    description: "Get the Luma user profile for the current API key.",
    inputSchema: s.object("Input parameters for reading the authenticated Luma user.", {}),
    outputSchema: s.object("Luma authenticated user response.", { user: lumaUserSchema }),
  }),
  defineProviderAction(service, {
    name: "get_calendar",
    description: "Get the Luma calendar scoped to the current API key.",
    inputSchema: s.object("Input parameters for reading the current Luma calendar.", {}),
    outputSchema: s.object("Luma calendar response.", { calendar: lumaCalendarSchema }),
  }),
  defineProviderAction(service, {
    name: "list_calendar_events",
    description: "List events for the Luma calendar scoped to the current API key.",
    inputSchema: listCalendarEventsInputSchema,
    outputSchema: listEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Get full details for a Luma event the API key can manage.",
    inputSchema: getEventInputSchema,
    outputSchema: s.object("Luma event response.", { event: lumaEventSchema }),
  }),
  defineProviderAction(service, {
    name: "list_event_guests",
    description: "List registered or invited guests for a Luma event.",
    inputSchema: listEventGuestsInputSchema,
    outputSchema: listGuestsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_guest",
    description: "Get detailed information for a Luma event guest.",
    inputSchema: getEventGuestInputSchema,
    outputSchema: s.object("Luma event guest response.", { guest: lumaGuestSchema }),
  }),
];
