import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "enigma";
const enigmaGraphqlApiUrl = "https://api.enigma.com/graphql";
const enigmaKybApiUrl = "https://api.enigma.com/v2/kyb/";

type EnigmaRequestPhase = "validate" | "execute";
type EnigmaEntityType = "BRAND" | "OPERATING_LOCATION" | "LEGAL_ENTITY";
type EnigmaListType = "LIST_GENERATION" | "ENRICHMENT";

interface EnigmaGraphqlResponse<TData> {
  data: TData;
  extensions: Record<string, unknown>;
  status: number;
}

type EnigmaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const enigmaSearchMetadataSelection = `
  website { rank matched }
  phoneNumber { rank matched }
  fullTextName { rank matched }
  trigramName { rank matched }
  embedding { rank matched }
  prompt { rank matched }
  address { rank }
  addressStreet1 { matched }
  addressStreet2 { matched }
  addressCity { matched }
  addressState { matched }
  addressPostalCode { matched }
`;

const enigmaAddressSelection = `
  id
  fullAddress
  streetAddress1
  streetAddress2
  city
  state
  postalCode
  countryCode
  latitude
  longitude
`;

const enigmaRelatedEntitySelection = `
  __typename
  id
  enigmaId
  names(first: 3) {
    edges {
      node {
        name
      }
    }
  }
`;

const enigmaCardTransactionSelection = `
  periodStartDate
  periodEndDate
  projectedQuantity
  quantityType
`;

const enigmaSummaryEntitySelection = `
  ... on Brand {
    __typename
    id
    enigmaId
    searchMetadata { ${enigmaSearchMetadataSelection} }
    names(first: 5) { edges { node { name } } }
    websites(first: 5) { edges { node { website } } }
    legalEntities(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
    operatingLocations(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
    cardTransactions(first: 3) { edges { node { ${enigmaCardTransactionSelection} } } }
  }
  ... on OperatingLocation {
    __typename
    id
    enigmaId
    searchMetadata { ${enigmaSearchMetadataSelection} }
    names(first: 5) { edges { node { name } } }
    websites(first: 5) { edges { node { website } } }
    phoneNumbers(first: 5) { edges { node { phoneNumber } } }
    addresses(first: 5) { edges { node { ${enigmaAddressSelection} } } }
    brands(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
    legalEntities(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
    operatingStatuses(first: 5) { edges { node { operatingStatus } } }
    cardTransactions(first: 3) { edges { node { ${enigmaCardTransactionSelection} } } }
  }
  ... on LegalEntity {
    __typename
    id
    enigmaId
    searchMetadata { ${enigmaSearchMetadataSelection} }
    names(first: 5) { edges { node { name } } }
    addresses(first: 5) { edges { node { ${enigmaAddressSelection} } } }
    brands(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
    operatingLocations(first: 5) { edges { node { ${enigmaRelatedEntitySelection} } } }
  }
`;

const enigmaDetailedEntitySelection = `
  ${enigmaSummaryEntitySelection}
  ... on Brand {
    industries(first: 10) { edges { node { industryType industryCode industryDesc } } }
  }
  ... on LegalEntity {
    persons(first: 10) { edges { node { firstName lastName fullName dateOfBirth } } }
    registeredEntities(first: 10) { edges { node { name registeredEntityType formationDate formationYear } } }
    tins(first: 10) { edges { node { tin tinType validity } } }
  }
`;

const enigmaSearchQuery = `
  query Search($searchInput: SearchInput!) {
    search(searchInput: $searchInput) {
      ${enigmaSummaryEntitySelection}
    }
  }
`;

const enigmaGetBusinessQuery = `
  query Search($searchInput: SearchInput!) {
    search(searchInput: $searchInput) {
      ${enigmaDetailedEntitySelection}
    }
  }
`;

const enigmaAggregateQuery = `
  query Aggregate($searchInput: SearchInput!, $countField: String!, $countConditions: Conditions) {
    aggregate(searchInput: $searchInput) {
      count(field: $countField, conditions: $countConditions)
    }
  }
`;

const enigmaGetAccountQuery = `
  query GetAccount {
    account {
      customerId
      pricingPlan
      customerEmail
      autoRenewEnabled
      billingAccountId
      creditsAvailable
      autoRechargeLimitUsd
      autoRechargeCurrentState
      autoRechargeDesiredState
      autoRechargeThresholdAmount
      autoRechargeRechargeToAmount
      autoRechargeReenableAfterTimestamp
    }
  }
`;

const enigmaSearchListsQuery = `
  query SearchLists($input: SearchListsInput) {
    lists(input: $input) {
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      edges {
        cursor
        node {
          id
          listType
          name
          description
          searchInput
          createdTimestamp
          updatedTimestamp
          fileFormat
          inputFileUri
          columnCounts { fullyQualifiedName count }
          fieldAliases { fullyQualifiedName aliasName }
          columnOrdering
          columnMapping { columnName searchField }
        }
      }
    }
  }
`;

const enigmaCreateListMutation = `
  mutation CreateList($input: CreateListInput!) {
    createList(input: $input) {
      list {
        id
        listType
        name
        description
        searchInput
        createdTimestamp
        updatedTimestamp
        fileFormat
        inputFileUri
        columnCounts { fullyQualifiedName count }
        fieldAliases { fullyQualifiedName aliasName }
        columnOrdering
        columnMapping { columnName searchField }
      }
      search { ${enigmaSummaryEntitySelection} }
    }
  }
`;

const enigmaDeleteListMutation = `
  mutation DeleteList($input: DeleteListInput!) {
    deleteList(input: $input) { id }
  }
`;

const enigmaBackgroundTaskQuery = `
  query BackgroundTask($id: String!) {
    backgroundTask(id: $id) {
      id
      backgroundTaskType
      status
      createdTimestamp
      updatedTimestamp
      lastExecutionTimestamp
      nextExecutionTimestamp
      lastError
      executionAttempts
      args
      result
    }
  }
`;

const enigmaListMaterializationQuery = `
  query ListMaterialization($input: GetListMaterializationInput!) {
    listMaterialization(input: $input) {
      id
      listId
      createdTimestamp
      status
      updatedTimestamp
      searchInput
      fieldAliases { fullyQualifiedName aliasName }
      columnOrdering
      columnCounts { fullyQualifiedName count }
      columnMapping { columnName searchField }
      inputFileUri
      listType
      resourceUri
      progressPercentComplete
      progressMessage
      metrics(first: 50) { edges { node { metricName columnName metricValue } } }
      billingEventDetails(first: 50) { edges { node { id listMaterializationId pricingTier quantity entityType } } }
    }
  }
`;

const enigmaSchemaExtendedQuery = `
  query SchemaExtended {
    _schemaExtended {
      types {
        name
        label
        description
        descriptionSimplified
        pricingTier
        fields { name label description descriptionSimplified pricingTier }
      }
      projections { entity name label description fields path filter aggregation }
      dataAssetMetadata { namespace name value description }
    }
  }
`;

const enigmaCreateSuggestionMutation = `
  mutation CreateSuggestion($suggestion: SuggestionInput!) {
    createSuggestion(suggestion: $suggestion) {
      suggestion {
        id
        revision
        requestId
        payload
        createdTimestamp
        suggestedByEmail
        lastModifiedByEmail
        status
      }
    }
  }
`;

const enigmaActionHandlers: ProviderActionHandlers<"enigma", EnigmaActionHandler> = {
  get_account(_input, context) {
    return enigmaGetAccount(context.apiKey, context.fetcher, context.signal, "execute");
  },
  search_graphql(input, context) {
    return enigmaSearchGraphql(input, context);
  },
  get_business(input, context) {
    return enigmaGetBusiness(input, context);
  },
  get_aggregate_counts(input, context) {
    return enigmaGetAggregateCounts(input, context);
  },
  search_lists(input, context) {
    return enigmaSearchLists(input, context);
  },
  create_list(input, context) {
    return enigmaCreateList(input, context);
  },
  delete_list(input, context) {
    return enigmaDeleteList(input, context);
  },
  get_background_task(input, context) {
    return enigmaGetBackgroundTask(input, context);
  },
  get_list_materialization(input, context) {
    return enigmaGetListMaterialization(input, context);
  },
  get_graphql_schema_extended(_input, context) {
    return enigmaGetGraphqlSchemaExtended(context);
  },
  create_suggestion(input, context) {
    return enigmaCreateSuggestion(input, context);
  },
  verify_business_v2(input, context) {
    return enigmaVerifyBusinessV2(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, enigmaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = await enigmaGetAccount(input.apiKey, fetcher, signal, "validate");
    const accountId = optionalString(account.customerId) ?? optionalString(account.customerEmail) ?? "enigma-account";
    const displayName = optionalString(account.customerEmail) ?? optionalString(account.customerId) ?? "Enigma API Key";
    return {
      profile: {
        accountId,
        displayName,
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/graphql",
        account,
      },
    };
  },
};

async function enigmaGetAccount(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: EnigmaRequestPhase,
): Promise<Record<string, string | number | boolean | null>> {
  const response = await enigmaGraphqlRequest<{ account?: unknown }>(
    apiKey,
    enigmaGetAccountQuery,
    {},
    fetcher,
    signal,
    phase,
  );

  return normalizeAccount(response.data.account);
}

async function enigmaSearchGraphql(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ search?: unknown }>(
    context.apiKey,
    enigmaSearchQuery,
    {
      searchInput: buildSearchInput(input, { allowOutput: true }),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  return {
    accepted: response.status === 202,
    results: normalizeUnknownArray(response.data.search),
    backgroundTasks: normalizeUnknownArray(response.extensions.backgroundTasks),
  };
}

async function enigmaGetBusiness(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const searchInput = compactObject({
    id: pickRequiredString(input, "id"),
    entityType: pickRequiredEntityType(input, "entityType", "entity_type"),
    conditions: {
      limit: 1,
    },
  });
  const response = await enigmaGraphqlRequest<{ search?: unknown }>(
    context.apiKey,
    enigmaGetBusinessQuery,
    { searchInput },
    context.fetcher,
    context.signal,
    "execute",
  );

  const results = normalizeUnknownArray(response.data.search);
  return {
    business: results[0] ?? null,
  };
}

async function enigmaGetAggregateCounts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const countField = resolveAggregateCountField(input);
  const response = await enigmaGraphqlRequest<{ aggregate?: { count?: unknown } }>(
    context.apiKey,
    enigmaAggregateQuery,
    {
      searchInput: buildSearchInput(input),
      countField,
      countConditions: normalizeConditions(pickOptionalObject(input, "countConditions", "count_conditions")),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  return {
    countField,
    count: optionalInteger(response.data.aggregate?.count) ?? null,
  };
}

async function enigmaSearchLists(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ lists?: unknown }>(
    context.apiKey,
    enigmaSearchListsQuery,
    {
      input: buildSearchListsInput(input),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  const listsRecord = optionalRecord(response.data.lists);
  return {
    lists: normalizeConnectionNodes(listsRecord?.edges),
    pageInfo: normalizePageInfo(listsRecord?.pageInfo),
  };
}

async function enigmaCreateList(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ createList?: unknown }>(
    context.apiKey,
    enigmaCreateListMutation,
    {
      input: buildCreateListInput(input),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  const payload = optionalRecord(response.data.createList);
  return {
    list: payload?.list ?? null,
    searchPreview: normalizeUnknownArray(payload?.search)[0] ?? null,
  };
}

async function enigmaDeleteList(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ deleteList?: { id?: unknown } }>(
    context.apiKey,
    enigmaDeleteListMutation,
    {
      input: {
        id: pickRequiredString(input, "id"),
      },
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  const deletedId = optionalString(response.data.deleteList?.id);
  if (!deletedId) {
    throw new ProviderRequestError(502, "malformed Enigma delete_list response");
  }

  return {
    id: deletedId,
  };
}

async function enigmaGetBackgroundTask(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ backgroundTask?: unknown }>(
    context.apiKey,
    enigmaBackgroundTaskQuery,
    {
      id: pickRequiredString(input, "id"),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  return {
    backgroundTask: response.data.backgroundTask ?? null,
  };
}

async function enigmaGetListMaterialization(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ listMaterialization?: unknown }>(
    context.apiKey,
    enigmaListMaterializationQuery,
    {
      input: {
        id: pickRequiredString(input, "id"),
      },
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  return {
    listMaterialization: response.data.listMaterialization ?? null,
  };
}

async function enigmaGetGraphqlSchemaExtended(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ _schemaExtended?: unknown }>(
    context.apiKey,
    enigmaSchemaExtendedQuery,
    {},
    context.fetcher,
    context.signal,
    "execute",
  );

  const schema = optionalRecord(response.data._schemaExtended);
  return {
    types: normalizeUnknownArray(schema?.types),
    projections: normalizeUnknownArray(schema?.projections),
    dataAssetMetadata: normalizeUnknownArray(schema?.dataAssetMetadata),
  };
}

async function enigmaCreateSuggestion(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await enigmaGraphqlRequest<{ createSuggestion?: unknown }>(
    context.apiKey,
    enigmaCreateSuggestionMutation,
    {
      suggestion: buildSuggestionInput(input),
    },
    context.fetcher,
    context.signal,
    "execute",
  );

  const payload = optionalRecord(response.data.createSuggestion);
  return {
    suggestion: normalizeSuggestion(payload?.suggestion),
  };
}

async function enigmaVerifyBusinessV2(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(enigmaKybApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": context.apiKey,
      },
      body: JSON.stringify(buildVerifyBusinessV2Body(input)),
      signal: context.signal,
    });
    payload = await readEnigmaPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Enigma request failed: ${error.message}` : "Enigma request failed",
    );
  }

  if (!response.ok) {
    throw createEnigmaError(response, payload, "execute");
  }

  return normalizeKybResponse(payload);
}

async function enigmaGraphqlRequest<TData>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: EnigmaRequestPhase,
): Promise<EnigmaGraphqlResponse<TData>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await fetcher(enigmaGraphqlApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal,
    });
    payload = await readEnigmaPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Enigma request failed: ${error.message}` : "Enigma request failed",
    );
  }

  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  if (!response.ok || errors.length > 0) {
    throw createEnigmaError(response, payload, phase);
  }

  return {
    data: (record?.data as TData | undefined) ?? ({} as TData),
    extensions: optionalRecord(record?.extensions) ?? {},
    status: response.status,
  };
}

async function readEnigmaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createEnigmaError(response: Response, payload: unknown, phase: EnigmaRequestPhase): ProviderRequestError {
  const status =
    extractGraphqlErrorStatus(payload) ??
    (response.status === 200 || response.status === 202 ? 400 : response.status || 500);
  const message = extractEnigmaErrorMessage(payload) ?? response.statusText ?? "Enigma request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(403, message);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractGraphqlErrorStatus(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  for (const error of errors) {
    const extensions = optionalRecord(optionalRecord(error)?.extensions);
    const status = optionalInteger(extensions?.status) ?? optionalInteger(extensions?.httpStatus);
    if (status !== undefined) {
      return status;
    }
  }

  return undefined;
}

function extractEnigmaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : [];
  const errorMessages = errors
    .map((item) => optionalString(optionalRecord(item)?.message))
    .filter((item): item is string => Boolean(item));
  if (errorMessages.length > 0) {
    return errorMessages.join("; ");
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function buildSearchInput(
  input: Record<string, unknown>,
  options: { allowOutput?: boolean } = {},
): Record<string, unknown> {
  const normalizedInput = compactObject({
    prompt: pickNonEmptyString(input, "prompt"),
    id: pickNonEmptyString(input, "id"),
    name: pickNonEmptyString(input, "name"),
    address: normalizeSearchAddress(pickOptionalObject(input, "address")),
    addresses: normalizeSearchAddresses(pickOptionalArray(input, "addresses")),
    person: normalizeSearchPerson(pickOptionalObject(input, "person")),
    phoneNumber: pickNonEmptyString(input, "phoneNumber"),
    website: pickNonEmptyString(input, "website"),
    conditions: normalizeConditions(pickOptionalObject(input, "conditions")),
    tin: normalizeTinInput(input.tin),
    matchThreshold: pickOptionalNumber(input, "matchThreshold"),
    entityType: pickOptionalEntityType(input, "entityType", "entity_type"),
    engine: pickNonEmptyString(input, "engine"),
    output: options.allowOutput ? normalizeOutputSpec(pickOptionalObject(input, "output")) : undefined,
    enrichmentIdsS3Path: pickNonEmptyString(input, "enrichmentIdsS3Path"),
  });

  const hasLookup =
    normalizedInput.prompt !== undefined ||
    normalizedInput.id !== undefined ||
    normalizedInput.name !== undefined ||
    normalizedInput.website !== undefined ||
    normalizedInput.phoneNumber !== undefined;
  if (!hasLookup) {
    throw new ProviderRequestError(400, "Provide at least one of prompt, id, name, website, or phoneNumber.");
  }
  if (normalizedInput.id !== undefined && normalizedInput.entityType === undefined) {
    throw new ProviderRequestError(400, "entityType is required when id is provided.");
  }

  return normalizedInput;
}

function buildSearchListsInput(input: Record<string, unknown>): Record<string, unknown> {
  const source = pickOptionalObject(input, "input") ?? input;
  return compactObject({
    id: pickNonEmptyString(source, "id"),
    name: pickNonEmptyString(source, "name"),
    conditions: normalizeConnectionConditions(pickOptionalObject(source, "conditions")),
    first: optionalInteger(source.first),
    after: pickNonEmptyString(source, "after"),
    last: optionalInteger(source.last),
    before: pickNonEmptyString(source, "before"),
  });
}

function buildCreateListInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = compactObject({
    name: pickNonEmptyString(input, "name"),
    listType: pickOptionalListType(input, "listType"),
    description: pickNonEmptyString(input, "description"),
    searchInput: normalizeListSearchInput(pickOptionalObject(input, "searchInput")),
    fileFormat: pickNonEmptyString(input, "fileFormat"),
    aliases: normalizeFieldAliasesInput(pickOptionalArray(input, "aliases")),
    columnOrdering: normalizeStringArrayValue(input.columnOrdering),
    columnMapping: normalizeColumnMappingsInput(pickOptionalArray(input, "columnMapping")),
    inputFileUri: pickNonEmptyString(input, "inputFileUri"),
  });
  if (normalized.searchInput === undefined && normalized.inputFileUri === undefined) {
    throw new ProviderRequestError(400, "Provide either searchInput or inputFileUri when creating a list.");
  }
  return normalized;
}

function buildSuggestionInput(input: Record<string, unknown>): Record<string, unknown> {
  const payload = optionalRecord(input.payload);
  if (!payload) {
    throw new ProviderRequestError(400, "payload must be an object");
  }

  return compactObject({
    suggestedByEmail: pickNonEmptyString(input, "suggestedByEmail"),
    payload,
    status: pickNonEmptyString(input, "status"),
    suggestedValue: normalizeJsonLikeValue(input.suggestedValue),
    ancestorIdentifier: normalizeEntityIdentifiers(input.ancestorIdentifier),
    suggestedEntityIdentifier: normalizeEntityIdentifier(input.suggestedEntityIdentifier),
    field: pickNonEmptyString(input, "field"),
  });
}

function buildVerifyBusinessV2Body(input: Record<string, unknown>): Record<string, unknown> {
  validateMutuallyExclusive(input, "name", "names");
  validateMutuallyExclusive(input, "address", "addresses");
  validateMutuallyExclusive(input, "website", "websites");
  return compactObject({
    package: pickNonEmptyString(input, "package"),
    attrs: normalizeKybAttrs(input.attrs),
    name: pickNonEmptyString(input, "name"),
    names: normalizeStringArrayValue(input.names),
    tin: pickNonEmptyString(input, "tin"),
    tins: normalizeStringArrayValue(input.tins),
    address: normalizeKybAddress(input.address),
    addresses: normalizeKybAddresses(input.addresses),
    person: normalizeKybPerson(input.person),
    persons_to_screen: normalizeKybPersons(input.personsToScreen),
    website: pickNonEmptyString(input, "website"),
    websites: normalizeStringArrayValue(input.websites),
    top_n: optionalInteger(input.topN),
    match_confidence: optionalNumber(input.matchConfidence),
  });
}

function validateMutuallyExclusive(input: Record<string, unknown>, left: string, right: string): void {
  if (input[left] !== undefined && input[right] !== undefined) {
    throw new ProviderRequestError(400, `Provide either ${left} or ${right}, not both.`);
  }
}

function resolveAggregateCountField(input: Record<string, unknown>): string {
  const requestedField = pickRequiredString(input, "countField", "count_field");
  const entityType = pickOptionalEntityType(input, "entityType", "entity_type") ?? "OPERATING_LOCATION";
  if (requestedField === "brand") {
    return entityType === "BRAND" ? "id" : "brands.id";
  }
  if (requestedField === "operatingLocation") {
    return entityType === "OPERATING_LOCATION" ? "id" : "operatingLocations.id";
  }
  if (requestedField === "legalEntity") {
    return entityType === "LEGAL_ENTITY" ? "id" : "legalEntities.id";
  }
  return requestedField;
}

function normalizeAccount(value: unknown): Record<string, string | number | boolean | null> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "malformed Enigma account response");
  }

  return {
    customerId: optionalString(record.customerId) ?? null,
    pricingPlan: optionalString(record.pricingPlan) ?? null,
    customerEmail: optionalString(record.customerEmail) ?? null,
    autoRenewEnabled: optionalBooleanOrNull(record.autoRenewEnabled),
    billingAccountId: optionalString(record.billingAccountId) ?? null,
    creditsAvailable: optionalBooleanOrNull(record.creditsAvailable),
    autoRechargeLimitUsd: optionalNumber(record.autoRechargeLimitUsd) ?? null,
    autoRechargeCurrentState: optionalBooleanOrNull(record.autoRechargeCurrentState),
    autoRechargeDesiredState: optionalBooleanOrNull(record.autoRechargeDesiredState),
    autoRechargeThresholdAmount: optionalNumber(record.autoRechargeThresholdAmount) ?? null,
    autoRechargeRechargeToAmount: optionalNumber(record.autoRechargeRechargeToAmount) ?? null,
    autoRechargeReenableAfterTimestamp: optionalString(record.autoRechargeReenableAfterTimestamp) ?? null,
  };
}

function normalizePageInfo(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    hasNextPage: optionalBoolean(record?.hasNextPage) ?? false,
    hasPreviousPage: optionalBoolean(record?.hasPreviousPage) ?? false,
    startCursor: optionalString(record?.startCursor) ?? null,
    endCursor: optionalString(record?.endCursor) ?? null,
  };
}

function normalizeSuggestion(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  const id = optionalString(record?.id);
  const revision = optionalString(record?.revision);
  const requestId = optionalString(record?.requestId);
  if (!record || !id || !revision || !requestId) {
    return null;
  }
  return {
    ...record,
    id,
    revision,
    requestId,
    payload: parseMaybeJson(record.payload),
  };
}

function normalizeKybResponse(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "malformed Enigma KYB response");
  }
  const riskSummary = optionalRecord(record.risk_summary ?? record.riskSummary);
  return {
    responseId: optionalString(record.response_id ?? record.responseId) ?? null,
    riskSummary: riskSummary
      ? {
          overallRisk: optionalString(riskSummary.overall_risk ?? riskSummary.overallRisk) ?? null,
          tasks: normalizeUnknownArray(riskSummary.tasks),
        }
      : undefined,
    registeredEntityMatchCount: normalizeUnknownArray(
      record.registered_entity_matches ?? record.registeredEntityMatches,
    ).length,
    brandMatchCount: normalizeUnknownArray(record.brand_matches ?? record.brandMatches).length,
    raw: record,
  };
}

function normalizeSearchAddress(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    id: pickNonEmptyString(value, "id"),
    street1: pickNonEmptyString(value, "street1"),
    street2: pickNonEmptyString(value, "street2"),
    city: pickNonEmptyString(value, "city"),
    state: pickNonEmptyString(value, "state"),
    postalCode: pickNonEmptyString(value, "postalCode"),
  });
}

function normalizeSearchAddresses(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => normalizeSearchAddress(optionalRecord(item)))
    .filter((item): item is Record<string, unknown> => item !== undefined);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSearchPerson(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    firstName: pickNonEmptyString(value, "firstName"),
    lastName: pickNonEmptyString(value, "lastName"),
    dateOfBirth: pickNonEmptyString(value, "dateOfBirth"),
    address: normalizeSearchAddress(pickOptionalObject(value, "address")),
    tin: normalizeTinInput(value.tin),
  });
}

function normalizeTinInput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return { tin: value.trim() };
  }

  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    tin: pickNonEmptyString(record, "tin"),
    tinType: pickNonEmptyString(record, "tinType"),
  });
}

function normalizeConditions(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    orderBy: normalizeStringArrayValue(value.orderBy) ?? value.orderBy,
    pageToken: pickNonEmptyString(value, "pageToken"),
    filter: optionalRecord(value.filter) ?? value.filter,
    limit: optionalInteger(value.limit),
  });
}

function normalizeConnectionConditions(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    orderBy: normalizeStringArrayValue(value.orderBy) ?? value.orderBy,
    filter: optionalRecord(value.filter) ?? value.filter,
  });
}

function normalizeOutputSpec(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    filename: pickNonEmptyString(value, "filename"),
    format: pickNonEmptyString(value, "format"),
  });
}

function normalizeListSearchInput(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return compactObject({
    entityType: pickOptionalEntityType(value, "entityType"),
    conditions: normalizeConditions(pickOptionalObject(value, "conditions")),
    prompt: pickNonEmptyString(value, "prompt"),
    matchThreshold: optionalNumber(value.matchThreshold),
  });
}

interface EnigmaFieldAliasInput {
  fullyQualifiedName: string;
  aliasName: string;
}

function normalizeFieldAliasesInput(value: unknown): EnigmaFieldAliasInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => {
      const record = optionalRecord(item);
      const fullyQualifiedName = pickNonEmptyString(record ?? {}, "fullyQualifiedName");
      const aliasName = pickNonEmptyString(record ?? {}, "aliasName");
      return fullyQualifiedName && aliasName ? { fullyQualifiedName, aliasName } : null;
    })
    .filter((item): item is EnigmaFieldAliasInput => item !== null);
  return normalized.length > 0 ? normalized : undefined;
}

interface EnigmaColumnMappingInput {
  columnName: string;
  searchField: string;
}

function normalizeColumnMappingsInput(value: unknown): EnigmaColumnMappingInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => {
      const record = optionalRecord(item);
      const columnName = pickNonEmptyString(record ?? {}, "columnName");
      const searchField = pickNonEmptyString(record ?? {}, "searchField");
      return columnName && searchField ? { columnName, searchField } : null;
    })
    .filter((item): item is EnigmaColumnMappingInput => item !== null);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEntityIdentifiers(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => normalizeEntityIdentifier(item))
    .filter((item): item is Record<string, string> => item !== undefined);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEntityIdentifier(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const id = pickNonEmptyString(record, "id");
  const type = pickOptionalEntityType(record, "entityType");
  return id && type ? { id, type } : undefined;
}

function normalizeKybAddress(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    street_address1: pickNonEmptyString(record, "streetAddress1"),
    street_address2: pickNonEmptyString(record, "streetAddress2"),
    city: pickNonEmptyString(record, "city"),
    state: pickNonEmptyString(record, "state"),
    postal_code: pickNonEmptyString(record, "postalCode"),
  });
}

function normalizeKybAddresses(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => normalizeKybAddress(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKybPerson(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    first_name: pickNonEmptyString(record, "firstName"),
    last_name: pickNonEmptyString(record, "lastName"),
    ssn: pickNonEmptyString(record, "ssn"),
  });
}

function normalizeKybPersons(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => normalizeKybPerson(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKybAttrs(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  return normalized.length > 0 ? normalized.join(",") : undefined;
}

function normalizeUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeConnectionNodes(value: unknown): unknown[] {
  const edges = Array.isArray(value) ? value : [];
  return edges.map((edge) => optionalRecord(edge)?.node).filter((node) => node !== undefined);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeJsonLikeValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return parseMaybeJson(value);
  }
  return value;
}

function pickOptionalObject(input: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = optionalRecord(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function pickOptionalArray(input: Record<string, unknown>, ...keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function pickOptionalNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optionalNumber(input[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function pickNonEmptyString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function pickRequiredString(input: Record<string, unknown>, ...keys: string[]): string {
  const value = pickNonEmptyString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function pickOptionalEntityType(input: Record<string, unknown>, ...keys: string[]): EnigmaEntityType | undefined {
  const value = pickNonEmptyString(input, ...keys);
  if (!value) {
    return undefined;
  }
  if (value === "BRAND" || value === "OPERATING_LOCATION" || value === "LEGAL_ENTITY") {
    return value;
  }
  throw new ProviderRequestError(400, `unsupported entity type: ${value}`);
}

function pickRequiredEntityType(input: Record<string, unknown>, ...keys: string[]): EnigmaEntityType {
  const value = pickOptionalEntityType(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${keys[0]} is required`);
  }
  return value;
}

function pickOptionalListType(input: Record<string, unknown>, ...keys: string[]): EnigmaListType | undefined {
  const value = pickNonEmptyString(input, ...keys);
  if (!value) {
    return undefined;
  }
  if (value === "LIST_GENERATION" || value === "ENRICHMENT") {
    return value;
  }
  throw new ProviderRequestError(400, `unsupported list type: ${value}`);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.enigma.com",
  auth: { type: "api_key_header", name: "x-api-key" },
  allowedEndpoint: providerProxyEndpointPrefixes("/graphql", "/v2/kyb"),
});
