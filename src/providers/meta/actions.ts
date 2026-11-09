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
  "data_maximum",
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
const timeRangeSchema = s.object(
  "The custom Meta insights date range.",
  {
    since: s.date("The inclusive start date in YYYY-MM-DD format."),
    until: s.date("The inclusive end date in YYYY-MM-DD format."),
  },
  { optional: [] },
);

const stringListSchema = s.array("A list of string values.", s.nonEmptyString("One string value."), {
  minItems: 1,
});
const filteringSchema = s.array(
  "Meta insights filtering expressions forwarded to the Graph API.",
  s.looseObject("One Meta insights filtering expression."),
);

const pagingSchema = s.object(
  "The normalized Meta Graph API paging metadata.",
  {
    cursors: s.object(
      "The before and after cursor values returned by Meta.",
      {
        before: s.nullable(s.string("The previous-page cursor when present.")),
        after: s.nullable(s.string("The next-page cursor when present.")),
      },
      { optional: [] },
    ),
    next: s.nullable(s.url("The next page URL returned by Meta when present.")),
    previous: s.nullable(s.url("The previous page URL returned by Meta when present.")),
  },
  { optional: [] },
);

const metaUserSchema = s.object(
  "A normalized Meta Graph API user or system user.",
  {
    id: idSchema,
    name: s.nullable(s.string("The Meta profile name when returned.")),
    raw: s.looseObject("The raw Meta user object returned by the Graph API."),
  },
  { optional: [] },
);

const adAccountSchema = s.object(
  "A normalized Meta ad account.",
  {
    id: idSchema,
    accountId: s.nullable(s.string("The numeric Meta ad account ID without the act_ prefix.")),
    name: s.nullable(s.string("The ad account name.")),
    currency: s.nullable(s.string("The ad account currency code.")),
    timezoneName: s.nullable(s.string("The ad account timezone name.")),
    accountStatus: s.nullable(s.integer("The numeric Meta ad account status.")),
    businessName: s.nullable(s.string("The business name attached to the ad account.")),
    raw: s.looseObject("The raw Meta ad account object returned by the Graph API."),
  },
  { optional: [] },
);

const campaignSchema = s.object(
  "A normalized Meta campaign.",
  {
    id: idSchema,
    name: s.nullable(s.string("The campaign name.")),
    status: s.nullable(s.string("The configured campaign status.")),
    effectiveStatus: s.nullable(s.string("The effective campaign delivery status.")),
    objective: s.nullable(s.string("The campaign objective.")),
    buyingType: s.nullable(s.string("The campaign buying type.")),
    createdTime: s.nullable(s.string("The campaign creation timestamp returned by Meta.")),
    updatedTime: s.nullable(s.string("The campaign update timestamp returned by Meta.")),
    raw: s.looseObject("The raw Meta campaign object returned by the Graph API."),
  },
  { optional: [] },
);

const insightSchema = s.object(
  "A normalized Meta insights row.",
  {
    campaignId: s.nullable(s.string("The campaign ID when returned for the selected level.")),
    campaignName: s.nullable(s.string("The campaign name when returned for the selected level.")),
    adsetId: s.nullable(s.string("The ad set ID when returned for the selected level.")),
    adsetName: s.nullable(s.string("The ad set name when returned for the selected level.")),
    adId: s.nullable(s.string("The ad ID when returned for the selected level.")),
    adName: s.nullable(s.string("The ad name when returned for the selected level.")),
    impressions: s.nullable(s.string("The impressions metric as returned by Meta.")),
    clicks: s.nullable(s.string("The clicks metric as returned by Meta.")),
    spend: s.nullable(s.string("The spend metric as returned by Meta.")),
    dateStart: s.nullable(s.string("The report start date returned by Meta.")),
    dateStop: s.nullable(s.string("The report stop date returned by Meta.")),
    raw: s.looseObject("The raw Meta insights row returned by the Graph API."),
  },
  { optional: [] },
);

const listInputBase = {
  fields: fieldsSchema,
  limit: limitSchema,
  after: afterSchema,
  before: beforeSchema,
};
const getInsightsInputSchema = s.object(
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
    actionBreakdowns: stringListSchema,
    timeIncrement: s.anyOf("The report time interval: all_days, monthly, or a number of days from 1 to 90.", [
      s.stringEnum("A named report interval.", ["all_days", "monthly"]),
      s.integer("The number of days per report interval.", { minimum: 1, maximum: 90 }),
    ]),
    timeRanges: s.array(
      "Multiple report date ranges. Takes precedence over datePreset, timeRange, and timeIncrement.",
      timeRangeSchema,
      { minItems: 1 },
    ),
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
      "actionBreakdowns",
      "timeIncrement",
      "timeRanges",
      "limit",
      "after",
      "before",
    ],
  },
);

const rawSchema = s.looseObject("The upstream object with credential fields removed.");

const entitySchema = s.object(
  "An advertising object.",
  {
    id: idSchema,
    name: s.nullable(s.string("The object name.")),
    raw: rawSchema,
  },
  { optional: [] },
);

const pageSchema = s.object(
  "A Facebook Page.",
  {
    id: idSchema,
    name: s.nullable(s.string("The Page name.")),
    raw: rawSchema,
  },
  { optional: [] },
);

const postSchema = s.object(
  "A Facebook Page post.",
  {
    id: idSchema,
    message: s.nullable(s.string("The post text.")),
    permalinkUrl: s.nullable(s.string("The permanent URL of the post.")),
    createdTime: s.nullable(s.string("The post creation time.")),
    raw: rawSchema,
  },
  { optional: [] },
);

const pageIdSchema = s.nonEmptyString("The Facebook Page ID. The connector resolves its Page access token internally.");
const postIdSchema = s.nonEmptyString("The Facebook Page post ID, normally pageId_postId.");

const additionalParametersSchema = s.looseObject(
  "Additional documented Graph API parameters using upstream names. Cannot override authentication, routing, or explicitly supplied fields.",
);

const postWriteFields = {
  message: s.string("The post text; an empty string can clear text when updating."),
  link: s.url("The link to attach to a new post."),
  published: s.boolean(
    "Whether to publish immediately. Defaults to false when scheduledPublishTime is supplied, otherwise true.",
  ),
  scheduledPublishTime: s.integer(
    "The scheduled publication time as Unix seconds. Meta validates the permitted scheduling window.",
  ),
  attachedMedia: s.array(
    "Previously uploaded photo attachments.",
    s.object("A photo attachment.", { mediaFbid: s.nonEmptyString("The uploaded photo ID.") }, { optional: [] }),
  ),
  targeting: s.looseObject("Audience restrictions using Meta targeting fields."),
  feedTargeting: s.looseObject("Feed targeting using Meta targeting fields."),
  additionalParameters: additionalParametersSchema,
};

function postWriteInput(update: boolean) {
  let fields: Record<string, JsonSchema> = postWriteFields;
  const identifiers: Record<string, JsonSchema> = { pageId: pageIdSchema };
  if (update) {
    identifiers.postId = postIdSchema;
    fields = {
      message: postWriteFields.message,
      published: s.boolean(
        "Whether the existing post should be published. Sent as is_published; omitted updates leave publication unchanged.",
      ),
      scheduledPublishTime: postWriteFields.scheduledPublishTime,
      attachedMedia: postWriteFields.attachedMedia,
      additionalParameters: additionalParametersSchema,
    };
  }
  return s.object(
    "The Page post write parameters.",
    { ...identifiers, ...fields },
    {
      optional: Object.keys(fields),
    },
  );
}

function advertisingListInput(name: string) {
  const filters: Record<string, JsonSchema> = {};
  if (name !== "list_ad_creatives") {
    filters.effectiveStatus = s.array(
      "Filter by effective delivery statuses supported by Meta.",
      s.nonEmptyString("A Meta effective delivery status."),
    );
    filters.datePreset = datePresetSchema;
    filters.timeRange = timeRangeSchema;
    filters.updatedSince = s.integer("Only objects updated since this Unix timestamp.");
  }
  if (name === "list_ad_sets") {
    filters.isCompleted = s.boolean("Filter ad sets by completion status.");
  }
  return s.object(
    "The advertising list query.",
    { adAccountId: adAccountIdSchema, ...listInputBase, ...filters },
    { optional: [...Object.keys(listInputBase), ...Object.keys(filters)] },
  );
}

const successSchema = s.object(
  "The mutation result.",
  {
    success: s.boolean("Whether Meta completed the operation."),
  },
  { optional: [] },
);

export const metaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the current Meta Graph API user for the connected access token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the current Meta user.", {}, { optional: [] }),
    outputSchema: s.object(
      "The response returned when retrieving the current Meta user.",
      {
        user: metaUserSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_ad_accounts",
    providerPermissions: ["ads_read"],
    operationType: "read",
    description: "List Meta ad accounts available to the connected access token.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Meta ad accounts.",
      {
        ...listInputBase,
      },
      { optional: ["fields", "limit", "after", "before"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Meta ad accounts.",
      {
        adAccounts: s.array("The Meta ad accounts returned by the Graph API.", adAccountSchema),
        paging: pagingSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    providerPermissions: ["ads_read"],
    operationType: "read",
    description: "List campaigns under one Meta ad account with optional delivery status filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Meta campaigns.",
      {
        adAccountId: adAccountIdSchema,
        fields: fieldsSchema,
        limit: limitSchema,
        after: afterSchema,
        before: beforeSchema,
        effectiveStatus: statusListSchema,
        isCompleted: s.boolean("Filter campaigns by completion status."),
        datePreset: datePresetSchema,
        timeRange: timeRangeSchema,
      },
      {
        optional: ["fields", "limit", "after", "before", "effectiveStatus", "isCompleted", "datePreset", "timeRange"],
      },
    ),
    outputSchema: s.object(
      "The response returned when listing Meta campaigns.",
      {
        campaigns: s.array("The Meta campaigns returned by the Graph API.", campaignSchema),
        paging: pagingSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_insights",
    providerPermissions: ["ads_read"],
    operationType: "read",
    description: "Retrieve Meta Ads insights for an ad account, campaign, ad set, or ad object.",
    requiredScopes: [],
    inputSchema: getInsightsInputSchema,
    outputSchema: s.object(
      "The response returned when retrieving Meta insights.",
      {
        insights: s.array("The Meta insights rows returned by the Graph API.", insightSchema),
        paging: pagingSchema,
      },
      { optional: [] },
    ),
  }),
  ...[
    {
      name: "get_ad_account",
      idField: "adAccountId",
      outputField: "adAccount",
      schema: adAccountSchema,
      description: "Retrieve one Meta ad account.",
    },
    {
      name: "get_campaign",
      idField: "campaignId",
      outputField: "campaign",
      schema: campaignSchema,
      description: "Retrieve one Meta advertising campaign.",
    },
    {
      name: "get_ad_set",
      idField: "adSetId",
      outputField: "adSet",
      schema: entitySchema,
      description: "Retrieve one Meta ad set including budget, targeting, and delivery settings.",
    },
    {
      name: "get_ad",
      idField: "adId",
      outputField: "ad",
      schema: entitySchema,
      description: "Retrieve one Meta ad and its creative reference.",
    },
    {
      name: "get_ad_creative",
      idField: "creativeId",
      outputField: "creative",
      schema: entitySchema,
      description: "Retrieve one Meta ad creative.",
    },
  ].map(({ name, idField, outputField, schema, description }) =>
    defineProviderAction(service, {
      name,
      description,
      operationType: "read",
      requiredScopes: [],
      providerPermissions: ["ads_read"],
      inputSchema: s.object(
        "The advertising object query.",
        { [idField]: idSchema, fields: fieldsSchema },
        { optional: ["fields"] },
      ),
      outputSchema: s.object("The advertising object response.", { [outputField]: schema }, { optional: [] }),
    }),
  ),
  ...[
    {
      name: "list_ad_sets",
      outputField: "adSets",
      description: "List Meta ad sets under an ad account.",
    },
    {
      name: "list_ads",
      outputField: "ads",
      description: "List Meta ads under an ad account.",
    },
    {
      name: "list_ad_creatives",
      outputField: "creatives",
      description: "List Meta ad creatives under an ad account.",
    },
  ].map(({ name, outputField, description }) =>
    defineProviderAction(service, {
      name,
      description,
      operationType: "read",
      requiredScopes: [],
      providerPermissions: ["ads_read"],
      inputSchema: advertisingListInput(name),
      outputSchema: s.object(
        "The advertising list response.",
        {
          [outputField]: s.array("The advertising objects.", entitySchema),
          paging: pagingSchema,
        },
        { optional: [] },
      ),
    }),
  ),
  defineProviderAction(service, {
    name: "create_insights_report",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["ads_read"],
    description:
      "Start an asynchronous Meta Ads insights report. Use get_insights_report to poll and retrieve its first result page; report handles expire after 30 days.",
    inputSchema: getInsightsInputSchema,
    outputSchema: s.object(
      "The submitted report.",
      {
        reportRunId: s.nonEmptyString("The asynchronous report run ID."),
      },
      { optional: [] },
    ),
    asyncLifecycle: { startActionId: "meta." + "create_insights_report", statusActionId: "meta.get_insights_report" },
  }),
  defineProviderAction(service, {
    name: "get_insights_report",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["ads_read"],
    description:
      "Check an asynchronous Meta Ads report and fetch a result page once complete. Pass the returned after cursor to retrieve further pages.",
    inputSchema: s.object(
      "The asynchronous report query.",
      {
        reportRunId: s.nonEmptyString("The asynchronous report run ID."),
        limit: limitSchema,
        after: afterSchema,
      },
      { optional: ["limit", "after"] },
    ),
    outputSchema: s.object(
      "The asynchronous report status and results.",
      {
        reportRunId: s.nonEmptyString("The asynchronous report run ID."),
        status: s.stringEnum("The normalized report state.", ["running", "succeeded", "failed"]),
        progress: s.nullable(s.integer("The completion percentage reported by Meta.")),
        insights: s.array("The report rows, empty until complete.", insightSchema),
        paging: pagingSchema,
        raw: rawSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["pages_show_list"],
    description:
      "List Facebook Pages available to the connected user or system user, including assigned tasks. Access tokens are never returned.",
    inputSchema: s.object("The managed Page list query.", listInputBase, {
      optional: Object.keys(listInputBase),
    }),
    outputSchema: s.object(
      "The managed Page list.",
      {
        pages: s.array("The available Pages.", pageSchema),
        paging: pagingSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_page",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["pages_read_engagement"],
    description: "Retrieve a managed Facebook Page using its Page access token.",
    inputSchema: s.object("The Page query.", { pageId: pageIdSchema, fields: fieldsSchema }, { optional: ["fields"] }),
    outputSchema: s.object("The Page response.", { page: pageSchema }, { optional: [] }),
  }),
  defineProviderAction(service, {
    name: "list_page_posts",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["pages_read_engagement", "pages_read_user_content"],
    description:
      "List posts from a managed Facebook Page feed, including visitor content where permitted. Inspect is_published to distinguish published and unpublished posts.",
    inputSchema: s.object(
      "The Page feed query.",
      {
        pageId: pageIdSchema,
        ...listInputBase,
        since: s.string("The lower time bound accepted by Graph API."),
        until: s.string("The upper time bound accepted by Graph API."),
      },
      { optional: [...Object.keys(listInputBase), "since", "until"] },
    ),
    outputSchema: s.object(
      "The Page feed response.",
      {
        posts: s.array("The Page posts.", postSchema),
        paging: pagingSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_page_post",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["pages_read_engagement"],
    description: "Retrieve a Facebook Page post using the owning Page access token.",
    inputSchema: s.object(
      "The Page post query.",
      { pageId: pageIdSchema, postId: postIdSchema, fields: fieldsSchema },
      { optional: ["fields"] },
    ),
    outputSchema: s.object("The Page post response.", { post: postSchema }, { optional: [] }),
  }),
  defineProviderAction(service, {
    name: "create_page_post",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["pages_manage_posts", "pages_read_engagement"],
    description:
      "Create a text, link, or attached-photo post on a managed Facebook Page, immediately, unpublished, or scheduled. Upload unpublished photos first to obtain attachment IDs.",
    inputSchema: postWriteInput(false),
    outputSchema: s.object("The created Page post.", { postId: postIdSchema }, { optional: [] }),
  }),
  defineProviderAction(service, {
    name: "update_page_post",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["pages_manage_posts", "pages_read_engagement"],
    description:
      "Update a Facebook Page post created by the same Meta app, including text, attachments, and publishing settings.",
    inputSchema: postWriteInput(true),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_page_post",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["pages_manage_posts", "pages_read_engagement"],
    description: "Delete a post from a managed Facebook Page.",
    inputSchema: s.object(
      "The Page post to delete.",
      {
        pageId: pageIdSchema,
        postId: postIdSchema,
      },
      { optional: [] },
    ),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "publish_page_photo",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["pages_manage_posts", "pages_read_engagement"],
    description:
      "Publish or stage a photo on a managed Facebook Page from a public image URL. Meta downloads the image. Set published=false to obtain a photo ID for an attached-media post.",
    inputSchema: s.object(
      "The Page photo upload.",
      {
        pageId: pageIdSchema,
        imageUrl: s.url("The public image URL that Meta will download."),
        caption: s.string("The photo caption."),
        published: postWriteFields.published,
        scheduledPublishTime: postWriteFields.scheduledPublishTime,
        additionalParameters: additionalParametersSchema,
      },
      { optional: ["caption", "published", "scheduledPublishTime", "additionalParameters"] },
    ),
    outputSchema: s.object(
      "The uploaded Page photo.",
      {
        photoId: s.nonEmptyString("The uploaded photo ID."),
        postId: s.nullable(postIdSchema),
      },
      { optional: [] },
    ),
  }),
];
