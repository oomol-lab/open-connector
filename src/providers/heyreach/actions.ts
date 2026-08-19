import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "heyreach";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const positiveInteger = (description: string) => s.positiveInteger(description);
const nonNegativeInteger = (description: string) => s.nonNegativeInteger(description);

const campaignStatusSchema = s.stringEnum("A HeyReach campaign status filter.", [
  "DRAFT",
  "IN_PROGRESS",
  "PAUSED",
  "FINISHED",
  "CANCELED",
  "FAILED",
  "STARTING",
  "SCHEDULED",
]);
const listTypeSchema = s.stringEnum("The HeyReach list type.", ["USER_LIST", "COMPANY_LIST"]);

const paginationInputSchema = {
  offset: nonNegativeInteger("The number of records to skip."),
  limit: positiveInteger("The maximum number of records to return."),
};
const rawObjectSchema = s.looseObject("The raw object returned by HeyReach.");
const campaignSummarySchema = s.looseObject("A HeyReach campaign summary.", {
  id: s.integer("The HeyReach campaign ID."),
  name: s.string("The campaign name."),
  status: s.string("The campaign status."),
  creationTime: s.string("The campaign creation timestamp."),
});
const listSummarySchema = s.looseObject("A HeyReach list summary.", {
  id: s.integer("The HeyReach list ID."),
  name: s.string("The list name."),
  listType: s.string("The list type."),
  totalItemsCount: s.integer("The number of items in the list."),
  creationTime: s.string("The list creation timestamp."),
});
const leadSummarySchema = s.looseObject("A HeyReach lead summary.", {
  profileUrl: s.string("The LinkedIn profile URL for the lead."),
  firstName: s.string("The lead first name."),
  lastName: s.string("The lead last name."),
  emailAddress: s.string("The lead email address when available."),
  companyName: s.string("The lead company name when available."),
});
const linkedInAccountSchema = s.looseObject("A HeyReach LinkedIn sender account.", {
  id: s.integer("The LinkedIn sender account ID."),
  emailAddress: s.string("The sender account email address."),
  firstName: s.string("The sender first name."),
  lastName: s.string("The sender last name."),
});

function paginatedOutputSchema(
  description: string,
  itemDescription: string,
  itemSchema: JsonSchema,
  outputKey: string,
): JsonSchema {
  return s.actionOutput(
    {
      totalCount: s.nullableInteger("The total number of matching records when provided."),
      [outputKey]: s.array(itemDescription, itemSchema),
      raw: rawObjectSchema,
    },
    description,
  );
}

const statsFilterInputSchema = s.actionInput(
  {
    accountIds: s.array(
      "LinkedIn sender account IDs to include. Omit or pass an empty array to include all senders.",
      positiveInteger("A LinkedIn sender account ID."),
    ),
    campaignIds: s.array(
      "HeyReach campaign IDs to include. Omit or pass an empty array to include all campaigns.",
      positiveInteger("A HeyReach campaign ID."),
    ),
    startDate: s.dateTime("The start of the stats time range."),
    endDate: s.dateTime("The end of the stats time range."),
  },
  [],
  "Input payload for retrieving HeyReach outreach stats.",
);

export const heyreachActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List HeyReach campaigns with optional filters and pagination.",
    inputSchema: s.actionInput(
      {
        ...paginationInputSchema,
        keyword: nonEmptyString("A keyword used to filter campaigns by name."),
        statuses: s.array("Campaign statuses to include.", campaignStatusSchema, { minItems: 1 }),
        accountIds: s.array(
          "LinkedIn sender account IDs used to filter campaigns.",
          positiveInteger("A LinkedIn sender account ID."),
          { minItems: 1 },
        ),
      },
      [],
      "Input payload for listing HeyReach campaigns.",
    ),
    outputSchema: paginatedOutputSchema(
      "The response returned when listing HeyReach campaigns.",
      "The campaigns returned by HeyReach.",
      campaignSummarySchema,
      "campaigns",
    ),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Retrieve one HeyReach campaign by ID.",
    inputSchema: s.actionInput(
      { campaignId: positiveInteger("The HeyReach campaign ID.") },
      ["campaignId"],
      "Input payload for retrieving a HeyReach campaign.",
    ),
    outputSchema: s.actionOutput({ campaign: rawObjectSchema }, "The response returned when retrieving a campaign."),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List HeyReach lead and company lists with pagination.",
    inputSchema: s.actionInput(paginationInputSchema, [], "Input payload for listing HeyReach lists."),
    outputSchema: paginatedOutputSchema(
      "The response returned when listing HeyReach lists.",
      "The lists returned by HeyReach.",
      listSummarySchema,
      "lists",
    ),
  }),
  defineProviderAction(service, {
    name: "create_empty_list",
    description: "Create an empty HeyReach lead or company list.",
    inputSchema: s.actionInput(
      {
        name: nonEmptyString("The list name."),
        type: listTypeSchema,
      },
      ["name"],
      "Input payload for creating an empty HeyReach list.",
    ),
    outputSchema: s.actionOutput({ list: rawObjectSchema }, "The response returned after creating a list."),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List leads from a HeyReach list with optional filters and pagination.",
    inputSchema: s.actionInput(
      {
        listId: positiveInteger("The HeyReach list ID."),
        ...paginationInputSchema,
        keyword: nonEmptyString("A keyword used to filter leads."),
        createdFrom: s.dateTime("The earliest lead creation timestamp to include."),
        createdTo: s.dateTime("The latest lead creation timestamp to include."),
        leadLinkedInId: nonEmptyString("A LinkedIn member ID used to filter leads."),
        leadProfileUrl: s.url("A LinkedIn profile URL used to filter leads."),
      },
      ["listId"],
      "Input payload for listing HeyReach leads from a list.",
    ),
    outputSchema: paginatedOutputSchema(
      "The response returned when listing HeyReach leads.",
      "The leads returned by HeyReach.",
      leadSummarySchema,
      "leads",
    ),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Retrieve HeyReach lead details by LinkedIn profile URL.",
    inputSchema: s.actionInput(
      { profileUrl: s.url("The LinkedIn profile URL for the lead.") },
      ["profileUrl"],
      "Input payload for retrieving a HeyReach lead.",
    ),
    outputSchema: s.actionOutput({ lead: rawObjectSchema }, "The response returned when retrieving a lead."),
  }),
  defineProviderAction(service, {
    name: "get_lead_tags",
    description: "Retrieve tags for a HeyReach lead by LinkedIn profile URL.",
    inputSchema: s.actionInput(
      { profileUrl: s.url("The LinkedIn profile URL for the lead.") },
      ["profileUrl"],
      "Input payload for retrieving HeyReach lead tags.",
    ),
    outputSchema: s.actionOutput(
      {
        tags: s.array("The tags returned by HeyReach.", s.string("A lead tag.")),
        raw: rawObjectSchema,
      },
      "The response returned when retrieving HeyReach lead tags.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_linkedin_accounts",
    description: "List HeyReach LinkedIn sender accounts with pagination.",
    inputSchema: s.actionInput(paginationInputSchema, [], "Input payload for listing sender accounts."),
    outputSchema: paginatedOutputSchema(
      "The response returned when listing HeyReach LinkedIn sender accounts.",
      "The LinkedIn sender accounts returned by HeyReach.",
      linkedInAccountSchema,
      "accounts",
    ),
  }),
  defineProviderAction(service, {
    name: "get_overall_stats",
    description: "Retrieve aggregated HeyReach outreach stats for optional account and campaign filters.",
    inputSchema: statsFilterInputSchema,
    outputSchema: s.actionOutput({ stats: rawObjectSchema }, "The response returned when retrieving overall stats."),
  }),
  defineProviderAction(service, {
    name: "get_overall_stats_by_campaign",
    description: "Retrieve HeyReach outreach stats grouped by campaign.",
    inputSchema: statsFilterInputSchema,
    outputSchema: s.actionOutput(
      { stats: rawObjectSchema },
      "The response returned when retrieving stats grouped by campaign.",
    ),
  }),
];
