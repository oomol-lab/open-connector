import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ringover" as const;

const ringoverObject = s.looseObject("A raw Ringover object returned by the Public API.");
const rawPayload = s.unknown("The raw Ringover response payload.");
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const positiveInteger = (description: string) => s.positiveInteger(description);
const nonNegativeInteger = (description: string, maximum?: number) =>
  s.nonNegativeInteger(description, maximum === undefined ? {} : { maximum });

const paginationInput = {
  limitCount: s.positiveInteger("Maximum number of items to return.", { maximum: 1000 }),
  limitOffset: nonNegativeInteger("Number of items to skip for offset pagination."),
};

const paginatedInputSchema = (description: string) =>
  s.object(description, paginationInput, { optional: ["limitCount", "limitOffset"] });

const objectIdInput = (description: string, key: string, fieldDescription: string) =>
  s.object(description, {
    [key]: positiveInteger(fieldDescription),
  });

const paginatedObjectIdInput = (description: string, key: string, fieldDescription: string) =>
  s.object(
    description,
    {
      [key]: positiveInteger(fieldDescription),
      ...paginationInput,
    },
    { optional: ["limitCount", "limitOffset"] },
  );

const listOutput = (description: string, fieldName: string, fieldDescription: string) =>
  s.object(description, {
    [fieldName]: s.array(fieldDescription, ringoverObject),
    listCount: s.nullable(s.integer("The total item count returned by Ringover when present.")),
    raw: rawPayload,
  });

const singleObjectOutput = (description: string, fieldName: string, fieldDescription: string) =>
  s.object(description, {
    [fieldName]: s.looseObject(fieldDescription),
    raw: rawPayload,
  });

const numberFiltersInput = s.object(
  "Filters for listing Ringover phone numbers.",
  {
    isUser: s.boolean("Whether to include phone numbers assigned to users."),
    isIvr: s.boolean("Whether to include phone numbers assigned to IVRs."),
    isFax: s.boolean("Whether to include phone numbers used for fax."),
    isConference: s.boolean("Whether to include phone numbers assigned to conference rooms."),
    isAvailable: s.boolean("Whether to include unassigned phone numbers."),
  },
  { optional: ["isUser", "isIvr", "isFax", "isConference", "isAvailable"] },
);

const callType = s.stringEnum("One Ringover call type filter.", ["ANSWERED", "MISSED", "OUT", "VOICEMAIL"]);

const listCallsInput = s.object(
  "Filters and pagination for listing terminated Ringover calls.",
  {
    startDate: s.dateTime("Start of the date range as an ISO 8601 date-time."),
    endDate: s.dateTime("End of the date range as an ISO 8601 date-time."),
    limitCount: s.positiveInteger("Maximum number of calls to return.", { maximum: 1000 }),
    limitOffset: nonNegativeInteger("Number of calls to skip for offset pagination.", 9000),
    lastIdReturned: positiveInteger("Cursor value for deep pagination using cdr_id."),
    callType: s.array("Call type filters to apply.", callType, { minItems: 1 }),
  },
  { optional: ["startDate", "endDate", "limitCount", "limitOffset", "lastIdReturned", "callType"] },
);

export const ringoverActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_team",
    operationType: "read",
    description:
      "Retrieve the Ringover team object with nested numbers, users, IVRs, conferences, tags, and groups allowed by the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve Ringover team information.", {}),
    outputSchema: singleObjectOutput(
      "Ringover team information.",
      "team",
      "The Ringover team object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List Ringover call groups with offset pagination.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema("Pagination parameters for listing Ringover groups."),
    outputSchema: listOutput("Ringover groups returned by the Public API.", "groups", "Ringover group objects."),
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description: "Get a Ringover call group by ID, optionally paginating its users array.",
    requiredScopes: [],
    inputSchema: paginatedObjectIdInput("Input for retrieving a Ringover group.", "groupId", "The Ringover group ID."),
    outputSchema: singleObjectOutput(
      "Ringover group details.",
      "group",
      "The Ringover group object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Ringover users visible to the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Ringover users.", {}),
    outputSchema: listOutput("Ringover users returned by the Public API.", "users", "Ringover user objects."),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get a Ringover user by ID.",
    requiredScopes: [],
    inputSchema: objectIdInput("Input for retrieving a Ringover user.", "userId", "The Ringover user ID."),
    outputSchema: singleObjectOutput(
      "Ringover user details.",
      "user",
      "The Ringover user object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_numbers",
    operationType: "read",
    description: "List Ringover phone numbers with assignment-type filters.",
    requiredScopes: [],
    inputSchema: numberFiltersInput,
    outputSchema: listOutput(
      "Ringover phone numbers returned by the Public API.",
      "numbers",
      "Ringover phone number objects.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_number",
    operationType: "read",
    description: "Get Ringover phone number details by E.164 number without the plus prefix.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Ringover phone number.", {
      number: nonEmptyString("The E.164 phone number without the plus prefix."),
    }),
    outputSchema: singleObjectOutput(
      "Ringover phone number details.",
      "number",
      "The Ringover phone number object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ivrs",
    operationType: "read",
    description: "List Ringover IVR configurations visible to the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Ringover IVRs.", {}),
    outputSchema: listOutput("Ringover IVRs returned by the Public API.", "ivrs", "Ringover IVR objects."),
  }),
  defineProviderAction(service, {
    name: "get_ivr",
    operationType: "read",
    description: "Get a Ringover IVR by ID.",
    requiredScopes: [],
    inputSchema: objectIdInput("Input for retrieving a Ringover IVR.", "ivrId", "The Ringover IVR ID."),
    outputSchema: singleObjectOutput(
      "Ringover IVR details.",
      "ivr",
      "The Ringover IVR object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List Ringover call tags.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Ringover call tags.", {}),
    outputSchema: listOutput("Ringover call tags returned by the Public API.", "tags", "Ringover tag objects."),
  }),
  defineProviderAction(service, {
    name: "get_tag",
    operationType: "read",
    description: "Get a Ringover call tag by ID.",
    requiredScopes: [],
    inputSchema: objectIdInput("Input for retrieving a Ringover call tag.", "tagId", "The Ringover tag ID."),
    outputSchema: singleObjectOutput(
      "Ringover call tag details.",
      "tag",
      "The Ringover tag object returned by the Public API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    operationType: "read",
    description: "List terminated Ringover calls with optional date, pagination, and call type filters.",
    requiredScopes: [],
    inputSchema: listCallsInput,
    outputSchema: listOutput(
      "Ringover terminated calls returned by the Public API.",
      "calls",
      "Ringover call log objects.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_call",
    operationType: "read",
    description: "Get Ringover call log entries for one call ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Ringover call.", {
      callId: nonEmptyString("The Ringover call ID."),
    }),
    outputSchema: listOutput(
      "Ringover call log entries returned by the Public API.",
      "calls",
      "Ringover call log objects.",
    ),
  }),
];
