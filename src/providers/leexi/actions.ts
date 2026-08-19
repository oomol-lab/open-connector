import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leexi";

const pageSchema = s.positiveInteger("The 1-based page number to request from Leexi.", { default: 1 });
const itemsSchema = s.integer("The number of items to request per page from Leexi.", {
  minimum: 1,
  maximum: 100,
  default: 10,
});
const timestampSchema = s.string("An ISO 8601 timestamp returned by Leexi.");
const uuidSchema = s.uuid("The Leexi UUID for this resource.");
const nullableStringSchema = s.nullable(s.string("The string value returned by Leexi."));
const nullableTimestampSchema = s.nullable(s.string("The ISO 8601 timestamp returned by Leexi."));

const paginationInputSchema = s.object(
  "Shared pagination input accepted by Leexi list endpoints.",
  {
    page: pageSchema,
    items: itemsSchema,
  },
  { optional: ["page", "items"] },
);

const paginationSchema = s.object("Pagination metadata returned by Leexi list endpoints.", {
  page: s.integer("The current page number."),
  items: s.integer("The number of items requested for the current page."),
  count: s.integer("The total number of matching items."),
});

const teamSchema = s.object("A Leexi team.", {
  uuid: uuidSchema,
  name: s.string("The team name."),
  active: s.boolean("Whether the team is active."),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  raw: s.looseObject("The raw team object returned by Leexi."),
});

const userSchema = s.object(
  "A Leexi user.",
  {
    uuid: uuidSchema,
    name: s.string("The user full name."),
    email: s.string("The user email address."),
    active: s.boolean("Whether the user is active."),
    license: nullableStringSchema,
    team: s.nullable(teamSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    raw: s.looseObject("The raw user object returned by Leexi."),
  },
  { optional: ["license", "team"] },
);

const ownerSchema = s.object(
  "A Leexi call owner or participant.",
  {
    uuid: uuidSchema,
    name: nullableStringSchema,
    email: nullableStringSchema,
    raw: s.looseObject("The raw owner object returned by Leexi."),
  },
  { optional: ["name", "email"] },
);

const conversationTypeSchema = s.object(
  "The Leexi conversation type linked to a call.",
  {
    uuid: nullableStringSchema,
    slug: nullableStringSchema,
    active: s.nullable(s.boolean("Whether the conversation type is active.")),
    raw: s.looseObject("The raw conversation type object returned by Leexi."),
  },
  { optional: ["uuid", "slug", "active"] },
);

const callSchema = s.object(
  "A normalized Leexi call or meeting summary.",
  {
    uuid: uuidSchema,
    title: nullableStringSchema,
    description: nullableStringSchema,
    source: nullableStringSchema,
    sourceId: nullableStringSchema,
    locale: nullableStringSchema,
    direction: nullableStringSchema,
    duration: s.nullable(s.number("The call duration in seconds when returned by Leexi.")),
    performedAt: nullableTimestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    isVideo: s.nullable(s.boolean("Whether the call is a video call.")),
    visible: s.nullable(s.boolean("Whether the call is visible in the workspace.")),
    leexiUrl: nullableStringSchema,
    recordingUrl: nullableStringSchema,
    transcriptUrl: nullableStringSchema,
    simpleTranscript: nullableStringSchema,
    owner: s.nullable(ownerSchema),
    participatingUsers: s.array("The participating Leexi users.", ownerSchema),
    customerPhoneNumbers: s.array(
      "The customer phone numbers attached to the call.",
      s.string("One customer phone number."),
    ),
    customerEmailAddresses: s.array(
      "The customer email addresses attached to the call.",
      s.string("One customer email address."),
    ),
    conversationType: s.nullable(conversationTypeSchema),
    raw: s.looseObject("The raw call object returned by Leexi."),
  },
  {
    optional: [
      "title",
      "description",
      "source",
      "sourceId",
      "locale",
      "direction",
      "duration",
      "performedAt",
      "isVideo",
      "visible",
      "leexiUrl",
      "recordingUrl",
      "transcriptUrl",
      "simpleTranscript",
      "owner",
      "participatingUsers",
      "customerPhoneNumbers",
      "customerEmailAddresses",
      "conversationType",
    ],
  },
);

const callNotePromptSchema = s.object(
  "The prompt linked to a Leexi call note.",
  {
    uuid: uuidSchema,
    title: nullableStringSchema,
    category: nullableStringSchema,
    raw: s.looseObject("The raw prompt object returned by Leexi."),
  },
  { optional: ["title", "category"] },
);

const callNoteTranslationSchema = s.object(
  "A translation attached to a Leexi call note.",
  {
    uuid: uuidSchema,
    locale: nullableStringSchema,
    text: nullableStringSchema,
    originalText: nullableStringSchema,
    updatedAt: nullableTimestampSchema,
    raw: s.looseObject("The raw translation object returned by Leexi."),
  },
  { optional: ["locale", "text", "originalText", "updatedAt"] },
);

const callNoteSchema = s.object(
  "A normalized Leexi call note.",
  {
    uuid: uuidSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    call: callSchema,
    prompt: s.nullable(callNotePromptSchema),
    translations: s.array("The translated note variants returned by Leexi.", callNoteTranslationSchema),
    raw: s.looseObject("The raw call note object returned by Leexi."),
  },
  { optional: ["prompt", "translations"] },
);

const callOrderSchema = s.stringEnum("The call ordering returned by the Leexi list calls endpoint.", [
  "created_at desc",
  "created_at asc",
  "performed_at desc",
  "performed_at asc",
  "updated_at desc",
  "updated_at asc",
]);

const callDateFilterSchema = s.stringEnum("The Leexi date field used by from/to filters.", [
  "created_at",
  "performed_at",
  "updated_at",
]);

export const leexiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the current Leexi workspace.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: s.object("The response returned when listing Leexi users.", {
      users: s.array("The users returned by Leexi.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List teams in the current Leexi workspace.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: s.object("The response returned when listing Leexi teams.", {
      teams: s.array("The teams returned by Leexi.", teamSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List calls and meetings in the current Leexi workspace with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Leexi calls and meetings.",
      {
        page: pageSchema,
        items: itemsSchema,
        order: callOrderSchema,
        dateFilter: callDateFilterSchema,
        from: s.string("An ISO 8601 lower bound timestamp for the selected date filter."),
        to: s.string("An ISO 8601 upper bound timestamp for the selected date filter."),
        source: s.string("The integration slug used to filter calls."),
        sourceIds: s.array(
          "The integration call ids used to filter results.",
          s.nonEmptyString("One integration call id."),
          {
            minItems: 1,
          },
        ),
        ownerUuids: s.array("The owner user UUIDs used to filter calls.", uuidSchema, {
          minItems: 1,
        }),
        participatingUserUuids: s.array("The participant user UUIDs used to filter calls.", uuidSchema, {
          minItems: 1,
        }),
        customerPhoneNumbers: s.array(
          "The customer phone numbers used to filter calls.",
          s.nonEmptyString("One customer phone number."),
          { minItems: 1 },
        ),
        customerEmailAddresses: s.array(
          "The customer email addresses used to filter calls.",
          s.nonEmptyString("One customer email address."),
          { minItems: 1 },
        ),
        withSimpleTranscript: s.boolean("Whether Leexi should include the simpleTranscript string in each call item."),
      },
      {
        optional: [
          "page",
          "items",
          "order",
          "dateFilter",
          "from",
          "to",
          "source",
          "sourceIds",
          "ownerUuids",
          "participatingUserUuids",
          "customerPhoneNumbers",
          "customerEmailAddresses",
          "withSimpleTranscript",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Leexi calls.", {
      calls: s.array("The calls returned by Leexi.", callSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve one Leexi call or meeting by UUID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one Leexi call.", {
      uuid: uuidSchema,
    }),
    outputSchema: s.object("The response returned when retrieving one Leexi call.", {
      call: callSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_call_notes",
    description: "List call notes for a Leexi call, optionally filtered by prompt UUID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Leexi call notes.",
      {
        page: pageSchema,
        items: itemsSchema,
        callUuid: uuidSchema,
        promptUuid: uuidSchema,
      },
      { optional: ["page", "items", "promptUuid"] },
    ),
    outputSchema: s.object("The response returned when listing Leexi call notes.", {
      callNotes: s.array("The call notes returned by Leexi.", callNoteSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call_note",
    description: "Retrieve one Leexi call note by UUID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one Leexi call note.", {
      uuid: uuidSchema,
    }),
    outputSchema: s.object("The response returned when retrieving one Leexi call note.", {
      callNote: callNoteSchema,
    }),
  }),
];
