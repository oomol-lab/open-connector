import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "retell_ai";

const rawObjectSchema = s.looseObject("The raw object returned by Retell AI.");
const paginationFields = {
  limit: s.integer("Maximum number of items to return.", { minimum: 1, maximum: 1000 }),
  paginationKey: s.nonEmptyString("Pagination cursor from a previous response."),
};

const voiceSchema = s.object("A normalized Retell AI voice.", {
  voiceId: s.string("Unique id for the voice."),
  voiceName: s.string("Name of the voice."),
  provider: s.string("Provider of the voice."),
  gender: s.string("Gender of the voice."),
  accent: s.nullableString("Accent annotation of the voice when provided."),
  age: s.nullableString("Age annotation of the voice when provided."),
  previewAudioUrl: s.nullableString("URL to the preview audio when provided."),
  raw: rawObjectSchema,
});

const agentSchema = s.object("A normalized Retell AI voice agent.", {
  agentId: s.string("Unique id of the agent."),
  version: s.nullableInteger("Version of the agent."),
  agentName: s.nullableString("Name of the agent when provided."),
  voiceId: s.nullableString("Voice id used for the agent when provided."),
  isPublished: s.nullableBoolean("Whether the agent version is published when provided."),
  lastModificationTimestamp: s.nullableInteger(
    "Last modification timestamp in milliseconds since epoch when provided.",
  ),
  raw: rawObjectSchema,
});

const phoneNumberSchema = s.object("A normalized Retell AI phone number.", {
  phoneNumber: s.string("E.164 phone number used as the unique identifier."),
  phoneNumberType: s.nullableString("Type of the phone number when provided."),
  phoneNumberPretty: s.nullableString("Pretty printed phone number when provided."),
  nickname: s.nullableString("Phone number nickname when provided."),
  inboundWebhookUrl: s.nullableString("Inbound webhook URL when provided."),
  lastModificationTimestamp: s.nullableInteger(
    "Last modification timestamp in milliseconds since epoch when provided.",
  ),
  raw: rawObjectSchema,
});

const paginatedPhoneNumberSchema = s.object("A Retell AI paginated phone number response.", {
  paginationKey: s.nullableString("Pagination cursor for the next page when provided."),
  hasMore: s.boolean("Whether more results are available."),
  phoneNumbers: s.array("Phone numbers returned by Retell AI.", phoneNumberSchema),
  raw: rawObjectSchema,
});

const callSchema = s.object("A normalized Retell AI call.", {
  callId: s.string("Unique id of the call."),
  callType: s.nullableString("Call type, such as web_call or phone_call, when provided."),
  agentId: s.nullableString("Agent id associated with the call when provided."),
  agentName: s.nullableString("Agent name associated with the call when provided."),
  callStatus: s.nullableString("Current call status when provided."),
  direction: s.nullableString("Call direction for phone calls when provided."),
  fromNumber: s.nullableString("Caller number for phone calls when provided."),
  toNumber: s.nullableString("Callee number for phone calls when provided."),
  startTimestamp: s.nullableInteger("Call start timestamp in milliseconds when provided."),
  endTimestamp: s.nullableInteger("Call end timestamp in milliseconds when provided."),
  durationMs: s.nullableInteger("Call duration in milliseconds when provided."),
  raw: rawObjectSchema,
});

const paginatedCallSchema = s.object("A Retell AI paginated call response.", {
  paginationKey: s.nullableString("Pagination cursor for the next page when provided."),
  hasMore: s.boolean("Whether more results are available."),
  total: s.nullableInteger("Total number of matching calls when includeTotal was requested and provided."),
  calls: s.array("Calls returned by Retell AI.", callSchema),
  raw: rawObjectSchema,
});

export const retellAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_voices",
    description: "List all Retell AI voices available to the authenticated workspace.",
    inputSchema: s.object("The input payload for listing Retell AI voices.", {}),
    outputSchema: s.object("The response returned when listing Retell AI voices.", {
      voices: s.array("Voices returned by Retell AI.", voiceSchema),
      raw: s.array("The raw voice list returned by Retell AI.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_voice",
    description: "Retrieve details for a specific Retell AI voice.",
    inputSchema: s.object("The input payload for retrieving a Retell AI voice.", {
      voiceId: s.nonEmptyString("Unique id for the voice."),
    }),
    outputSchema: s.object("The response returned when retrieving a Retell AI voice.", {
      voice: voiceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_voice_agents",
    description: "List Retell AI voice agents with optional pagination filters.",
    inputSchema: s.object(
      "The input payload for listing Retell AI voice agents.",
      {
        ...paginationFields,
        paginationKeyVersion: s.integer(
          "Version of the agent associated with paginationKey for consistent pagination.",
          {
            minimum: 0,
          },
        ),
        isLatest: s.boolean("Whether to return only the latest version of each agent."),
      },
      { optional: ["limit", "paginationKey", "paginationKeyVersion", "isLatest"] },
    ),
    outputSchema: s.object("The response returned when listing Retell AI voice agents.", {
      agents: s.array("Voice agents returned by Retell AI.", agentSchema),
      raw: s.array("The raw voice agent list returned by Retell AI.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_voice_agent",
    description: "Retrieve details for a specific Retell AI voice agent.",
    inputSchema: s.object(
      "The input payload for retrieving a Retell AI voice agent.",
      {
        agentId: s.nonEmptyString("Unique id of the voice agent to retrieve."),
        version: s.anyOf("Agent version reference.", [
          s.integer("Numeric agent version.", { minimum: 0 }),
          s.nonEmptyString("String version reference such as latest, latest_published, or a tag."),
        ]),
      },
      { optional: ["version"] },
    ),
    outputSchema: s.object("The response returned when retrieving a Retell AI voice agent.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_phone_numbers",
    description: "List Retell AI phone numbers with cursor pagination.",
    inputSchema: s.object(
      "The input payload for listing Retell AI phone numbers.",
      {
        ...paginationFields,
        sortOrder: s.stringEnum("Sort order for phone number results.", ["ascending", "descending"]),
      },
      { optional: ["limit", "paginationKey", "sortOrder"] },
    ),
    outputSchema: paginatedPhoneNumberSchema,
  }),
  defineProviderAction(service, {
    name: "get_phone_number",
    description: "Retrieve details for a specific Retell AI phone number.",
    inputSchema: s.object("The input payload for retrieving a Retell AI phone number.", {
      phoneNumber: s.nonEmptyString("E.164 phone number to retrieve."),
    }),
    outputSchema: s.object("The response returned when retrieving a Retell AI phone number.", {
      phoneNumber: phoneNumberSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Retell AI calls with pagination and optional simple filters.",
    inputSchema: s.object(
      "The input payload for listing Retell AI calls.",
      {
        limit: s.integer("Maximum number of calls to return.", { minimum: 1, maximum: 1000 }),
        paginationKey: s.nonEmptyString("Opaque pagination cursor from a previous response."),
        skip: s.integer("Number of records to skip for pagination.", { minimum: 0 }),
        sortOrder: s.stringEnum("Sort calls by start timestamp in ascending or descending order.", [
          "ascending",
          "descending",
        ]),
        includeTotal: s.boolean("Whether Retell AI should include the matching total count."),
        agentIds: s.array("Agent ids to filter calls by.", s.nonEmptyString("One Retell AI agent id."), {
          minItems: 1,
        }),
        callIds: s.array("Call ids to filter calls by.", s.nonEmptyString("One Retell AI call id."), {
          minItems: 1,
        }),
        callStatuses: s.array(
          "Call statuses to filter calls by.",
          s.stringEnum("One Retell AI call status.", ["not_connected", "ongoing", "ended", "error"]),
          { minItems: 1 },
        ),
        callTypes: s.array(
          "Call types to filter calls by.",
          s.stringEnum("One Retell AI call type.", ["web_call", "phone_call"]),
          { minItems: 1 },
        ),
        directions: s.array(
          "Call directions to filter phone calls by.",
          s.stringEnum("One Retell AI call direction.", ["inbound", "outbound"]),
          { minItems: 1 },
        ),
      },
      {
        optional: [
          "limit",
          "paginationKey",
          "skip",
          "sortOrder",
          "includeTotal",
          "agentIds",
          "callIds",
          "callStatuses",
          "callTypes",
          "directions",
        ],
      },
    ),
    outputSchema: paginatedCallSchema,
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve details for a specific Retell AI call.",
    inputSchema: s.object("The input payload for retrieving a Retell AI call.", {
      callId: s.nonEmptyString("The call id to retrieve call history for."),
    }),
    outputSchema: s.object("The response returned when retrieving a Retell AI call.", {
      call: callSchema,
    }),
  }),
];
