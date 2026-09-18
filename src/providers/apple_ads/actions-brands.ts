import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { promotedObjectTypes } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  identifierInput,
  looseResource,
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

export const eligibilityStatuses: readonly string[] = ["ELIGIBLE", "INELIGIBLE", "LIMITED", "PENDING", "UNDEFINED"];

const brandFilterFields = ["id", "eligibility.status"];
const businessCategoryFilterFields = ["name"];
const brandRejectionReasonFilterFields = ["promotedObjectId", "deleted"];

const querySortFields = ["id"];
const querySortFieldDescription =
  "Field to sort on. Apple Ads documents only the default id ordering for these endpoints.";

const constraintGroupOutput = (description: string) =>
  looseResource(description, {
    supplyPlacement: s.nullable(
      s.stringArray("Supply placements this constraint applies to.", {
        itemDescription:
          "A supply placement identifier such as SEARCH_TAB, TODAY_TAB or APPSTORE_SEARCH_RESULTS. Apple Ads does not enumerate the values here.",
      }),
    ),
    countryOrRegion: s.nullable(
      s.stringArray("Countries or regions this constraint applies to.", {
        itemDescription: "An ISO 3166-1 alpha-2 code such as US or GB.",
      }),
    ),
  });

const eligibilityOutput = (description: string) =>
  s.nullable(
    looseResource(description, {
      status: nullableEnum("Overall eligibility status for the entity.", eligibilityStatuses),
      blockedGroups: s.nullable(
        s.array(
          "Placement and market combinations where the entity is blocked from serving.",
          constraintGroupOutput("A constraint group where serving is blocked."),
        ),
      ),
      allowedGroups: s.nullable(
        s.array(
          "Placement and market combinations where the entity is allowed to serve.",
          constraintGroupOutput("A constraint group where serving is allowed."),
        ),
      ),
      modificationTime: appleAdsDateTimeOutput("When Apple Ads last evaluated eligibility."),
    }),
  );
const brandResource = looseResource(
  "A business registered in Apple Ads that can be promoted through Ads on Apple Maps.",
  {
    id: s.string(
      "Identifier of the brand. It is the value you pass as promotedObjectId when creating a BUSINESS_BRAND campaign.",
    ),
    name: s.nullableString("Primary display name for the brand."),
    countryOrRegion: s.nullableString("Primary market for the brand as an ISO 3166-1 alpha-2 country or region code."),
    categories: s.nullable(
      s.stringArray("Business category taxonomy identifiers for the brand. The first entry is the primary category.", {
        itemDescription:
          "A business category identifier, shown in the documentation example as a dot-delimited qualifiedId such as dining.restaurant.",
      }),
    ),
    eligibility: eligibilityOutput("Ad serving eligibility for the brand."),
    creationTime: appleAdsDateTimeOutput("When the brand record was created."),
    modificationTime: appleAdsDateTimeOutput("When the brand record was last modified."),
  },
  ["id"],
);
const businessCategoryResource = looseResource(
  "A node in the Apple Maps business taxonomy that classifies brands and locations.",
  {
    id: s.string("MUID (Maps Unique Identifier) of the category."),
    name: s.nullableString("English display name of the category."),
    qualifiedId: s.nullableString(
      "Dot-delimited taxonomy path such as dining.restaurant. A dot always marks a hierarchy boundary, while an individual level name may itself contain underscores. Pass this value as the text of a CATEGORY match-type keyword.",
    ),
    description: s.nullableString("Human-readable description of the category."),
    eligibility: eligibilityOutput("Ad serving eligibility for the category."),
  },
  ["id"],
);

const brandRejectionReasonResource = resourceObject(
  "A policy assignment explaining why Apple Ads rejected a brand entity or one of its components.",
  "System-assigned identifier of the policy assignment.",
  {
    promotedObjectId: s.nullableString("Identifier of the brand or promoted object the policy assignment belongs to."),
    promotedObjectType: nullableEnum(
      "Type of the promoted object. Apple Ads returns BUSINESS_BRAND for Apple Maps entities.",
      promotedObjectTypes,
    ),
    entityId: s.nullableString("Identifier of the affected entity."),
    entityType: s.nullableString("Type of the affected entity, for example BUSINESS_BRAND."),
    componentType: s.nullableString(
      "Type of the entity component that triggered the policy, for example ENTITY_ASSET.",
    ),
    component: s.nullableString("Identifier of the specific entity component, for example an asset UUID."),
    code: s.nullableString("Machine-readable rejection reason code, for example PERSONAL_INFORMATION."),
    title: s.nullableString("Human-readable title of the rejection reason."),
    body: s.nullableString("Detailed explanation of the rejection reason."),
  },
);

export const appleAdsBrandActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_brands",
    operationType: "read",
    description:
      "Search the brands accessible to one ad account with filters, sorting and offset pagination. A brand must reach eligibility.status ELIGIBLE before an Apple Maps campaign can promote it.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing brands available to one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: brandFilterFields,
          filterFieldDescription:
            "Brand field to filter on. id accepts EQUALS and IN; eligibility.status accepts EQUALS.",
          sortFields: querySortFields,
          sortFieldDescription: querySortFieldDescription,
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput("brands", brandResource, "Brands matching the query on this page.", "A page of brands."),
  }),
  defineProviderAction(service, {
    name: "get_brand",
    operationType: "read",
    description: "Read one brand by identifier, including its categories and its current ad serving eligibility.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the brand to read.",
      {
        brandId: identifierInput("Identifier of the brand."),
        adAccountId: adAccountIdInput,
      },
      { required: ["brandId"] },
    ),
    outputSchema: s.actionOutput({ brand: brandResource }, "The requested brand."),
  }),
  defineProviderAction(service, {
    name: "query_business_categories",
    operationType: "read",
    description:
      "Search the Apple Maps business category taxonomy with filters, sorting and offset pagination. Only categories with eligibility.status ELIGIBLE can be used by an active Apple Maps campaign.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing the Apple Maps business category taxonomy.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: businessCategoryFilterFields,
          filterFieldDescription:
            "Business category field to filter on. name is the only documented filterable field and it accepts STARTS_WITH.",
          sortFields: querySortFields,
          sortFieldDescription: querySortFieldDescription,
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "businessCategories",
      businessCategoryResource,
      "Business categories matching the query on this page.",
      "A page of business categories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_business_category",
    operationType: "read",
    description:
      "Read one Apple Maps business category by its MUID, including its qualifiedId taxonomy path and eligibility status.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the business category to read.",
      {
        businessCategoryId: nonEmptyString("MUID of the business category, as returned by query_business_categories."),
        adAccountId: adAccountIdInput,
      },
      { required: ["businessCategoryId"] },
    ),
    outputSchema: s.actionOutput({ businessCategory: businessCategoryResource }, "The requested business category."),
  }),
  defineProviderAction(service, {
    name: "query_brand_rejection_reasons",
    operationType: "read",
    description:
      "Search the policy assignments that explain why Apple Ads rejected a brand, one of its creatives or one of its assets. Filter on promotedObjectId to scope the results to a single brand.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing brand rejection reasons in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: brandRejectionReasonFilterFields,
          filterFieldDescription:
            "Policy assignment field to filter on. promotedObjectId accepts IN and EQUALS; deleted accepts EQUALS and includes soft-deleted assignments when set to true.",
          sortFields: querySortFields,
          sortFieldDescription: querySortFieldDescription,
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "rejectionReasons",
      brandRejectionReasonResource,
      "Policy assignments with rejection reason details matching the query on this page.",
      "A page of brand rejection reasons.",
    ),
  }),
];
