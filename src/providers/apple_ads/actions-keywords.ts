import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  deletedOutput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  moneyInput,
  moneyOutput,
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

export const keywordStatuses: readonly string[] = ["ENABLED", "PAUSED"];
export const keywordMatchTypes: readonly string[] = ["EXACT", "BROAD", "PHRASE", "CATEGORY"];
export const keywordDisplayStatuses: readonly string[] = [
  "RUNNING",
  "PAUSED",
  "DELETED",
  "AD_GROUP_ON_HOLD",
  "CAMPAIGN_ON_HOLD",
];
const bulkKeywordOperations = ["CREATE", "UPDATE"];
const keywordQueryFields = ["id", "adGroupId", "campaignId", "text", "matchType", "status", "deleted"];

const matchTypeDescription =
  "How the keyword matches user search queries. EXACT and BROAD apply to App Store campaigns using the Search results placement; PHRASE and CATEGORY apply to Apple Maps campaigns.";

const keywordTextInput = nonEmptyString(
  "The search term to target. It cannot be changed after creation: to change it, delete the keyword and create a new one. For the CATEGORY match type this must be a Maps business category identifier such as dining.restaurant.",
);

const keywordBidInput = moneyInput(
  "Per-keyword bid that overrides the ad group's bid strategy bid. Maximize Conversions campaigns do not use it.",
);

const keywordStatusInput = s.stringEnum(
  "Whether the keyword is eligible to serve. A paused keyword stays in the ad group but does not enter auctions.",
  keywordStatuses,
);

const keywordResource = resourceObject(
  "A keyword, the targeting unit that makes an ad group eligible for the auction when a user search matches it.",
  "System-assigned identifier for the keyword.",
  {
    adAccountId: s.nullableInteger("Ad account the keyword belongs to."),
    campaignId: s.nullableInteger(
      "Campaign that owns the keyword's ad group. Informational only; keywords are never attached to a campaign directly.",
    ),
    adGroupId: s.nullableInteger("Ad group the keyword belongs to."),
    text: s.nullableString("Advertiser-given keyword text."),
    matchType: nullableEnum(matchTypeDescription, keywordMatchTypes),
    bid: moneyOutput("Per-keyword bid override, or null when the keyword follows the ad group's bid strategy."),
    status: nullableEnum("Advertiser intent for the keyword to serve.", keywordStatuses),
    displayStatus: nullableEnum(
      "Rolled-up delivery state combining the keyword, its ad group and its campaign.",
      keywordDisplayStatuses,
    ),
    creationTime: appleAdsDateTimeOutput("When the keyword was created."),
    modificationTime: appleAdsDateTimeOutput("When the keyword was last modified."),
    deleted: s.nullableBoolean("Whether the keyword has been soft-deleted."),
  },
);

const bulkItemErrorOutput = s.nullable(
  looseResource("Why this item failed, or null when it succeeded.", {
    code: s.nullableString("Machine-readable reason the item was rejected."),
    message: s.nullableString("Human-readable summary of the failure."),
    details: s.nullable(
      s.array(
        "Field-level violations behind this failure.",
        looseResource("A single field-level violation.", {
          code: s.nullableString("Machine-readable code for this violation."),
          message: s.nullableString("Human-readable description of this violation."),
        }),
      ),
    ),
  }),
);

const bulkKeywordResultsOutput = (description: string, itemsDescription: string) =>
  s.array(
    description,
    looseResource(
      itemsDescription,
      {
        correlationId: s.integer("Zero-based index of the keyword in the request array this result belongs to."),
        operation: nullableEnum("Operation Apple Ads performed for this item.", bulkKeywordOperations),
        success: s.nullableBoolean("Whether this individual item succeeded."),
        keyword: s.nullable(keywordResource),
        error: bulkItemErrorOutput,
      },
      ["correlationId"],
    ),
  );

const allowPartialSuccessInput = s.boolean(
  "Whether Apple Ads keeps the items that succeeded when other items in the same batch fail. When omitted or false, a single item failure rejects the whole batch.",
);

export const appleAdsKeywordActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_keywords",
    operationType: "read",
    description:
      "Search the keywords of one ad account with filters, sorting and offset pagination. Apple Ads requires a filter on adGroupId or campaignId unless you filter on id, and soft-deleted keywords are excluded unless a filter on deleted asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing keywords in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: keywordQueryFields,
          filterFieldDescription:
            "Keyword field to filter on. id, adGroupId, matchType and status accept EQUALS and IN; campaignId and deleted accept EQUALS; text accepts EQUALS and STARTS_WITH. An adGroupId IN filter accepts at most 1000 values, and adGroupId does not accept NOT_EQUALS, IS_NULL or IS_NOT_NULL.",
          sortFields: keywordQueryFields,
          sortFieldDescription: "Keyword field to sort on. The default is id ascending.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "keywords",
      keywordResource,
      "Keywords matching the query on this page.",
      "A page of keywords.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_keyword",
    operationType: "read",
    description:
      "Read one keyword by identifier. Apple Ads returns a soft-deleted keyword with deleted set to true rather than 404.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the keyword to read.",
      {
        keywordId: identifierInput("Identifier of the keyword."),
        adAccountId: adAccountIdInput,
      },
      { required: ["keywordId"] },
    ),
    outputSchema: s.actionOutput({ keyword: keywordResource }, "The requested keyword."),
  }),
  defineProviderAction(service, {
    name: "create_keyword",
    operationType: "write",
    description:
      "Add one keyword to an ad group. adGroupId, text and matchType are fixed at creation: to change them, delete the keyword and create a new one.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The keyword to create.",
      {
        adAccountId: adAccountIdInput,
        adGroupId: identifierInput("Ad group the keyword belongs to. It cannot be changed after creation."),
        text: keywordTextInput,
        matchType: s.stringEnum(`${matchTypeDescription} It cannot be changed after creation.`, keywordMatchTypes),
        bid: keywordBidInput,
        status: keywordStatusInput,
      },
      { required: ["adGroupId", "text"] },
    ),
    outputSchema: s.actionOutput({ keyword: keywordResource }, "The created keyword."),
  }),
  defineProviderAction(service, {
    name: "update_keyword",
    operationType: "destructive",
    description:
      "Change the bid or the status of one keyword. Apple Ads accepts nothing else on an update, and returns 404 for a keyword that has already been deleted.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The keyword changes to apply.",
      {
        keywordId: identifierInput("Identifier of the keyword to update."),
        adAccountId: adAccountIdInput,
        bid: keywordBidInput,
        status: keywordStatusInput,
      },
      { required: ["keywordId"] },
    ),
    outputSchema: s.actionOutput({ keyword: keywordResource }, "The updated keyword."),
  }),
  defineProviderAction(service, {
    name: "delete_keyword",
    operationType: "destructive",
    description:
      "Soft-delete one keyword. Apple Ads keeps the record and stops bidding on the term, and leaves the parent ad group and campaign untouched. To pause the term temporarily, update its status to PAUSED instead.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the keyword to delete.",
      {
        keywordId: identifierInput("Identifier of the keyword to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["keywordId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted keyword."),
      "Confirmation that the keyword was soft-deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "bulk_create_keywords",
    operationType: "write",
    description:
      "Create many keywords in one request, spanning as many ad groups as you like. The whole batch counts as a single call against the rate limit, which makes it the way to seed a keyword list.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The keywords to create in one batch.",
      {
        adAccountId: adAccountIdInput,
        keywords: s.array(
          "Keywords to create. Each entry is correlated with its result by its zero-based index in this array, so you never have to invent an identifier for it.",
          s.object(
            "A single keyword to create.",
            {
              adGroupId: identifierInput("Ad group the keyword belongs to."),
              text: keywordTextInput,
              matchType: s.stringEnum(matchTypeDescription, keywordMatchTypes),
              bid: keywordBidInput,
              status: keywordStatusInput,
            },
            { required: ["adGroupId", "text"] },
          ),
          { minItems: 1 },
        ),
        allowPartialSuccess: allowPartialSuccessInput,
      },
      { required: ["keywords"] },
    ),
    outputSchema: s.actionOutput(
      {
        results: bulkKeywordResultsOutput(
          "One result per keyword you passed in, in the same order.",
          "The outcome of one keyword in the batch.",
        ),
      },
      "Per-keyword outcomes of the bulk create.",
    ),
  }),
  defineProviderAction(service, {
    name: "bulk_update_keywords",
    operationType: "destructive",
    description:
      "Change the bid or the status of many keywords in one request, for example to reprice a set of high performers or pause a set of weak ones. Apple Ads accepts nothing else on an update.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The keyword changes to apply in one batch.",
      {
        adAccountId: adAccountIdInput,
        keywords: s.array(
          "Keyword changes to apply. Each entry is correlated with its result by its zero-based index in this array, so you never have to invent an identifier for it.",
          s.object(
            "A single keyword to update. Pass bid, status, or both.",
            {
              keywordId: identifierInput("Identifier of the keyword to update."),
              bid: keywordBidInput,
              status: keywordStatusInput,
            },
            { required: ["keywordId"] },
          ),
          { minItems: 1 },
        ),
        allowPartialSuccess: allowPartialSuccessInput,
      },
      { required: ["keywords"] },
    ),
    outputSchema: s.actionOutput(
      {
        results: bulkKeywordResultsOutput(
          "One result per keyword you passed in, in the same order.",
          "The outcome of one keyword in the batch.",
        ),
      },
      "Per-keyword outcomes of the bulk update.",
    ),
  }),
];
