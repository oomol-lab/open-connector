import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aimfox";

const trimmedString = (description: string) => s.string({ description, minLength: 1 });
const aimfoxStatusSchema = s.nullable(s.string("The status returned by Aimfox."));
const aimfoxRawObjectSchema = s.looseObject("A raw object returned by Aimfox.");
const aimfoxRawObjectArraySchema = s.array("Raw objects returned by Aimfox.", aimfoxRawObjectSchema);
const leadFilterArraySchema = s.array(
  "Filter values for an Aimfox lead search facet.",
  trimmedString("A filter value."),
);

const leadSearchBodySchema = {
  keywords: s.string("Keywords to search for in Aimfox leads."),
  current_companies: leadFilterArraySchema,
  past_companies: leadFilterArraySchema,
  education: leadFilterArraySchema,
  interests: leadFilterArraySchema,
  labels: leadFilterArraySchema,
  languages: leadFilterArraySchema,
  locations: leadFilterArraySchema,
  origins: leadFilterArraySchema,
  skills: leadFilterArraySchema,
  lead_of: leadFilterArraySchema,
  optimize: s.boolean("Whether Aimfox should optimize the lead search."),
};

const leadSearchBodyOptionalFields = [
  "keywords",
  "current_companies",
  "past_companies",
  "education",
  "interests",
  "labels",
  "languages",
  "locations",
  "origins",
  "skills",
  "lead_of",
  "optimize",
];

export const aimfoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    operationType: "read",
    description: "List Aimfox campaigns, optionally filtering by outreach type or profile inserts.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Aimfox campaigns.",
      {
        outreach_type: s.stringEnum(["inbound", "outbound"], {
          description: "The outreach type to filter campaigns by.",
        }),
        accepts_profiles: s.boolean("Whether to return only campaigns that accept profile inserts."),
      },
      { optional: ["outreach_type", "accepts_profiles"] },
    ),
    outputSchema: s.object("The campaigns returned by Aimfox.", {
      status: aimfoxStatusSchema,
      campaigns: aimfoxRawObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Fetch one Aimfox campaign by campaign ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for fetching an Aimfox campaign.",
      {
        campaign_id: trimmedString("The Aimfox campaign ID."),
      },
      { required: ["campaign_id"] },
    ),
    outputSchema: s.object("The campaign returned by Aimfox.", {
      status: aimfoxStatusSchema,
      campaign: aimfoxRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign_metrics",
    operationType: "read",
    description: "Fetch interaction metrics for one Aimfox campaign.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for fetching Aimfox campaign metrics.",
      {
        campaign_id: trimmedString("The Aimfox campaign ID."),
      },
      { required: ["campaign_id"] },
    ),
    outputSchema: s.object("The campaign metrics returned by Aimfox.", {
      status: aimfoxStatusSchema,
      metrics: aimfoxRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_profile_to_campaign",
    operationType: "write",
    description: "Add one LinkedIn profile URL to an Aimfox campaign audience.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for adding a profile to an Aimfox campaign.",
      {
        campaign_id: trimmedString("The Aimfox campaign ID."),
        profile_url: s.url("The LinkedIn profile URL to add to the campaign audience."),
      },
      { required: ["campaign_id", "profile_url"] },
    ),
    outputSchema: s.object("The status returned after adding a profile to an Aimfox campaign.", {
      status: aimfoxStatusSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_profile_from_campaign",
    operationType: "destructive",
    description: "Remove one LinkedIn profile from an Aimfox campaign audience by URN or public ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for removing a profile from an Aimfox campaign.",
      {
        campaign_id: trimmedString("The Aimfox campaign ID."),
        urn: trimmedString("The LinkedIn profile URN or public identifier to remove."),
      },
      { required: ["campaign_id", "urn"] },
    ),
    outputSchema: s.object("The status returned after removing a profile from an Aimfox campaign.", {
      status: aimfoxStatusSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    operationType: "read",
    description: "Fetch one Aimfox lead by lead ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for fetching an Aimfox lead.",
      {
        lead_id: trimmedString("The Aimfox lead ID."),
      },
      { required: ["lead_id"] },
    ),
    outputSchema: s.object("The lead returned by Aimfox.", {
      status: aimfoxStatusSchema,
      lead: aimfoxRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_leads",
    operationType: "read",
    description: "Search Aimfox leads with documented facet filters and offset pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for searching Aimfox leads.",
      {
        ...leadSearchBodySchema,
        start: s.nonNegativeInteger("The zero-based offset for the lead search results."),
        count: s.positiveInteger("The number of lead search results to return."),
      },
      { optional: [...leadSearchBodyOptionalFields, "start", "count"] },
    ),
    outputSchema: s.object("The leads returned by Aimfox search.", {
      status: aimfoxStatusSchema,
      leads: aimfoxRawObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_total_leads_count",
    operationType: "read",
    description: "Count Aimfox leads that match the documented lead search filters.",
    requiredScopes: [],
    inputSchema: s.object("Input for counting Aimfox leads.", leadSearchBodySchema, {
      optional: leadSearchBodyOptionalFields,
    }),
    outputSchema: s.object("The total lead count returned by Aimfox.", {
      status: aimfoxStatusSchema,
      total_leads: s.nonNegativeInteger("The number of matching Aimfox leads."),
      sync: s.boolean("Whether Aimfox reports the count as synchronized."),
      accounts_sync: s.looseObject("Per-account synchronization flags returned by Aimfox."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_recent_leads",
    operationType: "read",
    description: "List recent Aimfox lead transition events for the workspace.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Aimfox recent leads.", {}),
    outputSchema: s.object("The recent lead events returned by Aimfox.", {
      status: aimfoxStatusSchema,
      leads: aimfoxRawObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_interactions",
    operationType: "read",
    description: "List Aimfox interaction buckets for a timestamp range.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Aimfox interactions.",
      {
        bucket: s.stringEnum(["1 hour", "1 day"], {
          description: "The interval used to group interaction metrics.",
        }),
        from: s.nonNegativeInteger("The range start timestamp in milliseconds."),
        to: s.nonNegativeInteger("The range end timestamp in milliseconds."),
        account_ids: s.array("Aimfox account IDs to filter interactions by.", trimmedString("An Aimfox account ID.")),
        campaign_id: trimmedString("The Aimfox campaign ID to filter interactions by."),
      },
      { optional: ["account_ids", "campaign_id"] },
    ),
    outputSchema: s.object("The interaction buckets returned by Aimfox.", {
      status: aimfoxStatusSchema,
      count: s.nonNegativeInteger("The number of interaction buckets returned by Aimfox."),
      buckets: aimfoxRawObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workspace_labels",
    operationType: "read",
    description: "List labels configured in the Aimfox workspace.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Aimfox workspace labels.", {}),
    outputSchema: s.object("The workspace labels returned by Aimfox.", {
      status: aimfoxStatusSchema,
      labels: aimfoxRawObjectArraySchema,
    }),
  }),
];
