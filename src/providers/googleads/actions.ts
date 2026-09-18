import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleAdsScope } from "./scopes.ts";

const service = "googleads";

interface GoogleAdsActionSource {
  name: GoogleAdsActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const googleAdsDeveloperToken = s.nonEmptyString(
  "The Google Ads API developer token to send as the developer-token header.",
);
const customerId = s.nonEmptyString("The Google Ads customer ID. Spaces and hyphens are accepted and normalized.");
const looseObject = s.unknownObject("A JSON-like object with arbitrary string keys.");
const campaign = s.object(
  "A normalized Google Ads campaign.",
  {
    resourceName: s.string("The resource name of the campaign."),
    id: s.string("The Google Ads campaign ID."),
    name: s.string("The campaign name."),
    status: s.string("The campaign status."),
    advertisingChannelType: s.string("The high-level advertising channel type."),
    advertisingChannelSubType: s.string("The advertising channel subtype."),
    startDate: s.string("The campaign start date in YYYY-MM-DD format."),
    endDate: s.string("The campaign end date in YYYY-MM-DD format."),
  },
  {
    required: ["resourceName", "id", "name"],
  },
);
const customerList = s.object(
  "A normalized Google Ads customer list.",
  {
    resourceName: s.string("The resource name of the customer list."),
    id: s.string("The Google Ads user list ID."),
    name: s.string("The customer list name."),
    description: s.string("The customer list description."),
    type: s.string("The Google Ads user list type, such as CRM_BASED or RULE_BASED."),
    readOnly: s.boolean("Whether the user list is read-only and cannot be mutated."),
    membershipStatus: s.string("The membership status of the customer list."),
    sizeForSearch: s.string("The estimated search list size reported by Google Ads."),
    sizeForDisplay: s.string("The estimated display list size reported by Google Ads."),
  },
  {
    required: ["resourceName", "id", "name"],
  },
);
const adGroupCreateInput = s.object(
  "The fields used to create an ad group.",
  {
    name: s.nonEmptyString("The ad group name."),
    campaign: s.nonEmptyString("The resource name of the campaign that owns the ad group."),
    status: s.nonEmptyString("The ad group status."),
    type: s.nonEmptyString("The ad group type."),
  },
  { required: ["name", "campaign"] },
);
const adGroupUpdateInput = s.object(
  "The mutable fields supported by the connector for ad group updates.",
  {
    resourceName: s.nonEmptyString("The resource name of the ad group to update."),
    name: s.nonEmptyString("The updated ad group name."),
    status: s.nonEmptyString("The updated ad group status."),
  },
  { required: ["resourceName"] },
);
const adGroupOperation = s.oneOf(
  [
    s.requiredObject("Create an ad group.", {
      create: adGroupCreateInput,
    }),
    s.requiredObject("Update an ad group.", {
      update: adGroupUpdateInput,
    }),
    s.requiredObject("Remove an ad group.", {
      remove: s.nonEmptyString("The resource name of the ad group to remove."),
    }),
  ],
  { description: "One mutate operation for ad groups." },
);
const campaignNetworkSettings = s.object("The campaign network settings supported by the connector.", {
  targetYoutube: s.boolean("Whether to target YouTube inventory."),
  targetGoogleSearch: s.boolean("Whether to target Google Search results."),
  targetSearchNetwork: s.boolean("Whether to target Google Search partner inventory."),
  targetContentNetwork: s.boolean("Whether to target the Google Display Network."),
  targetGoogleTvNetwork: s.boolean("Whether to target Google TV inventory."),
  targetPartnerSearchNetwork: s.boolean("Whether to target partner search inventory."),
});
const urlCustomParameter = s.requiredObject("One URL custom parameter for tracking templates.", {
  key: s.nonEmptyString("The custom parameter key."),
  value: s.nonEmptyString("The custom parameter value."),
});
const geoTargetTypeSetting = s.object("The campaign geo target type settings.", {
  negativeGeoTargetType: s.nonEmptyString("The negative geo target type."),
  positiveGeoTargetType: s.nonEmptyString("The positive geo target type."),
});
const campaignCreateInput = s.object(
  "The subset of campaign create fields supported by the connector.",
  {
    name: s.nonEmptyString("The campaign name."),
    campaignBudget: s.nonEmptyString("The campaign budget resource name to attach."),
    advertisingChannelType: s.nonEmptyString("The advertising channel type."),
    status: s.nonEmptyString("The campaign status."),
    startDate: s.nonEmptyString("The campaign start date."),
    endDate: s.nonEmptyString("The campaign end date."),
    manualCpc: looseObject,
    finalUrlSuffix: s.nonEmptyString("The final URL suffix."),
    networkSettings: campaignNetworkSettings,
    trackingUrlTemplate: s.nonEmptyString("The tracking URL template."),
    urlCustomParameters: s.array("The custom URL parameters.", urlCustomParameter, { minItems: 1 }),
    geoTargetTypeSetting,
    campaignBiddingStrategy: s.nonEmptyString("The campaign bidding strategy resource name."),
    containsEuPoliticalAdvertising: s.nonEmptyString("The EU political advertising status."),
  },
  { required: ["name", "campaignBudget"] },
);
const campaignUpdateInput = s.object(
  "The subset of campaign update fields supported by the connector.",
  {
    resourceName: s.nonEmptyString("The resource name of the campaign to update."),
    name: s.nonEmptyString("The updated campaign name."),
    status: s.nonEmptyString("The updated campaign status."),
    startDate: s.nonEmptyString("The updated campaign start date."),
    endDate: s.nonEmptyString("The updated campaign end date."),
    manualCpc: looseObject,
    campaignBudget: s.nonEmptyString("The updated campaign budget resource name."),
    finalUrlSuffix: s.nonEmptyString("The updated final URL suffix."),
    networkSettings: campaignNetworkSettings,
    trackingUrlTemplate: s.nonEmptyString("The updated tracking URL template."),
    urlCustomParameters: s.array("The updated custom URL parameters.", urlCustomParameter, { minItems: 1 }),
    geoTargetTypeSetting,
    advertisingChannelType: s.nonEmptyString("The updated advertising channel type."),
    campaignBiddingStrategy: s.nonEmptyString("The updated campaign bidding strategy resource name."),
    containsEuPoliticalAdvertising: s.nonEmptyString("The updated EU political advertising status."),
  },
  { required: ["resourceName"] },
);
const campaignOperation = s.oneOf(
  [
    s.requiredObject("Create a campaign.", {
      operationType: s.literal("create", { description: "The mutate operation type." }),
      create: campaignCreateInput,
    }),
    s.requiredObject("Update a campaign.", {
      operationType: s.literal("update", { description: "The mutate operation type." }),
      update: campaignUpdateInput,
    }),
    s.requiredObject("Remove a campaign.", {
      operationType: s.literal("remove", { description: "The mutate operation type." }),
      remove: s.nonEmptyString("The resource name of the campaign to remove."),
    }),
  ],
  { description: "One mutate operation for campaigns." },
);
const adGroupMutationResult = s.requiredObject("One successful ad group mutation result.", {
  resourceName: s.string("The resource name returned for a successful ad group mutation."),
});
const campaignMutationResult = s.object(
  "One successful campaign mutation result.",
  {
    resourceName: s.string("The resource name returned for a successful campaign mutation."),
    campaign: looseObject,
  },
  { required: ["resourceName"] },
);

const actions: GoogleAdsActionSource[] = [
  action(
    "get_campaign_by_id",
    "read",
    "Retrieve one Google Ads campaign by its campaign ID.",
    customerInput(
      {
        campaignId: s.nonEmptyString("The Google Ads campaign ID to retrieve."),
      },
      ["campaignId"],
    ),
    s.actionOutput({
      campaign: s.nullable(campaign),
    }),
  ),
  action(
    "get_campaign_by_name",
    "read",
    "Retrieve all Google Ads campaigns that exactly match a campaign name.",
    customerInput(
      {
        name: s.nonEmptyString("The exact campaign name to match."),
      },
      ["name"],
    ),
    s.actionOutput({
      campaigns: s.array("The campaigns that exactly matched the requested name.", campaign),
    }),
  ),
  action(
    "list_accessible_customers",
    "read",
    "List Google Ads customer resource names accessible to the current OAuth credential.",
    input({
      developerToken: googleAdsDeveloperToken,
    }),
    s.actionOutput({
      resourceNames: s.stringArray("The accessible customer resource names returned by Google Ads."),
    }),
  ),
  action(
    "search_stream_gaql",
    "read",
    "Execute a GAQL streaming query and return the aggregated result rows in one response.",
    customerInput(
      {
        query: s.nonEmptyString("The GAQL query to execute."),
        summaryRowSetting: s.stringEnum(
          [
            "UNSPECIFIED",
            "UNKNOWN",
            "NO_SUMMARY_ROW",
            "SUMMARY_ROW_WITH_RESULTS",
            "SUMMARY_ROW_ONLY",
            "DONOT_POST",
            "GENERATE",
          ],
          { description: "Whether to include a summary row in the streamed result." },
        ),
      },
      ["query"],
    ),
    s.actionOutput(
      {
        results: s.array("The aggregated result rows returned by the GAQL stream.", looseObject),
        fieldMask: s.string("The field mask returned by the GAQL stream."),
        requestId: s.string("The request ID returned by the Google Ads API."),
        summaryRow: looseObject,
        queryResourceConsumption: s.string("The query resource consumption reported by Google Ads."),
      },
      "Action output.",
      ["results"],
    ),
  ),
  action(
    "list_customer_lists",
    "read",
    "List Google Ads customer lists available under the specified customer account.",
    customerInput({
      pageToken: s.nonEmptyString("The nextPageToken returned by a previous call."),
    }),
    s.actionOutput({
      customerLists: s.array("The returned Google Ads customer lists.", customerList),
      nextPageToken: s.nullableString("A pagination token for the next page, or null when no more results exist."),
    }),
  ),
  action(
    "create_customer_list",
    "write",
    "Create a new Google Ads CRM-based customer list for Customer Match uploads.",
    customerInput(
      {
        name: s.nonEmptyString("The name of the customer list to create."),
        description: s.nonEmptyString("The description of the customer list."),
      },
      ["name"],
    ),
    s.actionOutput({
      resourceName: s.string("The resource name of the created customer list."),
    }),
  ),
  action(
    "add_or_remove_to_customer_list",
    "destructive",
    "Submit Customer Match user identifiers to add users to or remove users from a Google Ads customer list.",
    customerInput(
      {
        resourceName: s.nonEmptyString(
          "The resource name of the customer list, for example customers/1234567890/userLists/999.",
        ),
        emails: s.array(
          "The email addresses to add to or remove from the customer list.",
          s.email("A user email address."),
          {
            minItems: 1,
          },
        ),
        operation: s.stringEnum(["create", "remove"], {
          description: "Whether to add new users to the list or remove existing users.",
          default: "create",
        }),
      },
      ["resourceName", "emails"],
    ),
    s.actionOutput(
      {
        status: s.string("The submission status returned by the connector."),
        offlineUserDataJobResourceName: s.string("The resource name of the created offline user data job."),
        runOperationName: s.string("The long-running operation resource name returned by the run request."),
      },
      "Action output.",
      ["status", "offlineUserDataJobResourceName"],
    ),
  ),
  action(
    "mutate_ad_groups",
    "destructive",
    "Create, update, or remove Google Ads ad groups in a single mutate request.",
    customerInput(
      {
        operations: s.array("The ad group operations to submit in one mutate request.", adGroupOperation, {
          minItems: 1,
        }),
        validateOnly: s.boolean("Whether to validate the request without applying the mutation."),
        partialFailure: s.boolean("Whether successful operations should continue when one operation fails."),
      },
      ["operations"],
    ),
    s.actionOutput(
      {
        results: s.array("The successful ad group mutation results.", adGroupMutationResult),
        partialFailureError: looseObject,
      },
      "Action output.",
      ["results"],
    ),
  ),
  action(
    "mutate_campaigns",
    "destructive",
    "Create, update, or remove Google Ads campaigns in a single mutate request.",
    customerInput(
      {
        operations: s.array("The campaign operations to submit in one mutate request.", campaignOperation, {
          minItems: 1,
        }),
        validateOnly: s.boolean("Whether to validate the request without applying the mutation."),
        partialFailure: s.boolean("Whether successful operations should continue when one operation fails."),
        responseContentType: s.stringEnum(["RESOURCE_NAME_ONLY", "MUTABLE_RESOURCE"], {
          description: "Whether the API should return only resource names or mutable resources.",
        }),
      },
      ["operations"],
    ),
    s.actionOutput(
      {
        results: s.array("The successful campaign mutation results.", campaignMutationResult),
        successfulCount: s.integer("The number of campaign operations that succeeded."),
        totalOperationsCount: s.integer("The total number of campaign operations that were submitted."),
        partialFailureError: looseObject,
      },
      "Action output.",
      ["results", "successfulCount", "totalOperationsCount"],
    ),
  ),
];

export const googleAdsActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    requiredScopes: [googleAdsScope],
    providerPermissions: [googleAdsScope],
  }),
);

export type GoogleAdsActionName =
  | "get_campaign_by_id"
  | "get_campaign_by_name"
  | "list_accessible_customers"
  | "search_stream_gaql"
  | "list_customer_lists"
  | "create_customer_list"
  | "add_or_remove_to_customer_list"
  | "mutate_ad_groups"
  | "mutate_campaigns";

function action(
  name: GoogleAdsActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleAdsActionSource {
  return {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = Object.keys(properties)): JsonSchema {
  return s.actionInput(properties, required);
}

function customerInput(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return input(
    {
      developerToken: googleAdsDeveloperToken,
      customerId,
      ...properties,
    },
    ["developerToken", "customerId", ...required],
  );
}
