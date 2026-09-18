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
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

const negativeKeywordMatchTypes = ["EXACT", "BROAD", "PHRASE"];
const negativeKeywordMatchTypeValues = [...negativeKeywordMatchTypes, "CATEGORY"];
const negativeKeywordStatuses = ["ENABLED", "PAUSED"];
const bulkNegativeKeywordOperations = ["CREATE", "UPDATE"];

const negativeKeywordFilterFields = ["id", "adGroupId", "campaignId", "text", "matchType", "status"];
const negativeKeywordSortFields = ["id", "adGroupId", "campaignId"];

const matchTypeInput = s.stringEnum(
  "How the excluded term is matched against user searches. EXACT and BROAD apply to App Store negatives, PHRASE to Apple Maps negatives, and CATEGORY is not supported for negative keywords. Apple Ads defaults to BROAD. It cannot be changed later.",
  negativeKeywordMatchTypes,
);
const statusInput = s.stringEnum(
  "Whether the exclusion is active. Apple Ads defaults to ENABLED.",
  negativeKeywordStatuses,
);

const negativeKeywordResource = resourceObject(
  "A negative keyword: a search term exclusion scoped either to a whole campaign or to a single ad group.",
  "System-assigned identifier for the negative keyword.",
  {
    adAccountId: s.nullableInteger("Ad account the negative keyword belongs to."),
    campaignId: s.nullableInteger("Campaign the negative keyword belongs to."),
    adGroupId: s.nullableInteger(
      "Ad group the negative keyword is scoped to. Campaign-level exclusions have no ad group: Apple Ads returns null for them, or leaves the field out entirely.",
    ),
    text: s.nullableString("The advertiser-given term to exclude."),
    matchType: nullableEnum("How the excluded term is matched against user searches.", negativeKeywordMatchTypeValues),
    status: nullableEnum("Whether the exclusion is active or paused.", negativeKeywordStatuses),
    creationTime: appleAdsDateTimeOutput("When the negative keyword was created."),
    modificationTime: appleAdsDateTimeOutput("When the negative keyword was last modified."),
    deleted: s.nullableBoolean("Whether the negative keyword has been soft-deleted."),
  },
);

const bulkItemError = s.nullable(
  looseResource("Why this item failed, or null when it succeeded.", {
    code: s.nullableString("Machine-readable reason Apple Ads rejected this item."),
    message: s.nullableString("Human-readable summary of what went wrong with this item."),
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

const bulkResultItem = looseResource(
  "The outcome Apple Ads reported for one item of the bulk request.",
  {
    correlationId: s.integer("Zero-based index of the item in the request array this outcome belongs to."),
    operation: nullableEnum("Operation Apple Ads performed for this item.", bulkNegativeKeywordOperations),
    success: s.nullableBoolean("Whether this individual item succeeded."),
    negativeKeyword: s.nullable(negativeKeywordResource),
    error: bulkItemError,
  },
  ["correlationId"],
);

const bulkResultsOutput = (description: string) =>
  s.actionOutput(
    {
      results: s.array("One outcome per item of the request, in the order the items were sent.", bulkResultItem),
    },
    description,
  );

const allowPartialSuccessInput = s.boolean(
  "Whether Apple Ads should keep the items that succeed when other items fail. It defaults to false, which rejects the whole batch as soon as one item fails.",
);

export const appleAdsNegativeKeywordActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_negative_keywords",
    operationType: "read",
    description:
      "Search the negative keywords of one ad account with filters, sorting and offset pagination. Apple Ads requires an adGroupId filter on every query except one filtered by id: combine adGroupId IS_NULL with campaignId EQUALS to list a campaign's own exclusions, adGroupId IS_NOT_NULL with campaignId EQUALS to list the ad-group-level ones across that campaign, or adGroupId EQUALS or IN to scope the query to specific ad groups.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing negative keywords in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: negativeKeywordFilterFields,
          filterFieldDescription:
            "Negative keyword field to filter on. id accepts EQUALS and IN; adGroupId accepts EQUALS, IN, NOT_EQUALS, IS_NULL and IS_NOT_NULL, with at most 1000 values for IN; campaignId accepts EQUALS only; text accepts EQUALS and STARTS_WITH; matchType and status accept EQUALS and IN.",
          sortFields: negativeKeywordSortFields,
          sortFieldDescription: "Negative keyword field to sort on. Apple Ads sorts by id ascending by default.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "negativeKeywords",
      negativeKeywordResource,
      "Negative keywords matching the query on this page.",
      "A page of negative keywords.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_negative_keyword",
    operationType: "read",
    description:
      "Read one negative keyword by identifier. Apple Ads returns the record regardless of its deleted state, and an absent or null adGroupId marks it as a campaign-level exclusion.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the negative keyword to read.",
      {
        negativeKeywordId: identifierInput("Identifier of the negative keyword."),
        adAccountId: adAccountIdInput,
      },
      { required: ["negativeKeywordId"] },
    ),
    outputSchema: s.actionOutput({ negativeKeyword: negativeKeywordResource }, "The requested negative keyword."),
  }),
  defineProviderAction(service, {
    name: "create_negative_keyword",
    operationType: "write",
    description:
      "Create one negative keyword. Scope it either to a campaign, by passing campaignId alone, or to a single ad group, by passing adGroupId alone: Apple Ads rejects a payload that carries both or neither. text and matchType are fixed at creation, so changing them means deleting this record and creating another.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The negative keyword to create.",
      {
        adAccountId: adAccountIdInput,
        campaignId: identifierInput(
          "Campaign to exclude the term across. Pass it for a campaign-level negative keyword and leave adGroupId unset.",
        ),
        adGroupId: identifierInput(
          "Ad group to exclude the term within. Pass it for an ad-group-level negative keyword and leave campaignId unset.",
        ),
        text: nonEmptyString("The term to exclude. It cannot be changed later."),
        matchType: matchTypeInput,
        status: statusInput,
      },
      { required: ["text"] },
    ),
    outputSchema: s.actionOutput({ negativeKeyword: negativeKeywordResource }, "The created negative keyword."),
  }),
  defineProviderAction(service, {
    name: "update_negative_keyword",
    operationType: "destructive",
    description:
      "Pause or resume one negative keyword. status is the only field Apple Ads allows changing: PAUSED lets the excluded term reach the auction again, ENABLED restores the exclusion. Apple Ads answers a request for a deleted negative keyword with 404.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The negative keyword change to apply.",
      {
        negativeKeywordId: identifierInput("Identifier of the negative keyword to update."),
        adAccountId: adAccountIdInput,
        status: s.stringEnum("Pause or resume the exclusion.", negativeKeywordStatuses),
      },
      { required: ["negativeKeywordId"] },
    ),
    outputSchema: s.actionOutput({ negativeKeyword: negativeKeywordResource }, "The updated negative keyword."),
  }),
  defineProviderAction(service, {
    name: "delete_negative_keyword",
    operationType: "destructive",
    description:
      "Soft-delete one negative keyword. The excluded term stops being suppressed right away, across every ad group of the campaign for a campaign-level record. Use update_negative_keyword with status PAUSED instead when the exclusion should come back later.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the negative keyword to delete.",
      {
        negativeKeywordId: identifierInput("Identifier of the negative keyword to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["negativeKeywordId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted negative keyword."),
      "Confirmation that the negative keyword was soft-deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "bulk_create_negative_keywords",
    operationType: "write",
    description:
      "Create many negative keywords in one request, mixing campaign-level and ad-group-level exclusions freely. The whole batch counts as a single call against the rate limit. Each outcome carries the zero-based index of the payload it belongs to.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The negative keywords to create in one batch.",
      {
        adAccountId: adAccountIdInput,
        negativeKeywords: s.array(
          "Negative keywords to create. Every outcome reports the zero-based index of its payload in this array.",
          s.object(
            "A single negative keyword to create.",
            {
              campaignId: identifierInput(
                "Campaign to exclude the term across, for a campaign-level negative keyword.",
              ),
              adGroupId: identifierInput(
                "Ad group to exclude the term within, for an ad-group-level negative keyword.",
              ),
              text: nonEmptyString("The term to exclude. It cannot be changed later."),
              matchType: matchTypeInput,
              status: statusInput,
            },
            { required: ["text"] },
          ),
          { minItems: 1 },
        ),
        allowPartialSuccess: allowPartialSuccessInput,
      },
      { required: ["negativeKeywords"] },
    ),
    outputSchema: bulkResultsOutput("The per-item outcome of the bulk create."),
  }),
  defineProviderAction(service, {
    name: "bulk_update_negative_keywords",
    operationType: "destructive",
    description:
      "Pause or resume many negative keywords in one request. status is the only field Apple Ads allows changing, and every payload identifies its record by id. Each outcome carries the zero-based index of the payload it belongs to.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The negative keyword changes to apply in one batch.",
      {
        adAccountId: adAccountIdInput,
        negativeKeywords: s.array(
          "Negative keyword changes to apply. Every outcome reports the zero-based index of its payload in this array.",
          s.object(
            "A single negative keyword change.",
            {
              id: identifierInput("Identifier of the negative keyword to update."),
              status: s.stringEnum("Pause or resume the exclusion.", negativeKeywordStatuses),
            },
            { required: ["id", "status"] },
          ),
          { minItems: 1 },
        ),
        allowPartialSuccess: allowPartialSuccessInput,
      },
      { required: ["negativeKeywords"] },
    ),
    outputSchema: bulkResultsOutput("The per-item outcome of the bulk update."),
  }),
];
