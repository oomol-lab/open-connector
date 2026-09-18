import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "raisely";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const campaignSchema = s.looseObject("A Raisely campaign returned by the API.", {
  uuid: nonEmptyString("The campaign UUID."),
  name: s.string("The campaign name."),
  path: s.string("The campaign path."),
  mode: s.string("The campaign mode."),
  status: s.string("The campaign status."),
});
const profileSchema = s.looseObject("A Raisely fundraising profile returned by the API.", {
  uuid: nonEmptyString("The profile UUID."),
  name: s.string("The profile name."),
  path: s.string("The profile path."),
  campaignUuid: s.string("The campaign UUID associated with the profile."),
});
const webhookSchema = s.looseObject("A Raisely webhook returned by the API.", {
  uuid: nonEmptyString("The webhook UUID."),
  url: s.url("The webhook destination URL."),
  events: s.stringArray("The Raisely events delivered to the webhook."),
  campaignUuid: s.nullableString("The campaign UUID, or null for an account-wide webhook."),
});
const paginationSchema = s.looseObject("Pagination metadata returned by Raisely.", {
  total: s.nonNegativeInteger("The total number of matching records."),
  limit: s.positiveInteger("The maximum number of records in this page."),
  offset: s.nonNegativeInteger("The number of records skipped before this page."),
});

const listFields = {
  private: s.boolean("Whether Raisely should include private record fields."),
  query: nonEmptyString("A search query matched against Raisely records."),
  limit: s.positiveInteger("The maximum number of records to return."),
  offset: s.nonNegativeInteger("The number of records to skip."),
  sort: nonEmptyString("The Raisely record attribute to sort by."),
  order: s.stringEnum("The direction to sort records.", ["asc", "desc"]),
};
const listOptionalKeys = ["private", "query", "limit", "offset", "sort", "order"];

export type RaiselyActionName =
  | "list_campaigns"
  | "get_campaign"
  | "list_profiles"
  | "get_profile"
  | "list_webhooks"
  | "create_webhook"
  | "update_webhook"
  | "delete_webhook";

export const raiselyActions: ProviderActionDefinition<RaiselyActionName>[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    operationType: "read",
    description: "List Raisely campaigns with optional search, filters, sorting, and pagination.",
    inputSchema: s.object(
      "List Raisely campaigns.",
      {
        ...listFields,
        path: nonEmptyString("A campaign path to filter by."),
        mode: nonEmptyString("A campaign mode to filter by."),
        status: nonEmptyString("A campaign status to filter by."),
        pruneConfig: s.boolean("Whether to omit the large campaign config from private results."),
        includeTags: s.boolean("Whether to include tags attached to each campaign."),
      },
      { optional: [...listOptionalKeys, "path", "mode", "status", "pruneConfig", "includeTags"] },
    ),
    outputSchema: s.requiredObject("A paginated Raisely campaign collection.", {
      campaigns: s.array("The campaigns returned by Raisely.", campaignSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Fetch one Raisely campaign by UUID, path, or domain.",
    inputSchema: s.object(
      "Fetch one Raisely campaign.",
      {
        campaign: nonEmptyString("The campaign UUID, path, or domain."),
        private: s.boolean("Whether Raisely should include private campaign fields."),
        pruneConfig: s.boolean("Whether to omit the large campaign config from the result."),
        includeTags: s.boolean("Whether to include tags attached to the campaign."),
      },
      { optional: ["private", "pruneConfig", "includeTags"] },
    ),
    outputSchema: s.requiredObject("A Raisely campaign response.", {
      campaign: campaignSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_profiles",
    operationType: "read",
    description: "List fundraising profiles in a Raisely campaign.",
    inputSchema: s.object(
      "List fundraising profiles in one Raisely campaign.",
      {
        campaign: nonEmptyString("The campaign UUID, path, or domain."),
        ...listFields,
        rank: nonEmptyString("The Raisely value used to rank profiles by total raised."),
        rankDonors: nonEmptyString("The Raisely value used to rank profiles by unique donors."),
        rankActivityTotal: nonEmptyString("The Raisely value used to rank profiles by activity total."),
        rankActivityTime: nonEmptyString("The Raisely value used to rank profiles by activity time."),
      },
      { optional: [...listOptionalKeys, "rank", "rankDonors", "rankActivityTotal", "rankActivityTime"] },
    ),
    outputSchema: s.requiredObject("A paginated Raisely profile collection.", {
      profiles: s.array("The fundraising profiles returned by Raisely.", profileSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Fetch one Raisely fundraising profile by UUID or path.",
    inputSchema: s.object(
      "Fetch one Raisely fundraising profile.",
      {
        profilePath: nonEmptyString("The profile UUID or path."),
        campaign: nonEmptyString("The campaign UUID, path, or domain used for lookup context."),
        private: s.boolean("Whether Raisely should include private profile fields."),
      },
      { optional: ["campaign", "private"] },
    ),
    outputSchema: s.requiredObject("A Raisely fundraising profile response.", {
      profile: profileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    operationType: "read",
    description: "List webhooks configured for a Raisely campaign.",
    inputSchema: s.object(
      "List webhooks configured for one Raisely campaign.",
      {
        campaign: nonEmptyString("The campaign UUID, path, or domain."),
        ...listFields,
      },
      { optional: listOptionalKeys },
    ),
    outputSchema: s.requiredObject("A paginated Raisely webhook collection.", {
      webhooks: s.array("The webhooks returned by Raisely.", webhookSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    operationType: "write",
    description: "Create a Raisely webhook for account-wide or campaign-specific events.",
    inputSchema: s.object(
      "Create a Raisely webhook.",
      {
        campaignUuid: nonEmptyString("The campaign UUID to restrict events to, or omit it for account-wide events."),
        events: s.array(
          "The Raisely event names to forward to the webhook.",
          nonEmptyString("A Raisely webhook event name such as donation.created."),
        ),
        secret: s.string("The shared secret Raisely includes in webhook payloads."),
        url: nonEmptyString("The URL Raisely should send webhook events to."),
      },
      { optional: ["campaignUuid", "events", "secret", "url"] },
    ),
    outputSchema: s.requiredObject("The created Raisely webhook response.", {
      webhook: webhookSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_webhook",
    operationType: "write",
    description: "Update a Raisely webhook's events, secret, or destination URL.",
    inputSchema: s.object(
      "Update a Raisely webhook.",
      {
        webhookId: nonEmptyString("The Raisely webhook UUID."),
        private: s.boolean("Whether Raisely should include private webhook fields."),
        events: s.array(
          "The Raisely event names to forward to the webhook.",
          nonEmptyString("A Raisely webhook event name such as profile.updated."),
        ),
        secret: s.string("The shared secret Raisely includes in webhook payloads."),
        url: nonEmptyString("The URL Raisely should send webhook events to."),
      },
      { optional: ["private", "events", "secret", "url"] },
    ),
    outputSchema: s.requiredObject("The updated Raisely webhook response.", {
      webhook: webhookSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    operationType: "destructive",
    description: "Delete a Raisely webhook and return the deleted record.",
    inputSchema: s.requiredObject("Delete a Raisely webhook.", {
      webhookId: nonEmptyString("The Raisely webhook UUID."),
    }),
    outputSchema: s.requiredObject("The deleted Raisely webhook response.", {
      webhook: webhookSchema,
    }),
  }),
];
