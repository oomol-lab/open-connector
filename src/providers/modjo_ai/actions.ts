import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "modjo_ai";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });

const pageSchema = positiveInteger("Page number to request. Modjo pagination is 1-based.");
const sizeSchema = s.integer("Number of items per page. Modjo allows values from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});

const paginationInputSchema = s.object(
  "Pagination parameters for Modjo list endpoints.",
  {
    page: pageSchema,
    size: sizeSchema,
  },
  { optional: ["page", "size"] },
);

const namedListInputSchema = s.object(
  "Pagination and name filter parameters for a Modjo list endpoint.",
  {
    page: pageSchema,
    size: sizeSchema,
    name: s.nonEmptyString("Filter by exact or partial resource name."),
  },
  { optional: ["page", "size", "name"] },
);

const emailListInputSchema = s.object(
  "Pagination and email filter parameters for listing Modjo users.",
  {
    page: pageSchema,
    size: sizeSchema,
    email: s.email("Filter by exact user email address."),
  },
  { optional: ["page", "size", "email"] },
);

const numericIdInputSchema = s.object(
  "Identifier for a Modjo numeric resource.",
  {
    id: positiveInteger("The Modjo resource ID."),
  },
  { required: ["id"] },
);

const callIdInputSchema = s.object(
  "Identifier for a Modjo call.",
  {
    id: s.nonEmptyString("The Modjo call ID. Modjo accepts a positive integer ID or UUID."),
  },
  { required: ["id"] },
);

const expandSchema = s.array(
  "Relations to expand inline in a Modjo call response.",
  s.stringEnum("A Modjo call relation that can be expanded.", ["contacts", "deal", "account", "users"]),
  { minItems: 1 },
);

const callListInputSchema = s.object(
  "Pagination, expansion, and filter parameters for listing Modjo calls.",
  {
    page: pageSchema,
    size: sizeSchema,
    expand: expandSchema,
    from: s.dateTime("Filter calls starting from this ISO 8601 date-time."),
    to: s.dateTime("Filter calls ending at this ISO 8601 date-time."),
    user_id: positiveInteger("Filter calls by Modjo user ID."),
    deal_id: positiveInteger("Filter calls by Modjo deal ID."),
    account_id: positiveInteger("Filter calls by Modjo account ID."),
  },
  { optional: ["page", "size", "expand", "from", "to", "user_id", "deal_id", "account_id"] },
);

const callGetInputSchema = s.object(
  "Identifier and optional expansion parameters for retrieving a Modjo call.",
  {
    id: s.nonEmptyString("The Modjo call ID. Modjo accepts a positive integer ID or UUID."),
    expand: expandSchema,
  },
  { optional: ["expand"] },
);

const dealListInputSchema = s.object(
  "Pagination and filter parameters for listing Modjo deals.",
  {
    page: pageSchema,
    size: sizeSchema,
    name: s.nonEmptyString("Filter deals by name."),
    account_id: positiveInteger("Filter deals by Modjo account ID."),
    status: s.stringEnum("Filter deals by Modjo deal status.", [
      "Open",
      "Closed won",
      "Closed lost",
      "Closed",
      "Deleted",
    ]),
  },
  { optional: ["page", "size", "name", "account_id", "status"] },
);

const paginationSchema = s.requiredObject("Pagination metadata returned by Modjo.", {
  page: s.number("Current page number returned by Modjo."),
  size: s.number("Number of items per page returned by Modjo."),
  total: s.number("Total number of items available in Modjo."),
});

const listOutputSchema = (description: string, itemDescription: string) =>
  s.requiredObject(description, {
    data: s.array("The items returned by Modjo.", s.looseObject(itemDescription)),
    pagination: paginationSchema,
  });

const dataArrayOutputSchema = (description: string, itemDescription: string) =>
  s.requiredObject(description, {
    data: s.array("The items returned by Modjo.", s.looseObject(itemDescription)),
  });

const directObjectOutputSchema = (description: string) => s.looseObject(description);

const defineModjoAction = <const TName extends string>(input: {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}) =>
  defineProviderAction(service, {
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  });

export const modjoAiActions: readonly ActionDefinition[] = [
  defineModjoAction({
    name: "list_users",
    description: "List Modjo users with optional pagination and exact email filtering.",
    inputSchema: emailListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo users response.", "A Modjo user."),
  }),
  defineModjoAction({
    name: "get_user",
    description: "Get one Modjo user by ID.",
    inputSchema: numericIdInputSchema,
    outputSchema: directObjectOutputSchema("A Modjo user."),
  }),
  defineModjoAction({
    name: "list_teams",
    description: "List Modjo teams with optional pagination and name filtering.",
    inputSchema: namedListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo teams response.", "A Modjo team."),
  }),
  defineModjoAction({
    name: "get_team",
    description: "Get one Modjo team by ID.",
    inputSchema: numericIdInputSchema,
    outputSchema: directObjectOutputSchema("A Modjo team."),
  }),
  defineModjoAction({
    name: "list_team_members",
    description: "List Modjo users that belong to a team.",
    inputSchema: s.object(
      "Identifier and pagination parameters for listing Modjo team members.",
      {
        id: positiveInteger("The Modjo team ID."),
        page: pageSchema,
        size: sizeSchema,
      },
      { optional: ["page", "size"] },
    ),
    outputSchema: listOutputSchema("The paginated Modjo team members response.", "A Modjo team member."),
  }),
  defineModjoAction({
    name: "list_accounts",
    description: "List Modjo accounts with optional pagination and name filtering.",
    inputSchema: namedListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo accounts response.", "A Modjo account."),
  }),
  defineModjoAction({
    name: "get_account",
    description: "Get one Modjo account by ID.",
    inputSchema: numericIdInputSchema,
    outputSchema: directObjectOutputSchema("A Modjo account."),
  }),
  defineModjoAction({
    name: "list_contacts",
    description: "List Modjo contacts with optional pagination and name filtering.",
    inputSchema: namedListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo contacts response.", "A Modjo contact."),
  }),
  defineModjoAction({
    name: "get_contact",
    description: "Get one Modjo contact by ID.",
    inputSchema: numericIdInputSchema,
    outputSchema: directObjectOutputSchema("A Modjo contact."),
  }),
  defineModjoAction({
    name: "list_deals",
    description: "List Modjo deals with optional pagination and CRM filters.",
    inputSchema: dealListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo deals response.", "A Modjo deal."),
  }),
  defineModjoAction({
    name: "get_deal_summary",
    description: "Get the AI-generated summary for a Modjo deal.",
    inputSchema: numericIdInputSchema,
    outputSchema: directObjectOutputSchema("The AI-generated Modjo deal summary."),
  }),
  defineModjoAction({
    name: "list_calls",
    description: "List Modjo calls with optional pagination, relation expansion, and filters.",
    inputSchema: callListInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo calls response.", "A Modjo call."),
  }),
  defineModjoAction({
    name: "get_call",
    description: "Get one Modjo call by integer ID or UUID with optional relation expansion.",
    inputSchema: callGetInputSchema,
    outputSchema: directObjectOutputSchema("A Modjo call."),
  }),
  defineModjoAction({
    name: "get_call_transcript",
    description: "Get the transcript for a Modjo call by integer ID or UUID.",
    inputSchema: callIdInputSchema,
    outputSchema: directObjectOutputSchema("The Modjo call transcript response."),
  }),
  defineModjoAction({
    name: "list_call_notes",
    description: "List published notes for a Modjo call.",
    inputSchema: callIdInputSchema,
    outputSchema: dataArrayOutputSchema("The Modjo call notes response.", "A Modjo call note."),
  }),
  defineModjoAction({
    name: "list_call_summaries",
    description: "List AI-generated summaries for a Modjo call.",
    inputSchema: callIdInputSchema,
    outputSchema: dataArrayOutputSchema("The Modjo call summaries response.", "A Modjo call summary."),
  }),
  defineModjoAction({
    name: "get_call_next_steps",
    description: "Get AI-extracted next steps for a Modjo call.",
    inputSchema: callIdInputSchema,
    outputSchema: dataArrayOutputSchema("The Modjo call next steps response.", "A Modjo next step."),
  }),
  defineModjoAction({
    name: "list_call_tags",
    description: "List tags associated with a Modjo call.",
    inputSchema: callIdInputSchema,
    outputSchema: dataArrayOutputSchema("The Modjo call tags response.", "A Modjo call tag."),
  }),
  defineModjoAction({
    name: "list_tags",
    description: "List Modjo tags with optional pagination.",
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo tags response.", "A Modjo tag."),
  }),
  defineModjoAction({
    name: "list_topics",
    description: "List Modjo topics with optional pagination.",
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("The paginated Modjo topics response.", "A Modjo topic."),
  }),
];
