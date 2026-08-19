import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "meta";

const idSchema = s.nonEmptyString("A Meta Graph API object identifier.");
const adAccountIdSchema = s.nonEmptyString("The Meta ad account ID, with or without the act_ prefix.");
const afterSchema = s.nonEmptyString("The Graph API after cursor for requesting the next page.");
const beforeSchema = s.nonEmptyString("The Graph API before cursor for requesting the previous page.");
const limitSchema = s.integer("The maximum number of records Meta should return.", {
  minimum: 1,
  maximum: 100,
});
const fieldsSchema = s.anyOf("The comma-separated Meta fields or list of fields to request.", [
  s.nonEmptyString("A comma-separated Meta fields string."),
  s.array("A list of Meta field names.", s.nonEmptyString("One Meta field name."), {
    minItems: 1,
  }),
]);
const statusSchema = s.stringEnum("A Meta configured or effective delivery status.", [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
  "IN_PROCESS",
  "WITH_ISSUES",
]);
const statusListSchema = s.array("A list of Meta delivery statuses.", statusSchema, {
  minItems: 1,
});
const insightLevelSchema = s.stringEnum("The Meta insights aggregation level.", ["account", "campaign", "adset", "ad"]);
const datePresetSchema = s.stringEnum("The Meta insights date preset.", [
  "today",
  "yesterday",
  "this_month",
  "last_month",
  "this_quarter",
  "maximum",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "last_week_mon_sun",
  "last_week_sun_sat",
  "last_quarter",
  "last_year",
  "this_week_mon_today",
  "this_week_sun_today",
  "this_year",
]);
const timeRangeSchema = s.object("The custom Meta insights date range.", {
  since: s.date("The inclusive start date in YYYY-MM-DD format."),
  until: s.date("The inclusive end date in YYYY-MM-DD format."),
});
const stringListSchema = s.array("A list of string values.", s.nonEmptyString("One string value."), {
  minItems: 1,
});
const filteringSchema = s.array(
  "Meta insights filtering expressions forwarded to the Graph API.",
  s.unknownObject("One Meta insights filtering expression."),
);
const pagingSchema = s.object("The normalized Meta Graph API paging metadata.", {
  cursors: s.object("The before and after cursor values returned by Meta.", {
    before: s.nullableString("The previous-page cursor when present."),
    after: s.nullableString("The next-page cursor when present."),
  }),
  next: s.nullable(s.url("The next page URL returned by Meta when present.")),
  previous: s.nullable(s.url("The previous page URL returned by Meta when present.")),
});

const metaUserSchema = s.object("A normalized Meta Graph API user or system user.", {
  id: idSchema,
  name: s.nullableString("The Meta profile name when returned."),
  raw: s.unknownObject("The raw Meta user object returned by the Graph API."),
});

const adAccountSchema = s.object("A normalized Meta ad account.", {
  id: idSchema,
  accountId: s.nullableString("The numeric Meta ad account ID without the act_ prefix."),
  name: s.nullableString("The ad account name."),
  currency: s.nullableString("The ad account currency code."),
  timezoneName: s.nullableString("The ad account timezone name."),
  accountStatus: s.nullableInteger("The numeric Meta ad account status."),
  businessName: s.nullableString("The business name attached to the ad account."),
  raw: s.unknownObject("The raw Meta ad account object returned by the Graph API."),
});

const campaignSchema = s.object("A normalized Meta campaign.", {
  id: idSchema,
  name: s.nullableString("The campaign name."),
  status: s.nullableString("The configured campaign status."),
  effectiveStatus: s.nullableString("The effective campaign delivery status."),
  objective: s.nullableString("The campaign objective."),
  buyingType: s.nullableString("The campaign buying type."),
  createdTime: s.nullableString("The campaign creation timestamp returned by Meta."),
  updatedTime: s.nullableString("The campaign update timestamp returned by Meta."),
  raw: s.unknownObject("The raw Meta campaign object returned by the Graph API."),
});

const insightSchema = s.object("A normalized Meta insights row.", {
  campaignId: s.nullableString("The campaign ID when returned for the selected level."),
  campaignName: s.nullableString("The campaign name when returned for the selected level."),
  adsetId: s.nullableString("The ad set ID when returned for the selected level."),
  adsetName: s.nullableString("The ad set name when returned for the selected level."),
  adId: s.nullableString("The ad ID when returned for the selected level."),
  adName: s.nullableString("The ad name when returned for the selected level."),
  impressions: s.nullableString("The impressions metric as returned by Meta."),
  clicks: s.nullableString("The clicks metric as returned by Meta."),
  spend: s.nullableString("The spend metric as returned by Meta."),
  dateStart: s.nullableString("The report start date returned by Meta."),
  dateStop: s.nullableString("The report stop date returned by Meta."),
  raw: s.unknownObject("The raw Meta insights row returned by the Graph API."),
});

const listInputBase = {
  fields: fieldsSchema,
  limit: limitSchema,
  after: afterSchema,
  before: beforeSchema,
};

const getInsightsInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for retrieving Meta insights.",
    {
      objectId: idSchema,
      level: insightLevelSchema,
      fields: fieldsSchema,
      datePreset: datePresetSchema,
      timeRange: timeRangeSchema,
      breakdowns: stringListSchema,
      filtering: filteringSchema,
      sort: stringListSchema,
      actionAttributionWindows: stringListSchema,
      limit: limitSchema,
      after: afterSchema,
      before: beforeSchema,
    },
    {
      optional: [
        "level",
        "fields",
        "datePreset",
        "timeRange",
        "breakdowns",
        "filtering",
        "sort",
        "actionAttributionWindows",
        "limit",
        "after",
        "before",
      ],
    },
  ),
  not: {
    required: ["datePreset", "timeRange"],
  },
};

export const metaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current Meta Graph API user for the connected access token.",
    inputSchema: s.object("The input payload for retrieving the current Meta user.", {}),
    outputSchema: s.object("The response returned when retrieving the current Meta user.", {
      user: metaUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_ad_accounts",
    description: "List Meta ad accounts available to the connected access token.",
    inputSchema: s.object(
      "The input payload for listing Meta ad accounts.",
      {
        ...listInputBase,
      },
      { optional: ["fields", "limit", "after", "before"] },
    ),
    outputSchema: s.object("The response returned when listing Meta ad accounts.", {
      adAccounts: s.array("The Meta ad accounts returned by the Graph API.", adAccountSchema),
      paging: pagingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List campaigns under one Meta ad account with optional delivery status filters.",
    inputSchema: s.object(
      "The input payload for listing Meta campaigns.",
      {
        adAccountId: adAccountIdSchema,
        fields: fieldsSchema,
        limit: limitSchema,
        after: afterSchema,
        before: beforeSchema,
        effectiveStatus: statusListSchema,
        configuredStatus: statusListSchema,
      },
      {
        optional: ["fields", "limit", "after", "before", "effectiveStatus", "configuredStatus"],
      },
    ),
    outputSchema: s.object("The response returned when listing Meta campaigns.", {
      campaigns: s.array("The Meta campaigns returned by the Graph API.", campaignSchema),
      paging: pagingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_insights",
    description: "Retrieve Meta Ads insights for an ad account, campaign, ad set, or ad object.",
    inputSchema: getInsightsInputSchema,
    outputSchema: s.object("The response returned when retrieving Meta insights.", {
      insights: s.array("The Meta insights rows returned by the Graph API.", insightSchema),
      paging: pagingSchema,
    }),
  }),
];
