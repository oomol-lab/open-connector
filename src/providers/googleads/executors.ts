import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { GoogleAdsActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalScalarString,
  optionalString,
} from "../../core/cast.ts";
import { googleJsonRequest, googleRequest } from "../google-runtime.ts";
import { defineProviderExecutors, ProviderRequestError, requireOAuthCredential } from "../provider-runtime.ts";
import { googleAdsScope } from "./scopes.ts";

export const googleAdsApiBaseUrl = "https://googleads.googleapis.com/v22";

const service = "googleads";
const customerMatchUserListType = "CUSTOMER_MATCH_USER_LIST";
const googleUserInfoUrl = "https://openidconnect.googleapis.com/v1/userinfo";

const summaryRowSettingAliases = new Map([
  ["UNSPECIFIED", "UNSPECIFIED"],
  ["UNKNOWN", "UNKNOWN"],
  ["NO_SUMMARY_ROW", "NO_SUMMARY_ROW"],
  ["SUMMARY_ROW_WITH_RESULTS", "SUMMARY_ROW_WITH_RESULTS"],
  ["SUMMARY_ROW_ONLY", "SUMMARY_ROW_ONLY"],
  ["DONOT_POST", "NO_SUMMARY_ROW"],
  ["GENERATE", "SUMMARY_ROW_WITH_RESULTS"],
]);
const campaignStatusAliases = createUppercaseAliasMap(["UNSPECIFIED", "UNKNOWN", "ENABLED", "PAUSED", "REMOVED"]);
const advertisingChannelTypeAliases = createUppercaseAliasMap([
  "UNSPECIFIED",
  "UNKNOWN",
  "SEARCH",
  "DISPLAY",
  "SHOPPING",
  "VIDEO",
  "MULTI_CHANNEL",
  "LOCAL",
  "SMART",
  "VIDEO_REACH",
]);
const euPoliticalAdvertisingAliases = createUppercaseAliasMap([
  "UNSPECIFIED",
  "UNKNOWN",
  "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  "CONTAINS_EU_POLITICAL_ADVERTISING",
]);
const geoTargetTypeAliases = createUppercaseAliasMap([
  "UNSPECIFIED",
  "UNKNOWN",
  "PRESENCE_OR_INTEREST",
  "SEARCH_INTEREST",
  "PRESENCE",
]);

interface GoogleAdsRuntimeContext {
  accessToken: string;
  customerId?: string;
  developerToken?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type SearchRow = Record<string, unknown>;
type GoogleAdsActionHandler = (input: Record<string, unknown>, context: GoogleAdsRuntimeContext) => Promise<unknown>;

export const googleAdsActionHandlers: Record<GoogleAdsActionName, GoogleAdsActionHandler> = {
  get_campaign_by_id: getCampaignById,
  get_campaign_by_name: getCampaignByName,
  list_accessible_customers: listAccessibleCustomers,
  search_stream_gaql: searchStreamGaql,
  list_customer_lists: listCustomerLists,
  create_customer_list: createCustomerList,
  add_or_remove_to_customer_list: addOrRemoveToCustomerList,
  mutate_ad_groups: mutateAdGroups,
  mutate_campaigns: mutateCampaigns,
};

export const executors: ProviderExecutors = defineProviderExecutors<GoogleAdsRuntimeContext>({
  service,
  handlers: googleAdsActionHandlers,
  async createContext(context, fetcher): Promise<GoogleAdsRuntimeContext> {
    const credential = await requireOAuthCredential(context, service);
    const oauthClientExtra = optionalRecord(credential.metadata.oauthClientExtra);
    const oauthClientSecretExtra = optionalRecord(credential.metadata.oauthClientSecretExtra);
    return {
      accessToken: credential.accessToken,
      customerId: optionalString(oauthClientExtra?.customerId),
      developerToken: optionalString(oauthClientSecretExtra?.developerToken),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await googleJsonRequest<{
      sub?: string;
      email?: string;
      name?: string;
    }>(googleUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
    });
    const accountId = optionalString(profile.sub) ?? optionalString(profile.email) ?? "googleads:oauth2";
    const displayName = optionalString(profile.email) ?? optionalString(profile.name) ?? accountId;

    return {
      profile: {
        accountId,
        displayName,
      },
      grantedScopes: parseScopeString(input.metadata.scope),
      metadata: {
        ...input.metadata,
        currentAccount: profile,
      },
    };
  },
};

async function getCampaignById(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const customerId = resolveGoogleAdsCustomerId(input, context);
  const campaignId = normalizeGoogleAdsId(input.campaignId, "campaignId");
  const rows = await googleAdsSearch(
    {
      customerId,
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      query: [
        "SELECT",
        "campaign.resource_name,",
        "campaign.id,",
        "campaign.name,",
        "campaign.status,",
        "campaign.advertising_channel_type,",
        "campaign.advertising_channel_sub_type,",
        "campaign.start_date,",
        "campaign.end_date",
        "FROM campaign",
        `WHERE campaign.id = ${campaignId}`,
        "LIMIT 1",
      ].join(" "),
    },
    context,
  );

  return {
    campaign: rows[0] ? normalizeCampaign(rows[0]) : null,
  };
}

async function getCampaignByName(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const rows = await googleAdsSearch(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      query: [
        "SELECT",
        "campaign.resource_name,",
        "campaign.id,",
        "campaign.name,",
        "campaign.status,",
        "campaign.advertising_channel_type,",
        "campaign.advertising_channel_sub_type,",
        "campaign.start_date,",
        "campaign.end_date",
        "FROM campaign",
        `WHERE campaign.name = ${JSON.stringify(requireNonEmptyString(input.name, "name"))}`,
        "ORDER BY campaign.id",
      ].join(" "),
    },
    context,
  );

  return {
    campaigns: rows.map(normalizeCampaign),
  };
}

async function listAccessibleCustomers(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const payload = await googleAdsJsonRequest<{
    resourceNames?: unknown[];
    resource_names?: unknown[];
  }>(
    {
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      path: "/customers:listAccessibleCustomers",
      method: "GET",
    },
    context,
  );

  return {
    resourceNames: normalizeStringArray(payload.resourceNames ?? payload.resource_names),
  };
}

async function searchStreamGaql(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const response = await googleAdsRequest(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      path: "/googleAds:searchStream",
      body: compactObject({
        query: requireNonEmptyString(input.query, "query"),
        summaryRowSetting: normalizeSummaryRowSetting(input.summaryRowSetting),
      }),
    },
    context,
  );
  const payload = (await response.json()) as unknown;
  const chunks = Array.isArray(payload)
    ? payload.map((item) => asObject(item, "searchStream chunk"))
    : [asObject(payload, "searchStream response")];
  const results: SearchRow[] = [];
  let fieldMask: string | undefined;
  let summaryRow: SearchRow | undefined;
  let queryResourceConsumption: string | undefined;

  for (const chunk of chunks) {
    if (Array.isArray(chunk.results)) {
      results.push(...chunk.results.map((item) => asObject(item, "searchStream result")));
    }
    fieldMask = optionalString(chunk.fieldMask) ?? fieldMask;
    summaryRow = optionalRecord(chunk.summaryRow) ?? summaryRow;
    queryResourceConsumption = optionalScalarString(chunk.queryResourceConsumption) ?? queryResourceConsumption;
  }

  return compactObject({
    results,
    fieldMask,
    requestId: optionalString(response.headers.get("request-id")),
    summaryRow,
    queryResourceConsumption,
  });
}

async function listCustomerLists(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const payload = await googleAdsSearchPayload(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      pageToken: optionalString(input.pageToken),
      query: [
        "SELECT",
        "user_list.resource_name,",
        "user_list.id,",
        "user_list.name,",
        "user_list.description,",
        "user_list.type,",
        "user_list.read_only,",
        "user_list.membership_status,",
        "user_list.size_for_search,",
        "user_list.size_for_display",
        "FROM user_list",
        "ORDER BY user_list.id",
      ].join(" "),
    },
    context,
  );

  return {
    customerLists: payload.results.map(normalizeCustomerList),
    nextPageToken: payload.nextPageToken,
  };
}

async function createCustomerList(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const payload = await googleAdsJsonRequest<{
    results?: Array<{ resourceName?: string }>;
  }>(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      path: "/userLists:mutate",
      body: {
        operations: [
          {
            create: compactObject({
              name: requireNonEmptyString(input.name, "name"),
              description: optionalString(input.description),
              crmBasedUserList: {
                uploadKeyType: "CONTACT_INFO",
                dataSourceType: "FIRST_PARTY",
              },
            }),
          },
        ],
      },
    },
    context,
  );

  const resourceName = optionalString(payload.results?.[0]?.resourceName);
  if (!resourceName) {
    throw new ProviderRequestError(502, "missing googleads customer list resource name");
  }

  return {
    resourceName,
  };
}

async function addOrRemoveToCustomerList(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const customerId = resolveGoogleAdsCustomerId(input, context);
  const developerToken = resolveGoogleAdsDeveloperToken(input, context);
  const userListResourceName = requireNonEmptyString(input.resourceName, "resourceName");
  const operation = requireOperation(input.operation);
  const emails = requireEmailList(input.emails);

  const createdJob = await googleAdsJsonRequest<{ resourceName?: string }>(
    {
      customerId,
      developerToken,
      path: "/offlineUserDataJobs:create",
      body: {
        job: {
          type: customerMatchUserListType,
          customerMatchUserListMetadata: {
            userList: userListResourceName,
          },
        },
      },
    },
    context,
  );
  const offlineUserDataJobResourceName = optionalString(createdJob.resourceName);
  if (!offlineUserDataJobResourceName) {
    throw new ProviderRequestError(502, "missing googleads offline user data job resource name");
  }

  await googleAdsJsonRequest<Record<string, unknown>>(
    {
      customerId,
      developerToken,
      path: buildResourceMethodPath(offlineUserDataJobResourceName, "addOperations"),
      body: {
        operations: emails.map((email) => ({
          [operation]: {
            userIdentifiers: [
              {
                hashedEmail: hashNormalizedEmail(email),
              },
            ],
          },
        })),
      },
    },
    context,
  );

  const runPayload = await googleAdsJsonRequest<{ name?: string }>(
    {
      customerId,
      developerToken,
      path: buildResourceMethodPath(offlineUserDataJobResourceName, "run"),
      body: {},
    },
    context,
  );

  return compactObject({
    status: "submitted",
    offlineUserDataJobResourceName,
    runOperationName: optionalString(runPayload.name),
  });
}

async function mutateAdGroups(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const operations = normalizeAdGroupOperations(input.operations);
  const payload = await googleAdsJsonRequest<{
    results?: unknown[];
    partialFailureError?: unknown;
  }>(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      path: "/adGroups:mutate",
      body: compactObject({
        operations,
        validateOnly: optionalBoolean(input.validateOnly),
        partialFailure: optionalBoolean(input.partialFailure),
      }),
    },
    context,
  );

  return compactObject({
    results: normalizeResourceMutationResults(payload.results),
    partialFailureError: optionalRecord(payload.partialFailureError),
  });
}

async function mutateCampaigns(input: Record<string, unknown>, context: GoogleAdsRuntimeContext) {
  const operations = normalizeCampaignOperations(input.operations);
  const payload = await googleAdsJsonRequest<{
    results?: unknown[];
    partialFailureError?: unknown;
  }>(
    {
      customerId: resolveGoogleAdsCustomerId(input, context),
      developerToken: resolveGoogleAdsDeveloperToken(input, context),
      path: "/campaigns:mutate",
      body: compactObject({
        operations,
        validateOnly: optionalBoolean(input.validateOnly),
        partialFailure: optionalBoolean(input.partialFailure),
        responseContentType: normalizeResponseContentType(input.responseContentType),
      }),
    },
    context,
  );
  const results = normalizeCampaignMutationResults(payload.results);

  return compactObject({
    results,
    successfulCount: results.length,
    totalOperationsCount: operations.length,
    partialFailureError: optionalRecord(payload.partialFailureError),
  });
}

async function googleAdsSearch(
  input: {
    customerId: string;
    developerToken: string;
    query: string;
  },
  context: GoogleAdsRuntimeContext,
): Promise<SearchRow[]> {
  const payload = await googleAdsSearchPayload(input, context);
  return payload.results;
}

async function googleAdsSearchPayload(
  input: {
    customerId: string;
    developerToken: string;
    query: string;
    pageToken?: string;
  },
  context: GoogleAdsRuntimeContext,
): Promise<{ results: SearchRow[]; nextPageToken: string | null }> {
  const payload = await googleAdsJsonRequest<{
    results?: unknown[];
    nextPageToken?: string | null;
  }>(
    {
      customerId: input.customerId,
      developerToken: input.developerToken,
      path: "/googleAds:search",
      body: compactObject({
        query: input.query,
        pageToken: input.pageToken,
      }),
    },
    context,
  );

  return {
    results: Array.isArray(payload.results) ? payload.results.map((item) => asObject(item, "search result")) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function googleAdsJsonRequest<T>(
  input: {
    customerId?: string;
    developerToken: string;
    path: string;
    body?: Record<string, unknown>;
    method?: string;
  },
  context: GoogleAdsRuntimeContext,
): Promise<T> {
  const response = await googleAdsRequest(input, context);
  return (await response.json()) as T;
}

async function googleAdsRequest(
  input: {
    customerId?: string;
    developerToken: string;
    path: string;
    body?: Record<string, unknown>;
    method?: string;
  },
  context: GoogleAdsRuntimeContext,
): Promise<Response> {
  return googleRequest(buildGoogleAdsUrl(input.customerId, input.path), {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    method: input.method,
    headers: {
      "developer-token": input.developerToken,
    },
    body: input.body,
  });
}

function normalizeCampaign(row: SearchRow): Record<string, unknown> {
  const campaign = asObject(row.campaign, "campaign");
  return compactObject({
    resourceName: requireNonEmptyString(campaign.resourceName, "campaign.resourceName"),
    id: requireNonEmptyString(campaign.id, "campaign.id"),
    name: requireNonEmptyString(campaign.name, "campaign.name"),
    status: optionalString(campaign.status),
    advertisingChannelType: optionalString(campaign.advertisingChannelType),
    advertisingChannelSubType: optionalString(campaign.advertisingChannelSubType),
    startDate: optionalString(campaign.startDate),
    endDate: optionalString(campaign.endDate),
  });
}

function normalizeCustomerList(row: SearchRow): Record<string, unknown> {
  const userList = asObject(row.userList, "userList");
  return compactObject({
    resourceName: requireNonEmptyString(userList.resourceName, "userList.resourceName"),
    id: requireNonEmptyString(userList.id, "userList.id"),
    name: requireNonEmptyString(userList.name, "userList.name"),
    description: optionalString(userList.description),
    type: optionalString(userList.type),
    readOnly: optionalBoolean(userList.readOnly),
    membershipStatus: optionalString(userList.membershipStatus),
    sizeForSearch: optionalString(userList.sizeForSearch),
    sizeForDisplay: optionalString(userList.sizeForDisplay),
  });
}

function normalizeAdGroupOperations(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "operations").map((operation) => {
    const create = optionalRecord(operation.create);
    if (create) {
      return {
        create: compactObject({
          name: requireNonEmptyString(create.name, "create.name"),
          campaign: requireNonEmptyString(create.campaign, "create.campaign"),
          status: optionalString(create.status),
          type: optionalString(create.type),
        }),
      };
    }

    const update = optionalRecord(operation.update);
    if (update) {
      const normalizedUpdate = compactObject({
        resourceName: requireNonEmptyString(update.resourceName, "update.resourceName"),
        name: optionalString(update.name),
        status: optionalString(update.status),
      });
      const updateMask = buildUpdateMask(normalizedUpdate, ["resourceName"]);
      if (!updateMask) {
        throw new ProviderRequestError(400, "ad group update requires at least one mutable field");
      }
      return {
        update: normalizedUpdate,
        updateMask,
      };
    }

    return {
      remove: requireNonEmptyString(operation.remove, "remove"),
    };
  });
}

function normalizeCampaignOperations(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "operations").map((operation) => {
    const operationType = requireNonEmptyString(operation.operationType, "operationType");
    switch (operationType) {
      case "create":
        return {
          create: normalizeCampaignMutationData(asObject(operation.create, "create"), "create"),
        };
      case "update": {
        const normalizedUpdate = normalizeCampaignMutationData(asObject(operation.update, "update"), "update");
        const updateMask = buildUpdateMask(normalizedUpdate, ["resourceName"]);
        if (!updateMask) {
          throw new ProviderRequestError(400, "campaign update requires at least one mutable field");
        }
        return {
          update: normalizedUpdate,
          updateMask,
        };
      }
      case "remove":
        return {
          remove: requireNonEmptyString(operation.remove, "remove"),
        };
      default:
        throw new ProviderRequestError(400, `unsupported operationType: ${operationType}`);
    }
  });
}

function normalizeCampaignMutationData(
  value: Record<string, unknown>,
  mode: "create" | "update",
): Record<string, unknown> {
  return compactObject({
    ...(mode === "update"
      ? {
          resourceName: requireNonEmptyString(value.resourceName, "update.resourceName"),
        }
      : {}),
    name: mode === "create" ? requireNonEmptyString(value.name, "create.name") : optionalString(value.name),
    status: normalizeOptionalEnumValue(value.status, "status", campaignStatusAliases),
    startDate: optionalString(value.startDate),
    endDate: optionalString(value.endDate),
    manualCpc: optionalRecord(value.manualCpc),
    campaignBudget:
      mode === "create"
        ? requireNonEmptyString(value.campaignBudget, "create.campaignBudget")
        : optionalString(value.campaignBudget),
    finalUrlSuffix: optionalString(value.finalUrlSuffix),
    networkSettings: normalizeCampaignNetworkSettings(value.networkSettings),
    trackingUrlTemplate: optionalString(value.trackingUrlTemplate),
    urlCustomParameters: normalizeUrlCustomParameters(value.urlCustomParameters),
    geoTargetTypeSetting: normalizeGeoTargetTypeSetting(value.geoTargetTypeSetting),
    advertisingChannelType:
      mode === "create"
        ? normalizeRequiredEnumValue(
            value.advertisingChannelType,
            "create.advertisingChannelType",
            advertisingChannelTypeAliases,
          )
        : normalizeOptionalEnumValue(
            value.advertisingChannelType,
            "advertisingChannelType",
            advertisingChannelTypeAliases,
          ),
    campaignBiddingStrategy: optionalString(value.campaignBiddingStrategy),
    containsEuPoliticalAdvertising: normalizeOptionalEnumValue(
      value.containsEuPoliticalAdvertising,
      "containsEuPoliticalAdvertising",
      euPoliticalAdvertisingAliases,
    ),
  });
}

function normalizeCampaignNetworkSettings(value: unknown): Record<string, unknown> | undefined {
  const settings = optionalRecord(value);
  if (!settings) {
    return undefined;
  }

  return compactObject({
    targetYoutube: optionalBoolean(settings.targetYoutube),
    targetGoogleSearch: optionalBoolean(settings.targetGoogleSearch),
    targetSearchNetwork: optionalBoolean(settings.targetSearchNetwork),
    targetContentNetwork: optionalBoolean(settings.targetContentNetwork),
    targetGoogleTvNetwork: optionalBoolean(settings.targetGoogleTvNetwork),
    targetPartnerSearchNetwork: optionalBoolean(settings.targetPartnerSearchNetwork),
  });
}

function normalizeUrlCustomParameters(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const parameter = asObject(item, "urlCustomParameters item");
    return {
      key: requireNonEmptyString(parameter.key, "urlCustomParameters.key"),
      value: requireNonEmptyString(parameter.value, "urlCustomParameters.value"),
    };
  });
}

function normalizeGeoTargetTypeSetting(value: unknown): Record<string, unknown> | undefined {
  const settings = optionalRecord(value);
  if (!settings) {
    return undefined;
  }

  return compactObject({
    negativeGeoTargetType: normalizeOptionalEnumValue(
      settings.negativeGeoTargetType,
      "geoTargetTypeSetting.negativeGeoTargetType",
      geoTargetTypeAliases,
    ),
    positiveGeoTargetType: normalizeOptionalEnumValue(
      settings.positiveGeoTargetType,
      "geoTargetTypeSetting.positiveGeoTargetType",
      geoTargetTypeAliases,
    ),
  });
}

function normalizeResourceMutationResults(value: unknown): Array<Record<string, string>> {
  return Array.isArray(value)
    ? value.map((item) => ({
        resourceName: requireNonEmptyString(asObject(item, "result").resourceName, "results.resourceName"),
      }))
    : [];
}

function normalizeCampaignMutationResults(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => {
        const result = asObject(item, "result");
        return compactObject({
          resourceName: requireNonEmptyString(result.resourceName, "results.resourceName"),
          campaign: optionalRecord(result.campaign),
        });
      })
    : [];
}

function buildUpdateMask(value: Record<string, unknown>, ignoredKeys: string[]): string {
  const ignored = new Set(ignoredKeys);
  return Object.keys(value)
    .filter((key) => !ignored.has(key))
    .join(",");
}

function buildGoogleAdsUrl(customerId: string | undefined, path: string): string {
  if (path.startsWith("/customers/") || path.startsWith("/customers:")) {
    return `${googleAdsApiBaseUrl}${path}`;
  }
  if (!customerId) {
    return `${googleAdsApiBaseUrl}${path}`;
  }
  return `${googleAdsApiBaseUrl}/customers/${customerId}${path}`;
}

function buildResourceMethodPath(resourceName: string, method: string): string {
  if (!resourceName.startsWith("customers/")) {
    throw new ProviderRequestError(400, `invalid resource name: ${resourceName}`);
  }
  return `/${resourceName}:${method}`;
}

function requireOperation(value: unknown): "create" | "remove" {
  return value === "remove" ? "remove" : "create";
}

function requireEmailList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "emails must include at least one item");
  }

  return value.map((item) => normalizeEmail(item));
}

function normalizeEmail(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) {
    throw new ProviderRequestError(400, "email must be a non-empty string");
  }
  return normalized;
}

function hashNormalizedEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function resolveGoogleAdsCustomerId(input: Record<string, unknown>, context: GoogleAdsRuntimeContext): string {
  return normalizeGoogleAdsId(input.customerId ?? context.customerId, "customerId");
}

function resolveGoogleAdsDeveloperToken(input: Record<string, unknown>, context: GoogleAdsRuntimeContext): string {
  return requireNonEmptyString(input.developerToken ?? context.developerToken, "developerToken");
}

function normalizeGoogleAdsId(value: unknown, fieldName: string): string {
  const raw = requireNonEmptyString(value, fieldName);
  let normalized = "";
  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      normalized += char;
      continue;
    }
    if (char === "-" || char === " ") {
      continue;
    }
    throw new ProviderRequestError(400, `${fieldName} must contain digits only`);
  }
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} must contain digits only`);
  }
  return normalized;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function normalizeSummaryRowSetting(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  return normalizeRequiredEnumValue(value, "summaryRowSetting", summaryRowSettingAliases);
}

function normalizeResponseContentType(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = requireNonEmptyString(value, "responseContentType");
  if (normalized !== "RESOURCE_NAME_ONLY" && normalized !== "MUTABLE_RESOURCE") {
    throw new ProviderRequestError(400, "responseContentType must be RESOURCE_NAME_ONLY or MUTABLE_RESOURCE");
  }
  return normalized;
}

function normalizeOptionalEnumValue(
  value: unknown,
  fieldName: string,
  aliases: Map<string, string>,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  return normalizeRequiredEnumValue(value, fieldName, aliases);
}

function normalizeRequiredEnumValue(value: unknown, fieldName: string, aliases: Map<string, string>): string {
  const normalized = requireNonEmptyString(value, fieldName);
  const resolved = aliases.get(normalized) ?? aliases.get(normalized.toUpperCase());
  if (!resolved) {
    throw new ProviderRequestError(400, `unsupported ${fieldName}: ${normalized}`);
  }
  return resolved;
}

function createUppercaseAliasMap(values: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const value of values) {
    aliases.set(value, value);
    aliases.set(value.toLowerCase(), value);
  }
  return aliases;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function asObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function parseScopeString(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? scope.split(/\s+/).filter((item) => item === googleAdsScope) : [];
}
