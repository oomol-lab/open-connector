import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "humanitix";

const paginationSchema = s.object("Pagination metadata returned by Humanitix list endpoints.", {
  page: s.integer("The current result page number."),
  pageSize: s.integer("The number of records requested for each page."),
  total: s.integer("The total number of records matching the request."),
});

const eventSummarySchema = s.looseObject("A Humanitix event object returned by the list events endpoint.", {
  id: s.string("The Humanitix event identifier."),
  name: s.string("The event name."),
  slug: s.string("The event slug."),
  url: s.nullable(s.string("The public event URL when one is returned.")),
  startDate: s.string("The event start date returned by Humanitix."),
  endDate: s.string("The event end date returned by Humanitix."),
  timezone: s.string("The event timezone."),
  currency: s.string("The event currency code."),
  public: s.boolean("Whether the event is public."),
  published: s.boolean("Whether the event is published."),
  createdAt: s.string("The event creation timestamp returned by Humanitix."),
  updatedAt: s.string("The event update timestamp returned by Humanitix."),
});

const tagSchema = s.object("A Humanitix tag.", {
  id: s.string("The unique Humanitix tag identifier."),
  name: s.string("The tag name."),
});

export const humanitixActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    description:
      "List Humanitix events accessible to the connected account, with optional pagination and update filters.",
    inputSchema: s.object(
      "Input parameters for listing Humanitix events.",
      {
        page: s.positiveInteger("Page number to fetch."),
        pageSize: s.positiveInteger("Number of events to fetch per page.", { maximum: 100 }),
        since: s.dateTime("Return events updated since this ISO 8601 timestamp."),
        inFutureOnly: s.boolean("Whether to return only events with an end date in the future."),
        overrideLocation: s.string("ISO 3166-1 alpha-2 country code used to override user location.", {
          minLength: 2,
          maxLength: 2,
        }),
      },
      { optional: ["page", "pageSize", "since", "inFutureOnly", "overrideLocation"] },
    ),
    outputSchema: s.actionOutput(
      {
        events: s.array("Humanitix event records.", eventSummarySchema),
        pagination: paginationSchema,
      },
      "Humanitix events returned for the requested page.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Retrieve full Humanitix metadata for a single event by event ID.",
    inputSchema: s.actionInput(
      {
        eventId: s.nonEmptyString("The unique Humanitix event identifier."),
      },
      ["eventId"],
      "Input parameters for retrieving one Humanitix event.",
    ),
    outputSchema: s.actionOutput(
      {
        event: s.looseObject("The complete Humanitix event object."),
      },
      "Detailed Humanitix event returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List tags associated with the connected Humanitix account.",
    inputSchema: s.object(
      "Input parameters for listing Humanitix tags.",
      {
        page: s.positiveInteger("Page number to fetch."),
      },
      { optional: ["page"] },
    ),
    outputSchema: s.actionOutput(
      {
        tags: s.array("Humanitix tag records.", tagSchema),
        pagination: paginationSchema,
      },
      "Humanitix tags returned for the requested page.",
    ),
  }),
];
