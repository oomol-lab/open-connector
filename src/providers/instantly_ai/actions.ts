import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "instantly_ai";

const cursorSchema = s.string("The pagination cursor returned by Instantly.", { minLength: 1 });
const timestampSchema = s.dateTime("An ISO 8601 timestamp returned by Instantly.");
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableUuidSchema = (description: string) => s.nullable(s.uuid(description));
const nullableNumberSchema = (description: string) => s.nullable(s.number(description));
const nullableBooleanSchema = (description: string) => s.nullable(s.boolean(description));

const customVariablesSchema = s.record(
  "Custom variables for an Instantly lead. Values must be strings, numbers, booleans, or null.",
  s.anyOf("A supported custom variable value.", [
    s.string("A string custom variable value."),
    s.number("A numeric custom variable value."),
    s.boolean("A boolean custom variable value."),
    { type: "null", description: "A null custom variable value." },
  ]),
);

const campaignSummarySchema = s.looseRequiredObject(
  "A campaign returned by the Instantly API, with key fields normalized and the remaining upstream fields preserved.",
  {
    id: s.uuid("Unique identifier for the campaign."),
    name: s.string("Name of the campaign."),
    status: s.number("Campaign status enum value returned by Instantly."),
    timestamp_created: timestampSchema,
    timestamp_updated: timestampSchema,
    pl_value: nullableNumberSchema("Value of every positive lead."),
    is_evergreen: nullableBooleanSchema("Whether the campaign is evergreen."),
    daily_limit: nullableNumberSchema("The campaign daily sending limit."),
    daily_max_leads: s.nullable(s.integer("The daily maximum number of new leads to contact.", { minimum: 0 })),
    stop_on_reply: nullableBooleanSchema("Whether the campaign stops when a lead replies."),
    open_tracking: s.boolean("Whether the campaign tracks email opens."),
    link_tracking: nullableBooleanSchema("Whether the campaign tracks link clicks."),
  },
  {
    optional: [
      "pl_value",
      "is_evergreen",
      "daily_limit",
      "daily_max_leads",
      "stop_on_reply",
      "open_tracking",
      "link_tracking",
    ],
  },
);

const leadSummarySchema = s.looseRequiredObject(
  "A lead returned by the Instantly API, with key fields normalized and the remaining upstream fields preserved.",
  {
    id: s.uuid("Unique identifier for the lead."),
    timestamp_created: timestampSchema,
    timestamp_updated: timestampSchema,
    organization: s.uuid("Organization ID associated with the lead."),
    campaign: nullableUuidSchema("Campaign ID associated with the lead."),
    list_id: nullableUuidSchema("Lead list ID associated with the lead."),
    status: s.number("Lead status enum value returned by Instantly."),
    email: nullableStringSchema("Email address of the lead."),
    first_name: nullableStringSchema("First name of the lead."),
    last_name: nullableStringSchema("Last name of the lead."),
    company_name: nullableStringSchema("Company name of the lead."),
    job_title: nullableStringSchema("Job title of the lead."),
    website: nullableStringSchema("Website of the lead."),
    phone: nullableStringSchema("Phone number of the lead."),
    personalization: nullableStringSchema("Personalization text for the lead."),
    email_open_count: s.number("Number of times the lead opened campaign emails."),
    email_reply_count: s.number("Number of times the lead replied to campaign emails."),
    email_click_count: s.number("Number of times the lead clicked campaign links."),
    company_domain: s.string("Company domain of the lead."),
    payload: s.nullable(s.record("Custom variables returned in the lead payload.", s.unknown("A payload value."))),
    lt_interest_status: s.number("Lead interest status enum value returned by Instantly."),
    verification_status: s.number("Lead verification status enum value returned by Instantly."),
    enrichment_status: s.number("Lead enrichment status enum value returned by Instantly."),
    assigned_to: nullableUuidSchema("ID of the user assigned to the lead."),
  },
  {
    optional: [
      "campaign",
      "list_id",
      "email",
      "first_name",
      "last_name",
      "company_name",
      "job_title",
      "website",
      "phone",
      "personalization",
      "payload",
      "lt_interest_status",
      "verification_status",
      "enrichment_status",
      "assigned_to",
    ],
  },
);

const paginatedCampaignOutputSchema = s.object(
  "A page of Instantly campaigns.",
  {
    items: s.array("Campaigns returned for the requested page.", campaignSummarySchema),
    next_starting_after: cursorSchema,
  },
  { optional: ["next_starting_after"] },
);

const paginatedLeadOutputSchema = s.object(
  "A page of Instantly leads.",
  {
    items: s.array("Leads returned for the requested page.", leadSummarySchema),
    next_starting_after: cursorSchema,
  },
  { optional: ["next_starting_after"] },
);

const listCampaignsInputSchema = s.object(
  "Input parameters for listing Instantly campaigns.",
  {
    limit: s.integer("The number of campaigns to return, from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    starting_after: cursorSchema,
    search: s.string("Search campaigns by name.", { minLength: 1 }),
    tag_ids: s.array(
      "Campaign tag IDs to filter by. Instantly receives these as a comma-separated query value.",
      s.uuid("A campaign tag ID."),
      { minItems: 1 },
    ),
    ai_sales_agent_id: s.uuid("Filter campaigns by AI Sales Agent ID."),
    status: s.number("Filter campaigns by Instantly campaign status enum value."),
  },
  { optional: ["limit", "starting_after", "search", "tag_ids", "ai_sales_agent_id", "status"] },
);

const getCampaignInputSchema = s.object("Input parameters for retrieving an Instantly campaign.", {
  id: s.uuid("The Instantly campaign ID."),
});

const listLeadsInputSchema = s.object(
  "Input parameters for listing Instantly leads.",
  {
    search: s.string("Search leads by first name, last name, or email.", { minLength: 1 }),
    filter: s.string("Instantly lead filter value, such as FILTER_VAL_CONTACTED.", { minLength: 1 }),
    campaign: s.uuid("Campaign ID to filter leads."),
    list_id: s.uuid("Lead list ID to filter leads."),
    in_campaign: s.boolean("Whether to return leads that are in a campaign."),
    in_list: s.boolean("Whether to return leads that are in a lead list."),
    ids: s.array("Lead IDs to include.", s.uuid("A lead ID."), { minItems: 1 }),
    excluded_ids: s.array("Lead IDs to exclude.", s.uuid("A lead ID to exclude."), { minItems: 1 }),
    contacts: s.array("Lead email addresses to include.", s.email("A lead email address."), { minItems: 1 }),
    limit: s.integer("The number of leads to return, from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    starting_after: cursorSchema,
    organization_user_ids: s.array("Organization user IDs to filter leads.", s.uuid("An organization user ID."), {
      minItems: 1,
    }),
    smart_view_id: s.uuid("Smart view ID to filter leads."),
    is_website_visitor: s.boolean("Whether to return website visitor leads."),
    distinct_contacts: s.boolean("Whether to return distinct contacts."),
    enrichment_status: s.number("Enrichment status enum value to filter leads."),
    esg_code: s.stringEnum("ESG code to filter leads.", ["0", "1", "2", "3", "4", "all", "none"]),
  },
  {
    optional: [
      "search",
      "filter",
      "campaign",
      "list_id",
      "in_campaign",
      "in_list",
      "ids",
      "excluded_ids",
      "contacts",
      "limit",
      "starting_after",
      "organization_user_ids",
      "smart_view_id",
      "is_website_visitor",
      "distinct_contacts",
      "enrichment_status",
      "esg_code",
    ],
  },
);

const createLeadInputSchema = s.object(
  "Input parameters for creating an Instantly lead. Provide campaign or list_id. When campaign is provided, email is required. When list_id is provided without email, first_name or last_name is required.",
  {
    campaign: nullableUuidSchema("Campaign ID associated with the lead."),
    list_id: nullableUuidSchema("Lead list ID associated with the lead."),
    email: nullableStringSchema("Email address of the lead."),
    personalization: nullableStringSchema("Personalization text for the lead."),
    website: nullableStringSchema("Website of the lead."),
    last_name: nullableStringSchema("Last name of the lead."),
    first_name: nullableStringSchema("First name of the lead."),
    company_name: nullableStringSchema("Company name of the lead."),
    job_title: nullableStringSchema("Job title of the lead."),
    phone: nullableStringSchema("Phone number of the lead."),
    lt_interest_status: s.number("Lead interest status enum value."),
    pl_value_lead: nullableStringSchema("Potential value of the lead."),
    assigned_to: nullableUuidSchema("ID of the user assigned to the lead."),
    skip_if_in_workspace: s.boolean("Whether to skip creation if the lead is already in the workspace."),
    skip_if_in_campaign: s.boolean("Whether to skip creation if the lead is already in the campaign."),
    skip_if_in_list: s.boolean("Whether to skip creation if the lead is already in the list."),
    blocklist_id: s.uuid("The blocklist ID to check for the lead."),
    verify_leads_for_lead_finder: s.boolean("Whether to verify the lead for lead finder."),
    verify_leads_on_import: s.boolean("Whether to verify the lead on import."),
    custom_variables: customVariablesSchema,
  },
  {
    optional: [
      "campaign",
      "list_id",
      "email",
      "personalization",
      "website",
      "last_name",
      "first_name",
      "company_name",
      "job_title",
      "phone",
      "lt_interest_status",
      "pl_value_lead",
      "assigned_to",
      "skip_if_in_workspace",
      "skip_if_in_campaign",
      "skip_if_in_list",
      "blocklist_id",
      "verify_leads_for_lead_finder",
      "verify_leads_on_import",
      "custom_variables",
    ],
  },
);

export const instantlyAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Instantly campaigns with optional search, tag, and status filters.",
    requiredScopes: ["campaigns:read"],
    inputSchema: listCampaignsInputSchema,
    outputSchema: paginatedCampaignOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Retrieve one Instantly campaign by ID.",
    requiredScopes: ["campaigns:read"],
    inputSchema: getCampaignInputSchema,
    outputSchema: campaignSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List Instantly leads using JSON filters and cursor pagination.",
    requiredScopes: ["leads:read"],
    inputSchema: listLeadsInputSchema,
    outputSchema: paginatedLeadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_lead",
    description: "Create a lead in an Instantly campaign or lead list.",
    requiredScopes: ["leads:create"],
    inputSchema: createLeadInputSchema,
    outputSchema: leadSummarySchema,
  }),
];
