import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nylas";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const optionalInteger = (description: string): JsonSchema => s.nonNegativeInteger(description);
const positiveInteger = (description: string): JsonSchema => s.positiveInteger(description);

const grantId = nonEmptyString(
  "The Nylas grant ID to access. Nylas also accepts the grant email address for grant-scoped endpoints.",
);
const calendarId = nonEmptyString(
  "The Nylas calendar ID to filter events by. Use primary to query the user's primary calendar.",
);
const requestId = s.nullableString("The Nylas request ID when returned.");
const rawPayload = s.looseObject("The raw Nylas response payload.");
const rawObject = s.looseObject("The raw Nylas object returned by the API.");
const paginationCursor = s.nullableString("The cursor token for the next page when Nylas returns one.");

const grant = s.actionOutput(
  {
    id: s.nonEmptyString("The Nylas grant ID."),
    provider: s.nonEmptyString("The provider connected to this grant."),
    email: s.nullableString("The email address associated with the grant when returned."),
    name: s.nullableString("The user display name associated with the grant when returned."),
    grantStatus: s.nullableString("The Nylas grant status when returned."),
    createdAt: s.nullableNumber("When the grant was created, in Unix seconds."),
    updatedAt: s.nullableNumber("When the grant was last updated, in Unix seconds."),
    raw: rawObject,
  },
  "A Nylas grant object.",
);

const calendar = s.actionOutput(
  {
    id: s.nonEmptyString("The calendar ID."),
    name: s.nullableString("The calendar display name when returned."),
    description: s.nullableString("The calendar description when returned."),
    timezone: s.nullableString("The calendar timezone when returned."),
    isPrimary: s.nullableBoolean("Whether this is the user's primary calendar when returned."),
    readOnly: s.nullableBoolean("Whether the calendar is read-only when returned."),
    raw: rawObject,
  },
  "A Nylas calendar object.",
);

const event = s.actionOutput(
  {
    id: s.nonEmptyString("The event ID."),
    title: s.nullableString("The event title when returned."),
    calendarId: s.nullableString("The calendar ID associated with the event when returned."),
    grantId: s.nullableString("The grant ID associated with the event when returned."),
    busy: s.nullableBoolean("Whether the event blocks time as busy when returned."),
    status: s.nullableString("The event status when returned."),
    htmlLink: s.nullableString("The provider event URL when returned."),
    raw: rawObject,
  },
  "A Nylas event object.",
);

export type NylasActionName = "list_grants" | "get_grant" | "list_calendars" | "list_events";

export const nylasActions: ActionDefinition[] = [
  action(
    "list_grants",
    "read",
    "List grants in the Nylas application with optional filters.",
    s.actionInput(
      {
        limit: positiveInteger("The maximum number of grants to return."),
        offset: optionalInteger("The result offset for Nylas offset pagination."),
        email: nonEmptyString("Filter grants by email address."),
        provider: nonEmptyString("Filter grants by provider name."),
        grantStatus: s.stringEnum(["valid", "invalid"], {
          description: "Filter grants by grant status.",
        }),
        workspaceId: nonEmptyString("Filter grants by Nylas workspace ID."),
        since: optionalInteger("Return grants created at or after this Unix timestamp."),
        before: optionalInteger("Return grants created at or before this Unix timestamp."),
        orderBy: nonEmptyString("The sort order accepted by Nylas."),
        sortBy: nonEmptyString("The field Nylas should use to sort grants."),
      },
      [],
      "The input payload for listing Nylas grants.",
    ),
    s.actionOutput(
      {
        requestId,
        grants: s.array(grant, { description: "The grants returned by Nylas." }),
        limit: s.nullableNumber("The page limit returned by Nylas when present."),
        offset: s.nullableNumber("The page offset returned by Nylas when present."),
        raw: rawPayload,
      },
      "The response returned when listing Nylas grants.",
    ),
  ),
  action(
    "get_grant",
    "read",
    "Get one Nylas grant by ID.",
    s.actionInput(
      {
        grantId,
        exposeAliases: s.boolean("Whether Nylas should include Google or Microsoft email aliases."),
      },
      ["grantId"],
      "The input payload for getting a Nylas grant.",
    ),
    s.actionOutput(
      {
        requestId,
        grant,
        raw: rawPayload,
      },
      "The response returned when getting a Nylas grant.",
    ),
  ),
  action(
    "list_calendars",
    "read",
    "List calendars for a Nylas grant.",
    s.actionInput(
      {
        grantId,
        limit: positiveInteger("The maximum number of calendars to return."),
        pageToken: nonEmptyString("The cursor token for the page to return."),
        select: nonEmptyString("A comma-separated list of calendar fields for Nylas to return."),
      },
      ["grantId"],
      "The input payload for listing Nylas calendars.",
    ),
    s.actionOutput(
      {
        requestId,
        calendars: s.array(calendar, { description: "The calendars returned by Nylas." }),
        nextCursor: paginationCursor,
        raw: rawPayload,
      },
      "The response returned when listing Nylas calendars.",
    ),
  ),
  action(
    "list_events",
    "read",
    "List calendar events for a Nylas grant and calendar.",
    s.actionInput(
      {
        grantId,
        calendarId,
        limit: positiveInteger("The maximum number of events to return."),
        pageToken: nonEmptyString("The cursor token for the page to return."),
        start: optionalInteger("Filter events that start at or after this Unix timestamp."),
        end: optionalInteger("Filter events that end at or before this Unix timestamp."),
        title: nonEmptyString("Filter events by title text."),
        description: nonEmptyString("Filter events by description text."),
        location: nonEmptyString("Filter events by location text."),
        showCancelled: s.boolean("Whether Nylas should include cancelled events."),
        tentativeAsBusy: s.boolean("Whether Nylas should treat tentative Microsoft events as busy."),
        updatedAfter: optionalInteger("Filter events updated after this Unix timestamp."),
        updatedBefore: optionalInteger("Filter events updated before this Unix timestamp."),
        select: nonEmptyString("A comma-separated list of event fields for Nylas to return."),
      },
      ["grantId", "calendarId"],
      "The input payload for listing Nylas events.",
    ),
    s.actionOutput(
      {
        requestId,
        events: s.array(event, { description: "The events returned by Nylas." }),
        nextCursor: paginationCursor,
        raw: rawPayload,
      },
      "The response returned when listing Nylas events.",
    ),
  ),
];

function action(
  name: NylasActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}
