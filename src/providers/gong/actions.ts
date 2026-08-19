import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gong";

const gongId = (description: string) => s.nonEmptyString(description);
const cursorSchema = s.nonEmptyString("The Gong cursor value returned by the previous page response.");
const requestIdSchema = s.string("The Gong request reference ID.");
const recordsFields = {
  totalRecords: s.integer("The total number of records matching the request."),
  currentPageSize: s.integer("The number of records returned in the current page."),
  currentPageNumber: s.integer("The current page number."),
  cursor: s.string("The cursor to retrieve the next page, when Gong returned one."),
};
const recordsOptionalKeys = ["totalRecords", "currentPageSize", "currentPageNumber", "cursor"] as const;

const userSchema = s.looseObject("A Gong user object.", {
  id: gongId("Gong's unique numeric identifier for the user."),
  emailAddress: s.string("The email address of the Gong user."),
  active: s.boolean("Whether the Gong user is active."),
  firstName: s.string("The first name of the Gong user."),
  lastName: s.string("The last name of the Gong user."),
  title: s.string("The job title of the Gong user."),
});

const callSchema = s.looseObject("A Gong call object.", {
  id: gongId("Gong's unique numeric identifier for the call."),
  url: s.string("The URL to the call page in Gong."),
  title: s.string("The title of the call."),
  scheduled: s.string("The scheduled date and time of the call."),
  started: s.string("The recorded start date and time of the call."),
  duration: s.integer("The duration of the call in seconds."),
  primaryUserId: s.string("The primary user ID of the team member who hosted the call."),
});

const transcriptSentenceSchema = s.looseObject("One Gong transcript sentence.", {
  text: s.string("The transcript sentence text."),
  start: s.integer("The sentence start offset returned by Gong."),
  end: s.integer("The sentence end offset returned by Gong."),
});

const transcriptMonologueSchema = s.looseObject("One Gong transcript monologue.", {
  speakerId: s.string("The Gong speaker identifier."),
  topic: s.string("The topic assigned by Gong when available."),
  sentences: s.array("Sentences in this transcript monologue.", transcriptSentenceSchema),
});

const callTranscriptSchema = s.looseObject("One Gong call transcript entry.", {
  callId: gongId("Gong's unique numeric identifier for the call."),
  transcript: s.array("Transcript monologues for this call.", transcriptMonologueSchema),
});

const callOutcomeSchema = s.looseObject("A Gong call outcome.", {
  callOutcome: s.string("The call outcome name."),
  displayOrder: s.integer("The display order for this call outcome."),
  connectStatus: s.string("Whether the outcome is connected or not connected."),
  sentiment: s.string("The sentiment associated with this outcome."),
  category: s.string("The outcome category."),
});

const noInputSchema = s.object("No input is required for this Gong action.", {});

const listUsersInputSchema = s.object(
  "Query parameters for listing Gong users.",
  {
    cursor: cursorSchema,
    includeAvatars: s.boolean("Whether to include Gong employee avatar users in the response."),
  },
  { optional: ["cursor", "includeAvatars"] },
);

const getUserInputSchema = s.object("Path parameters for retrieving a Gong user.", {
  userId: gongId("Gong's unique numeric identifier for the user."),
});

const callDateRangeFields = {
  fromDateTime: s.dateTime("Start date-time for the call range, inclusive, in ISO 8601 format."),
  toDateTime: s.dateTime("End date-time for the call range, exclusive, in ISO 8601 format."),
};

const listCallsInputSchema = s.object(
  "Query parameters for listing Gong calls.",
  {
    ...callDateRangeFields,
    cursor: cursorSchema,
    workspaceId: gongId("Gong workspace identifier used to filter calls."),
  },
  { optional: ["cursor", "workspaceId"] },
);

const getCallInputSchema = s.object("Path parameters for retrieving a Gong call.", {
  callId: gongId("Gong's unique numeric identifier for the call."),
});

const getCallTranscriptsInputSchema = s.object(
  "Filter parameters for retrieving Gong call transcripts.",
  {
    ...callDateRangeFields,
    callIds: s.array(
      "Optional Gong call IDs to retrieve transcripts for within the date range.",
      gongId("One Gong call identifier."),
      {
        minItems: 1,
      },
    ),
    cursor: cursorSchema,
  },
  { optional: ["callIds", "cursor"] },
);

const recordsSchema = (description: string) =>
  s.object(description, recordsFields, {
    optional: recordsOptionalKeys,
    additionalProperties: true,
  });

const usersOutputSchema = s.object("Gong users response.", {
  requestId: requestIdSchema,
  records: recordsSchema("Gong users pagination metadata."),
  users: s.array("Gong users returned by the request.", userSchema),
});

const userOutputSchema = s.object("Gong user response.", {
  requestId: requestIdSchema,
  user: userSchema,
});

const callsOutputSchema = s.object("Gong calls response.", {
  requestId: requestIdSchema,
  records: recordsSchema("Gong calls pagination metadata."),
  calls: s.array("Gong calls returned by the request.", callSchema),
});

const callOutputSchema = s.object("Gong call response.", {
  requestId: requestIdSchema,
  call: callSchema,
});

const callTranscriptsOutputSchema = s.object("Gong call transcripts response.", {
  requestId: requestIdSchema,
  records: recordsSchema("Gong transcript pagination metadata."),
  callTranscripts: s.array("Gong call transcript entries returned by the request.", callTranscriptSchema),
});

const callOutcomesOutputSchema = s.object("Gong call outcomes response.", {
  requestId: requestIdSchema,
  outcomes: s.array("Gong call outcomes returned by the request.", callOutcomeSchema),
});

export const gongActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Gong users with optional cursor pagination and avatar inclusion.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Gong user by Gong user ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Gong calls that started within a specified date-time range.",
    requiredScopes: [],
    inputSchema: listCallsInputSchema,
    outputSchema: callsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Get one Gong call by Gong call ID.",
    requiredScopes: [],
    inputSchema: getCallInputSchema,
    outputSchema: callOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_call_transcripts",
    description: "Get Gong call transcript JSON for calls within a specified date-time range.",
    requiredScopes: [],
    inputSchema: getCallTranscriptsInputSchema,
    outputSchema: callTranscriptsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_call_outcomes",
    description: "List Gong call outcomes configured for the company.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: callOutcomesOutputSchema,
  }),
];
