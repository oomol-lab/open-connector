import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "oncehub";

const cursorSchema = s.nonEmptyString("A OnceHub object ID used as a pagination cursor.");
const limitSchema = s.integer("The maximum number of objects to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const expandSchema = s.array(
  "The OnceHub expandable response fields to include, using official expand paths.",
  s.nonEmptyString("One OnceHub expand path."),
  { minItems: 1 },
);

const paginationInputProperties: Record<string, JsonSchema> = {
  limit: limitSchema,
  after: cursorSchema,
  before: cursorSchema,
  expand: expandSchema,
};

const oncehubObjectSchema = s.looseObject("A OnceHub API object.", {
  id: s.string("The OnceHub object identifier."),
  object: s.string("The OnceHub object type."),
});

const listOutputSchema = s.object("A paginated OnceHub list response.", {
  object: s.string("The OnceHub list object type."),
  data: s.array("The OnceHub objects returned by the list request.", oncehubObjectSchema),
  hasMore: s.boolean("Whether OnceHub reported additional objects in the list response."),
  nextCursor: s.nullable(s.string("The cursor ID for the next page when available.")),
  previousCursor: s.nullable(s.string("The cursor ID for the previous page when available.")),
  requestId: s.nullable(s.string("The OnceHub Request-Id response header when available.")),
});

function paginatedInputSchema(description: string, properties: Record<string, JsonSchema> = {}): JsonSchema {
  return s.object(
    description,
    {
      ...paginationInputProperties,
      ...properties,
    },
    {
      optional: ["limit", "after", "before", "expand", ...Object.keys(properties)],
    },
  );
}

export const oncehubActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_bookings",
    description: "List OnceHub bookings, optionally filtered by last update time.",
    inputSchema: paginatedInputSchema("The input payload for listing OnceHub bookings.", {
      lastUpdatedTimeGt: s.dateTime("Only return bookings whose last_updated_time is greater than this timestamp."),
    }),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_booking_pages",
    description: "List OnceHub Booking Pages.",
    inputSchema: paginatedInputSchema("The input payload for listing OnceHub Booking Pages."),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_event_types",
    description: "List OnceHub event types.",
    inputSchema: paginatedInputSchema("The input payload for listing OnceHub event types."),
    outputSchema: listOutputSchema,
  }),
];
