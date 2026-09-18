import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "attention";

const crmEntityCodes = [
  "companies",
  "contacts",
  "deals",
  "owners",
  "pipelines",
  "users",
  "account",
  "contact",
  "lead",
  "opportunity",
  "user",
];

const nonEmptyStringSchema = (description: string) => s.nonEmptyString(description);
const stringListSchema = (description: string, itemDescription: string) =>
  s.array(description, nonEmptyStringSchema(itemDescription), { minItems: 1 });
const emailListSchema = (description: string) =>
  s.array(description, s.email("An email address to include in the filter."), { minItems: 1 });

const linksSchema = s.looseObject("Pagination links returned by Attention.");
const metaSchema = s.looseObject("Pagination metadata returned by Attention.");

const conversationSchema = s.looseRequiredObject(
  "A conversation object returned by Attention.",
  {
    type: s.string("The JSON:API resource type returned by Attention."),
    id: s.string("Unique identifier of the conversation."),
    attributes: s.looseObject("Conversation attributes, including transcript and metadata."),
    links: linksSchema,
  },
  { optional: ["attributes", "links"] },
);

const userSchema = s.looseRequiredObject(
  "A user object returned by Attention.",
  {
    uuid: s.string("Unique identifier of the user."),
    email: s.email("Email address of the user."),
    firstName: s.string("First name of the user."),
    lastName: s.string("Last name of the user."),
  },
  { optional: ["email", "firstName", "lastName"] },
);

const teamSchema = s.looseRequiredObject(
  "A team object returned by Attention.",
  {
    uuid: s.string("Unique identifier of the team."),
    name: s.string("Name of the team."),
    domain: s.string("Domain associated with the team."),
  },
  { optional: ["name", "domain"] },
);

const answerSegmentSchema = s.looseRequiredObject(
  "A timestamped transcript segment returned by Attention.",
  {
    start_sec: s.number("Start time of the segment in seconds."),
    end_sec: s.number("End time of the segment in seconds."),
    text: s.string("Transcript excerpt for the segment."),
  },
  { optional: ["start_sec", "end_sec", "text"] },
);

const attentionAnswerSchema = s.looseRequiredObject(
  "An Ask Attention answer returned for a conversation or summary.",
  {
    conversation_id: s.string("Conversation identifier for this answer, or summary for combined answers."),
    output: s.string("Textual answer produced by Attention."),
    error: s.string("Error message returned for this answer, or an empty string."),
    segments: s.array("Timestamped segments relevant to the answer.", answerSegmentSchema),
    title: s.string("Conversation title associated with the answer."),
  },
  { optional: ["segments", "title"] },
);

const askAttentionCommonSchema = {
  prompt: nonEmptyStringSchema("Natural-language question or instruction for Attention."),
  includeTimestamps: s.boolean("Whether to include timestamped transcript segments."),
  summarize: s.boolean("Whether to append a combined summary answer."),
};

const listConversationsInputSchema = s.object(
  "Input parameters for listing Attention conversations.",
  {
    fromDateTime: s.dateTime("Start date and time for filtering conversations."),
    toDateTime: s.dateTime("End date and time for filtering conversations."),
    page: s.integer("Page number for pagination, starting from 1.", { minimum: 1 }),
    size: s.integer("Number of conversations to return, from 1 to 50.", {
      minimum: 1,
      maximum: 50,
    }),
    ownerIds: stringListSchema("Owner user IDs to filter conversations.", "An owner user ID."),
    ownerEmails: emailListSchema("Owner email addresses to filter conversations."),
    title: nonEmptyStringSchema("Case-insensitive partial title filter."),
    participantEmails: emailListSchema("Participant email addresses to filter conversations."),
    externalOpportunityIds: stringListSchema(
      "External opportunity IDs to filter conversations.",
      "An external opportunity ID.",
    ),
    crmFieldEntityCode: s.stringEnum("CRM platform entity code to filter linked CRM records.", crmEntityCodes),
    crmFieldFieldName: nonEmptyStringSchema("CRM record field name to match on linked records."),
    crmFieldValues: s.array(
      "Exact CRM field values to match, up to 10 entries.",
      nonEmptyStringSchema("A CRM field value."),
      { minItems: 1, maxItems: 10 },
    ),
    teamIds: stringListSchema("Team IDs to filter conversations.", "A team ID."),
    hideInternal: s.boolean("Whether to exclude internal conversations from results."),
    hideNonAnalyzed: s.boolean("Whether to exclude conversations that have not been analyzed."),
    hidePending: s.boolean("Whether to exclude conversations pending processing."),
    hideTranscript: s.boolean("Whether to exclude conversations without transcripts."),
    hideFailed: s.boolean("Whether to exclude conversations that failed processing."),
    includeInternalParticipants: s.boolean("Whether to include internal participants in the response."),
    includeZoomMetadata: s.boolean("Whether to include Zoom metadata in the response."),
    includeImportMetadata: s.boolean("Whether to include import metadata in the response."),
    detailedTranscript: s.boolean("Whether to include detailed transcript information."),
    withCrmRecords: s.boolean("Whether to include CRM records and re-enable extracted intelligence fields."),
    withIntelligenceItems: s.boolean("Whether to include intelligence items in the response."),
  },
  {
    optional: [
      "fromDateTime",
      "toDateTime",
      "page",
      "size",
      "ownerIds",
      "ownerEmails",
      "title",
      "participantEmails",
      "externalOpportunityIds",
      "crmFieldEntityCode",
      "crmFieldFieldName",
      "crmFieldValues",
      "teamIds",
      "hideInternal",
      "hideNonAnalyzed",
      "hidePending",
      "hideTranscript",
      "hideFailed",
      "includeInternalParticipants",
      "includeZoomMetadata",
      "includeImportMetadata",
      "detailedTranscript",
      "withCrmRecords",
      "withIntelligenceItems",
    ],
  },
);

const getConversationInputSchema = s.object(
  "Input parameters for retrieving a single Attention conversation.",
  {
    id: nonEmptyStringSchema("Unique identifier of the conversation to retrieve."),
    by: s.stringEnum("How to look up the conversation ID.", ["id", "external_id"]),
    includeInternalParticipants: s.boolean("Whether to include internal participants in the response."),
    includeZoomMetadata: s.boolean("Whether to include Zoom metadata in the response."),
    includeImportMetadata: s.boolean("Whether to include import metadata in the response."),
    detailedTranscript: s.boolean("Whether to include detailed transcript information."),
  },
  {
    optional: [
      "by",
      "includeInternalParticipants",
      "includeZoomMetadata",
      "includeImportMetadata",
      "detailedTranscript",
    ],
  },
);

const listUsersInputSchema = s.object(
  "Input parameters for listing Attention users.",
  {
    ids: stringListSchema("User IDs to include.", "A user ID."),
    emails: emailListSchema("User email addresses to include."),
    teamUUID: nonEmptyStringSchema("Team UUID to filter users."),
    includeDeleted: s.boolean("Whether to include deleted users."),
  },
  { optional: ["ids", "emails", "teamUUID", "includeDeleted"] },
);

const askAttentionInputSchema = s.oneOf(
  [
    s.object(
      {
        ...askAttentionCommonSchema,
        conversationIds: s.array(
          "Conversation IDs to analyze. Use this instead of dealId.",
          s.string("A conversation ID.", { minLength: 1, maxLength: 50 }),
          { minItems: 1 },
        ),
      },
      { required: ["conversationIds", "prompt"], optional: ["includeTimestamps", "summarize"] },
    ),
    s.object(
      {
        ...askAttentionCommonSchema,
        dealId: nonEmptyStringSchema("Deal UUID to analyze. Use this instead of conversationIds."),
      },
      { required: ["dealId", "prompt"], optional: ["includeTimestamps", "summarize"] },
    ),
  ],
  { description: "Input parameters for asking Attention to analyze conversations or a deal." },
);

const listConversationsOutputSchema = s.object(
  "A page of Attention conversations.",
  {
    conversations: s.array("Conversations returned for the requested page.", conversationSchema),
    links: linksSchema,
    meta: metaSchema,
  },
  { optional: ["links", "meta"] },
);

const getConversationOutputSchema = s.object("An Attention conversation result.", {
  conversation: conversationSchema,
});

const listUsersOutputSchema = s.object(
  "A list of Attention users.",
  {
    users: s.array("Users returned by Attention.", userSchema),
    links: linksSchema,
  },
  { optional: ["links"] },
);

const listTeamsOutputSchema = s.object(
  "A list of Attention teams.",
  {
    teams: s.array("Teams returned by Attention.", teamSchema),
    meta: metaSchema,
  },
  { optional: ["meta"] },
);

const askAttentionOutputSchema = s.object("Answers returned by Attention.", {
  answers: s.array("Answers returned for the requested prompt.", attentionAnswerSchema),
});

export const attentionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_conversations",
    operationType: "read",
    description:
      "Retrieve a paginated list of Attention conversations with optional owner, participant, team, CRM, and status filters.",
    inputSchema: listConversationsInputSchema,
    outputSchema: listConversationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    operationType: "read",
    description: "Retrieve one Attention conversation by internal conversation ID or external import ID.",
    inputSchema: getConversationInputSchema,
    outputSchema: getConversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Attention users with optional user ID, email, team, and deleted-user filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    description: "List teams in the Attention organization.",
    inputSchema: s.object("Input parameters for listing Attention teams.", {}),
    outputSchema: listTeamsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ask_attention",
    operationType: "write",
    description: "Ask Attention to analyze selected conversations or a deal using a natural-language prompt.",
    inputSchema: askAttentionInputSchema,
    outputSchema: askAttentionOutputSchema,
  }),
];
