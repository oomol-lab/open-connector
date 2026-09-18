import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "emelia";

const campaignIdSchema = s.nonEmptyString("The Emelia email campaign ID.");
const pageSchema = s.positiveInteger("The 1-based page number for pagination.");

const campaignRecordSchema = s.looseRequiredObject("An Emelia email campaign record.", {
  _id: s.string("The campaign identifier returned by Emelia."),
  id: s.string("The campaign identifier returned by Emelia when present."),
  name: s.string("The campaign name."),
  status: s.string("The campaign status."),
  createdAt: s.string("The timestamp when the campaign was created."),
  updatedAt: s.string("The timestamp when the campaign was last updated."),
});

const contactRecordSchema = s.looseRequiredObject("An Emelia campaign contact record.", {
  _id: s.string("The contact identifier returned by Emelia."),
  id: s.string("The contact identifier returned by Emelia when present."),
  email: s.email("The contact email address."),
  firstName: s.string("The contact first name."),
  lastName: s.string("The contact last name."),
  status: s.string("The contact campaign status."),
  mailsSent: s.integer("The number of emails sent to the contact."),
  interested: s.string("The contact interest status."),
});

const activityRecordSchema = s.looseRequiredObject("An Emelia campaign activity record.", {
  campaign: s.string("The campaign ID associated with the activity."),
  contact: s.string("The contact ID associated with the activity."),
  event: s.string("The activity event name."),
  stepId: s.string("The campaign step ID."),
  versionId: s.string("The campaign version ID."),
  providerId: s.string("The email provider ID."),
  customData: s.looseObject("Additional event data returned by Emelia."),
});

const emailProviderRecordSchema = s.looseRequiredObject("An Emelia email provider record.", {
  _id: s.string("The email provider identifier returned by Emelia."),
  id: s.string("The email provider identifier returned by Emelia when present."),
  emailType: s.string("The email provider type."),
  senderEmail: s.email("The configured sender email address."),
  senderName: s.string("The configured sender display name."),
  disabled: s.boolean("Whether the email provider is disabled."),
  disconnected: s.boolean("Whether the email provider is disconnected."),
});

const webhookRecordSchema = s.looseRequiredObject("An Emelia webhook record.", {
  id: s.string("The webhook identifier."),
  url: s.url("The webhook target URL."),
  events: s.array("The event names delivered to the webhook.", s.string("An event name.")),
  status: s.string("The webhook status."),
  campaignId: s.string("The campaign ID associated with the webhook."),
  campaignName: s.string("The campaign name associated with the webhook."),
  typeOfCampaign: s.string("The campaign type associated with the webhook."),
});

const listCampaignsAction = defineProviderAction(service, {
  name: "list_campaigns",
  operationType: "read",
  description: "List Emelia email campaigns, optionally filtered by page, limit, or search text.",
  inputSchema: s.object(
    "The input for listing Emelia email campaigns.",
    {
      page: pageSchema,
      limit: s.positiveInteger("The maximum number of campaigns to return."),
      search: s.string("Search text used to filter campaigns."),
    },
    { optional: ["page", "limit", "search"] },
  ),
  outputSchema: s.requiredObject("The output from listing Emelia email campaigns.", {
    campaigns: s.array("The email campaigns returned by Emelia.", campaignRecordSchema),
  }),
});

const getCampaignAction = defineProviderAction(service, {
  name: "get_campaign",
  operationType: "read",
  description: "Get details for one Emelia email campaign.",
  inputSchema: s.requiredObject("The input for getting an Emelia email campaign.", {
    campaignId: campaignIdSchema,
  }),
  outputSchema: s.requiredObject("The output from getting an Emelia email campaign.", {
    campaign: campaignRecordSchema,
  }),
});

const listCampaignContactsAction = defineProviderAction(service, {
  name: "list_campaign_contacts",
  operationType: "read",
  description: "List contacts in one Emelia email campaign.",
  inputSchema: s.object(
    "The input for listing contacts in an Emelia email campaign.",
    {
      campaignId: campaignIdSchema,
      page: pageSchema,
    },
    { optional: ["page"] },
  ),
  outputSchema: s.object(
    "The output from listing contacts in an Emelia email campaign.",
    {
      contacts: s.array("The contacts returned by Emelia.", contactRecordSchema),
      count: s.integer("The total contact count when Emelia returns one."),
    },
    { optional: ["count"] },
  ),
});

const activityTypeValues: [string, ...string[]] = [
  "SENT",
  "FIRST_OPEN",
  "OPENED",
  "CLICKED",
  "REPLIED",
  "RE_REPLY",
  "BOUNCED",
  "UNSUBSCRIBED",
];

const getCampaignActivitiesAction = defineProviderAction(service, {
  name: "get_campaign_activities",
  operationType: "read",
  description: "List activity events for one Emelia email campaign.",
  inputSchema: s.object(
    "The input for listing Emelia campaign activities.",
    {
      campaignId: campaignIdSchema,
      page: pageSchema,
      type: s.stringEnum("Filter activities by event type.", activityTypeValues),
      query: s.string("Free-text search across activities."),
      contactId: s.string("Filter activities by contact ID."),
      versionId: s.string("Filter activities by campaign version ID."),
    },
    { optional: ["page", "type", "query", "contactId", "versionId"] },
  ),
  outputSchema: s.requiredObject("The output from listing Emelia campaign activities.", {
    activities: s.array("The campaign activities returned by Emelia.", activityRecordSchema),
  }),
});

const listEmailProvidersAction = defineProviderAction(service, {
  name: "list_email_providers",
  operationType: "read",
  description: "List configured Emelia email providers for the authenticated account.",
  inputSchema: s.object("The input for listing Emelia email providers.", {}),
  outputSchema: s.requiredObject("The output from listing Emelia email providers.", {
    providers: s.array("The email providers returned by Emelia.", emailProviderRecordSchema),
  }),
});

const listWebhooksAction = defineProviderAction(service, {
  name: "list_webhooks",
  operationType: "read",
  description: "List user webhooks configured in Emelia.",
  inputSchema: s.object("The input for listing Emelia webhooks.", {}),
  outputSchema: s.requiredObject("The output from listing Emelia webhooks.", {
    webhooks: s.array("The webhooks returned by Emelia.", webhookRecordSchema),
  }),
});

export const emeliaActions: ActionDefinition[] = [
  listCampaignsAction,
  getCampaignAction,
  listCampaignContactsAction,
  getCampaignActivitiesAction,
  listEmailProvidersAction,
  listWebhooksAction,
];
