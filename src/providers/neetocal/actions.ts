import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neetocal" as const;

const identifierSchema = s.nonEmptyString("The NeetoCal record identifier or SID.", {
  pattern: "\\S",
});
const pageNumberSchema = s.positiveInteger("The 1-based result page to fetch.");
const pageSizeSchema = s.positiveInteger("The maximum number of records to return.");
const emailSchema = s.nonEmptyString("The email address used to filter results.", {
  format: "email",
});
const rawObjectSchema = s.looseObject("The raw object returned by NeetoCal.");

const paginationSchema = s.looseRequiredObject(
  "NeetoCal pagination metadata.",
  {
    total_records: s.integer("The total number of matching records."),
    total_pages: s.integer("The total number of result pages."),
    current_page_number: s.integer("The current 1-based page number."),
    page_size: s.integer("The configured result page size."),
  },
  {
    optional: ["total_records", "total_pages", "current_page_number", "page_size"],
  },
);

const schedulingLinkSchema = s.looseRequiredObject(
  "A NeetoCal scheduling link.",
  {
    id: s.string("The unique scheduling-link identifier."),
    sid: s.string("The short scheduling-link identifier used by API paths."),
    name: s.string("The scheduling-link display name."),
    slug: s.string("The scheduling-link URL slug."),
    kind: s.string("The scheduling-link meeting kind."),
    disabled: s.boolean("Whether the scheduling link is disabled."),
  },
  { optional: ["id", "sid", "name", "slug", "kind", "disabled"] },
);

const bookingSchema = s.looseRequiredObject(
  "A NeetoCal booking.",
  {
    id: s.string("The unique booking identifier."),
    sid: s.string("The short booking identifier used by API paths."),
    name: s.string("The booking client name."),
    email: s.string("The booking client email address."),
    starts_at: s.string("The booking start timestamp."),
    ends_at: s.string("The booking end timestamp."),
    status: s.string("The current booking lifecycle status."),
    meeting_id: s.string("The related scheduling-link identifier."),
  },
  { optional: ["id", "sid", "name", "email", "starts_at", "ends_at", "status", "meeting_id"] },
);

const slotDaySchema = s.looseRequiredObject(
  "Available NeetoCal slots for one date.",
  {
    date: s.string("The calendar date for the slot group."),
    day: s.integer("The day of month for the slot group."),
    slots: rawObjectSchema,
  },
  { optional: ["date", "day", "slots"] },
);

const listSchedulingLinksAction = defineProviderAction(service, {
  name: "list_scheduling_links",
  operationType: "read",
  description: "List NeetoCal scheduling links with optional host, search, and pagination filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for listing NeetoCal scheduling links.",
    {
      pageNumber: pageNumberSchema,
      pageSize: pageSizeSchema,
      hostEmails: s.array("The host email addresses used to filter scheduling links.", emailSchema, {
        minItems: 1,
      }),
      search: s.nonEmptyString("The case-insensitive meeting name or slug search term.", {
        pattern: "\\S",
      }),
    },
    { optional: ["pageNumber", "pageSize", "hostEmails", "search"] },
  ),
  outputSchema: s.object("The NeetoCal scheduling-link list response.", {
    meetings: s.array("The scheduling links returned by NeetoCal.", schedulingLinkSchema),
    pagination: s.nullable(paginationSchema),
  }),
});

const getSchedulingLinkAction = defineProviderAction(service, {
  name: "get_scheduling_link",
  operationType: "read",
  description: "Get one NeetoCal scheduling link by SID.",
  requiredScopes: [],
  inputSchema: s.object("The input for getting a NeetoCal scheduling link.", {
    schedulingLinkSid: identifierSchema,
  }),
  outputSchema: schedulingLinkSchema,
});

const listBookingsAction = defineProviderAction(service, {
  name: "list_bookings",
  operationType: "read",
  description: "List NeetoCal bookings with optional type, email, parent, sorting, and pagination filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for listing NeetoCal bookings.",
    {
      type: s.stringEnum("The booking time or lifecycle group to return.", [
        "upcoming",
        "past",
        "cancelled",
        "incomplete",
      ]),
      pageNumber: pageNumberSchema,
      pageSize: pageSizeSchema,
      hostEmail: emailSchema,
      clientEmail: emailSchema,
      parentBookingId: identifierSchema,
      sortingOrder: s.stringEnum("The booking creation-time sorting direction.", ["asc", "desc"]),
    },
    {
      optional: ["type", "pageNumber", "pageSize", "hostEmail", "clientEmail", "parentBookingId", "sortingOrder"],
    },
  ),
  outputSchema: s.object("The NeetoCal booking list response.", {
    bookings: s.array("The bookings returned by NeetoCal.", bookingSchema),
    pagination: s.nullable(paginationSchema),
  }),
});

const getBookingAction = defineProviderAction(service, {
  name: "get_booking",
  operationType: "read",
  description: "Get one NeetoCal booking by SID.",
  requiredScopes: [],
  inputSchema: s.object("The input for getting a NeetoCal booking.", {
    bookingSid: identifierSchema,
  }),
  outputSchema: bookingSchema,
});

const listAvailableSlotsAction = defineProviderAction(service, {
  name: "list_available_slots",
  operationType: "read",
  description: "List available NeetoCal slots for a scheduling link and calendar month.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for listing available NeetoCal slots.",
    {
      schedulingLinkSid: identifierSchema,
      timeZone: s.nonEmptyString("The IANA time zone used to calculate available slots.", {
        pattern: "\\S",
      }),
      year: s.integer("The calendar year to query."),
      month: s.integer("The calendar month to query.", { minimum: 1, maximum: 12 }),
      day: s.integer("The optional day of month used to narrow slot results.", {
        minimum: 1,
        maximum: 31,
      }),
    },
    { optional: ["day"] },
  ),
  outputSchema: s.object("The NeetoCal available-slot response.", {
    slots: s.array("Available slot groups returned by NeetoCal.", slotDaySchema),
  }),
});

export const neetocalActions: ActionDefinition[] = [
  listSchedulingLinksAction,
  getSchedulingLinkAction,
  listBookingsAction,
  getBookingAction,
  listAvailableSlotsAction,
];
