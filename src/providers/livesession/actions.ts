import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "livesession";

const relativeDateValues = ["TODAY", "YESTERDAY", "BEGINNING_OF_WEEK", "BEGINNING_OF_MONTH"];

const dateFilterSchema = s.anyOf("An ISO 8601 timestamp or LiveSession relative date string.", [
  s.dateTime("An ISO 8601 timestamp accepted by LiveSession."),
  s.stringEnum("A LiveSession relative date shortcut.", relativeDateValues),
]);

const sessionLooseObjectSchema = s.looseObject("Nested LiveSession session data.");

const sessionSchema = s.looseObject("A normalized LiveSession session.", {
  id: s.string("The LiveSession session identifier."),
  websiteId: s.nullableString("The website identifier where the session was recorded."),
  sessionUrl: s.nullableString("The URL to open the session in the LiveSession dashboard."),
  creationTimestamp: s.nullableInteger("Unix timestamp when the session was created, as returned by LiveSession."),
  duration: s.nullableInteger("Total session duration in seconds when returned."),
  device: s.nullableString("Device type reported for the session."),
  visitor: s.nullable(sessionLooseObjectSchema),
  raw: s.looseObject("The raw LiveSession session object."),
});

const pageSchema = s.object("LiveSession pagination metadata.", {
  num: s.integer("The current LiveSession page number."),
  size: s.integer("The page size used by LiveSession."),
});

export const livesessionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sessions",
    description: "List LiveSession session replays with pagination and common filters.",
    inputSchema: s.object(
      "Query parameters for listing LiveSession sessions.",
      {
        page: s.integer("The page number to start with. LiveSession defaults to 0.", {
          minimum: 0,
          maximum: 10_000,
        }),
        size: s.integer("The number of sessions per page. LiveSession defaults to 25.", {
          minimum: 1,
          maximum: 100,
        }),
        email: s.email("Filter sessions by the identified visitor email address."),
        visitorId: s.nonEmptyString("Filter sessions by LiveSession visitor ID."),
        timezone: s.nonEmptyString("IANA timezone used by LiveSession for relative date filters."),
        dateFrom: dateFilterSchema,
        dateTo: dateFilterSchema,
      },
      { optional: ["page", "size", "email", "visitorId", "timezone", "dateFrom", "dateTo"] },
    ),
    outputSchema: s.object("A LiveSession session list response.", {
      total: s.nonNegativeInteger("Total sessions matching the query."),
      page: pageSchema,
      sessions: s.array("Sessions returned by LiveSession.", sessionSchema),
      raw: s.looseObject("The raw LiveSession list sessions response."),
    }),
  }),
];
