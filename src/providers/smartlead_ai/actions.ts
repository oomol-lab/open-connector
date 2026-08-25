import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smartlead_ai";

const booleanStringSchema = s.stringEnum("A boolean query value represented as a string.", ["true", "false"]);
const leadStatusSchema = s.stringEnum("The Smartlead campaign lead status.", [
  "STARTED",
  "INPROGRESS",
  "COMPLETED",
  "PAUSED",
  "STOPPED",
]);
const emailStatusSchema = s.stringEnum("The Smartlead lead email engagement status.", [
  "is_opened",
  "is_clicked",
  "is_replied",
  "is_bounced",
  "is_unsubscribed",
  "is_spam",
  "is_accepted",
  "not_replied",
  "is_sender_bounced",
]);
const emailWarmupStatusSchema = s.stringEnum("The Smartlead email warmup status filter.", ["ACTIVE", "INACTIVE"]);
const emailProviderSchema = s.stringEnum("The Smartlead email service provider filter.", ["GMAIL", "OUTLOOK", "SMTP"]);

const tagSchema = s.looseRequiredObject("A Smartlead campaign tag.", {
  tag_id: s.nullableInteger("The Smartlead tag identifier."),
  tag_name: s.nullableString("The Smartlead tag name."),
  tag_color: s.nullableString("The Smartlead tag color."),
});

const campaignSchema = s.looseRequiredObject("A Smartlead campaign.", {
  id: s.nullableInteger("The Smartlead campaign identifier."),
  name: s.nullableString("The campaign name."),
  status: s.nullableString("The campaign status returned by Smartlead."),
  created_at: s.nullableString("The datetime when the campaign was created."),
  updated_at: s.nullableString("The datetime when the campaign was last updated."),
  client_id: s.nullableInteger("The associated client identifier when present."),
  tags: s.array("The campaign tags when requested.", tagSchema),
  raw: s.looseObject("The raw campaign object returned by Smartlead."),
});

const emailAccountSchema = s.looseRequiredObject("A Smartlead email account.", {
  id: s.nullableInteger("The Smartlead email account identifier."),
  from_name: s.nullableString("The display name used for outgoing emails."),
  from_email: s.nullableString("The sending email address."),
  username: s.nullableString("The email account username."),
  type: s.nullableString("The email account type returned by Smartlead."),
  client_id: s.nullableInteger("The associated client identifier when present."),
  campaign_count: s.nullableInteger("The number of campaigns using this account."),
  is_smtp_success: s.nullableBoolean("Whether SMTP connectivity is successful."),
  warmup_details: s.nullable(s.looseObject("The warmup details returned by Smartlead.")),
  raw: s.looseObject("The raw email account object returned by Smartlead."),
});

const leadContactSchema = s.looseRequiredObject("A Smartlead lead contact.", {
  id: s.nullableInteger("The Smartlead lead identifier."),
  email: s.nullableString("The lead email address."),
  first_name: s.nullableString("The lead first name."),
  last_name: s.nullableString("The lead last name."),
  phone_number: s.nullableString("The lead phone number."),
  company_name: s.nullableString("The lead company name."),
  website: s.nullableString("The lead website."),
  location: s.nullableString("The lead location."),
  linkedin_profile: s.nullableString("The lead LinkedIn profile URL."),
  company_url: s.nullableString("The lead company URL."),
  custom_fields: s.nullable(s.looseObject("Custom fields attached to the lead.")),
  is_unsubscribed: s.nullableBoolean("Whether the lead is globally unsubscribed."),
});

const campaignLeadSchema = s.looseRequiredObject("A Smartlead lead inside a campaign.", {
  campaign_lead_map_id: s.nullableInteger("The Smartlead campaign-lead mapping identifier."),
  lead_category_id: s.nullableInteger("The Smartlead lead category identifier."),
  status: s.nullableString("The lead status in the campaign."),
  created_at: s.nullableString("The datetime when the lead was added to the campaign."),
  lead: s.nullable(leadContactSchema),
  raw: s.looseObject("The raw campaign lead object returned by Smartlead."),
});

export const smartleadAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Smartlead campaigns with optional client and tag filters.",
    inputSchema: s.object(
      "The input payload for listing Smartlead campaigns.",
      {
        client_id: s.positiveInteger("Only return campaigns for this Smartlead client identifier."),
        include_tags: s.boolean("Whether to include campaign tags in each campaign."),
      },
      { optional: ["client_id", "include_tags"] },
    ),
    outputSchema: s.object("The response returned when listing Smartlead campaigns.", {
      campaigns: s.array("The Smartlead campaigns returned by the API.", campaignSchema),
      raw: s.unknown("The raw response returned by Smartlead."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Get one Smartlead campaign by ID.",
    inputSchema: s.object(
      "The input payload for retrieving a Smartlead campaign.",
      {
        campaign_id: s.positiveInteger("The Smartlead campaign identifier."),
        include_tags: s.boolean("Whether to include campaign tags in the campaign response."),
      },
      { optional: ["include_tags"] },
    ),
    outputSchema: s.object("The response returned when retrieving a Smartlead campaign.", {
      campaign: campaignSchema,
      raw: s.unknown("The raw response returned by Smartlead."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_email_accounts",
    description: "List Smartlead email accounts with optional connection and warmup filters.",
    inputSchema: s.object(
      "The input payload for listing Smartlead email accounts.",
      {
        offset: s.nonNegativeInteger("The pagination offset."),
        limit: s.integer("The number of accounts to return, from 1 to 100.", { minimum: 1, maximum: 100 }),
        isInUse: booleanStringSchema,
        emailWarmupStatus: emailWarmupStatusSchema,
        isSmtpSuccess: booleanStringSchema,
        isWarmupBlocked: booleanStringSchema,
        esp: emailProviderSchema,
        username: s.nonEmptyString("Filter email accounts by username with partial matching."),
        client_id: s.positiveInteger("Only return email accounts for this Smartlead client."),
        fetch_campaigns: booleanStringSchema,
      },
      {
        optional: [
          "offset",
          "limit",
          "isInUse",
          "emailWarmupStatus",
          "isSmtpSuccess",
          "isWarmupBlocked",
          "esp",
          "username",
          "client_id",
          "fetch_campaigns",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Smartlead email accounts.", {
      email_accounts: s.array("The Smartlead email accounts returned by the API.", emailAccountSchema),
      raw: s.unknown("The raw response returned by Smartlead."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaign_leads",
    description: "List Smartlead leads in a campaign with optional status and engagement filters.",
    inputSchema: s.object(
      "The input payload for listing Smartlead campaign leads.",
      {
        campaign_id: s.positiveInteger("The Smartlead campaign identifier."),
        offset: s.nonNegativeInteger("The pagination offset."),
        limit: s.integer("The number of leads to return, from 1 to 100.", { minimum: 1, maximum: 100 }),
        status: leadStatusSchema,
        lead_category_id: s.positiveInteger("Only return leads in this Smartlead lead category."),
        emailStatus: emailStatusSchema,
        created_at_gt: s.dateTime("Only return leads created after this timestamp."),
        last_sent_time_gt: s.dateTime("Only return leads last sent after this timestamp."),
        event_time_gt: s.dateTime("Only return leads with events after this timestamp."),
      },
      {
        optional: [
          "offset",
          "limit",
          "status",
          "lead_category_id",
          "emailStatus",
          "created_at_gt",
          "last_sent_time_gt",
          "event_time_gt",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Smartlead campaign leads.", {
      total_leads: s.nullableInteger("The total number of matching leads when provided."),
      offset: s.nullableInteger("The offset returned by Smartlead."),
      limit: s.nullableInteger("The limit returned by Smartlead."),
      leads: s.array("The Smartlead campaign leads returned by the API.", campaignLeadSchema),
      raw: s.unknown("The raw response returned by Smartlead."),
    }),
  }),
];
