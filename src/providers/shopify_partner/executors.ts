import type {
  CredentialValidationResult,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { ShopifyPartnerActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { partnerApiVersion } from "./constants.ts";

const service = "shopify_partner";
const shopifyPartnerApiOrigin = "https://partners.shopify.com";
const credentialHelpUrl = "https://shopify.dev/docs/api/partner/latest#create-a-partner-api-client";

const validateOrganizationQuery = `query ShopifyPartnerValidateOrganization {
  __typename
}`;

const getAppQuery = `query ShopifyPartnerGetApp($id: ID!) {
  app(id: $id) {
    id
    name
    apiKey
  }
}`;

const listAppEventsQuery = `query ShopifyPartnerListAppEvents(
  $appId: ID!
  $first: Int
  $after: String
  $chargeId: ID
  $occurredAtMin: DateTime
  $occurredAtMax: DateTime
  $shopId: ID
  $types: [AppEventTypes!]
) {
  app(id: $appId) {
    id
    name
    apiKey
    events(
      first: $first
      after: $after
      chargeId: $chargeId
      occurredAtMin: $occurredAtMin
      occurredAtMax: $occurredAtMax
      shopId: $shopId
      types: $types
    ) {
      edges {
        cursor
        node {
          __typename
          type
          occurredAt
          app {
            id
            name
            apiKey
          }
          shop {
            id
            name
            myshopifyDomain
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
    }
  }
}`;

const listPartnerEventsQuery = `query ShopifyPartnerListEvents(
  $first: Int
  $after: String
  $filter: EventFilterInput
  $orderBy: EventOrder
) {
  events(first: $first, after: $after, filter: $filter, orderBy: $orderBy) {
    edges {
      cursor
      node {
        __typename
        id
        eventType
        occurredAt
        shop {
          id
          name
          myshopifyDomain
        }
        subject {
          __typename
          ... on AppReference {
            id
            name
          }
          ... on ThemeReference {
            id
            name
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;

const listTransactionsQuery = `query ShopifyPartnerListTransactions(
  $first: Int
  $after: String
  $appId: ID
  $createdAtMin: DateTime
  $createdAtMax: DateTime
  $myshopifyDomain: String
  $shopId: ID
  $types: [TransactionType!]
) {
  transactions(
    first: $first
    after: $after
    appId: $appId
    createdAtMin: $createdAtMin
    createdAtMax: $createdAtMax
    myshopifyDomain: $myshopifyDomain
    shopId: $shopId
    types: $types
  ) {
    edges {
      cursor
      node {
        __typename
        id
        createdAt
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
  }
}`;

interface ShopifyPartnerGraphQLResponse {
  data?: unknown;
  errors?: unknown;
  extensions?: unknown;
}

interface ShopifyPartnerContext {
  apiKey: string;
  organizationId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ShopifyPartnerActionHandler = (input: Record<string, unknown>, context: ShopifyPartnerContext) => Promise<unknown>;

export const shopifyPartnerActionHandlers: Record<ShopifyPartnerActionName, ShopifyPartnerActionHandler> = {
  async get_app(input, context) {
    const payload = await requestShopifyPartnerGraphQL(context, {
      query: getAppQuery,
      variables: {
        id: input.id,
      },
    });
    const app = readNullableObject(readObject(payload.data, "data").app, "app");
    return { app: app ? normalizeApp(app) : null };
  },
  async list_app_events(input, context) {
    const payload = await requestShopifyPartnerGraphQL(context, {
      query: listAppEventsQuery,
      variables: buildListAppEventsVariables(input),
    });
    const app = readNullableObject(readObject(payload.data, "data").app, "app");
    if (!app) {
      return {
        app: null,
        events: [],
        pageInfo: normalizePageInfo(undefined),
      };
    }
    const events = readConnection(readObject(app.events, "events"), normalizeAppEvent);
    return {
      app: normalizeApp(app),
      events: events.items,
      pageInfo: events.pageInfo,
    };
  },
  async list_partner_events(input, context) {
    const payload = await requestShopifyPartnerGraphQL(context, {
      query: listPartnerEventsQuery,
      variables: buildListPartnerEventsVariables(input),
    });
    const connection = readConnection(
      readObject(readObject(payload.data, "data").events, "events"),
      normalizePartnerEvent,
      { includePageCursors: true },
    );
    return {
      events: connection.items,
      pageInfo: connection.pageInfo,
    };
  },
  async list_transactions(input, context) {
    const payload = await requestShopifyPartnerGraphQL(context, {
      query: listTransactionsQuery,
      variables: buildListTransactionsVariables(input),
    });
    const connection = readConnection(
      readObject(readObject(payload.data, "data").transactions, "transactions"),
      normalizeTransaction,
    );
    return {
      transactions: connection.items,
      pageInfo: connection.pageInfo,
    };
  },
  async execute_graphql(input, context) {
    const payload = await requestShopifyPartnerGraphQL(context, {
      query: requiredString(input.query, "query", (message) => new ProviderRequestError(400, message)),
      variables: optionalRecord(input.variables),
    });
    const data = readObject(payload.data, "data");
    const extensions = optionalRecord(payload.extensions);
    return compactObject({
      data,
      extensions,
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ShopifyPartnerContext>({
  service,
  handlers: shopifyPartnerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<ShopifyPartnerContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      organizationId: requiredCredentialValue(credential.values.organizationId, "organizationId"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildShopifyPartnerApiBaseUrl(requiredCredentialValue(credential.values.organizationId, "organizationId"));
  },
  auth: { type: "api_key_header", name: "x-shopify-access-token" },
});

export const credentialValidators = {
  async apiKey(
    input: { apiKey: string; values: Record<string, string> },
    { fetcher, signal }: { fetcher: ProviderFetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    const organizationId = requiredCredentialValue(input.values.organizationId, "organizationId");
    await requestShopifyPartnerGraphQL(
      {
        apiKey: input.apiKey,
        organizationId,
        fetcher,
        signal,
      },
      {
        query: validateOrganizationQuery,
      },
      "validate",
    );

    return {
      profile: {
        accountId: `shopify_partner:${organizationId}`,
        displayName: `Shopify Partner ${organizationId}`,
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        organizationId,
        apiBaseUrl: buildShopifyPartnerApiBaseUrl(organizationId),
        graphQLEndpoint: `/api/${partnerApiVersion}/graphql.json`,
        credentialHelpUrl,
      },
    };
  },
};

async function requestShopifyPartnerGraphQL(
  context: ShopifyPartnerContext,
  request: {
    query: string;
    variables?: Record<string, unknown>;
  },
  purpose: "execute" | "validate" = "execute",
): Promise<ShopifyPartnerGraphQLResponse> {
  let response: Response;
  try {
    response = await context.fetcher(buildShopifyPartnerGraphQLUrl(context.organizationId), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-shopify-access-token": context.apiKey,
      },
      body: JSON.stringify(
        compactJson({
          query: request.query,
          variables: request.variables,
        }),
      ),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `shopify_partner request failed: ${error.message}` : "shopify_partner request failed",
    );
  }

  const payload = await readShopifyPartnerJson(response, { allowInvalidJson: !response.ok });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ProviderRequestError(
        purpose === "validate" ? 400 : response.status,
        `shopify_partner GraphQL request failed with HTTP ${response.status}`,
        payload,
      );
    }

    throw new ProviderRequestError(
      response.status || 502,
      `shopify_partner GraphQL request failed with HTTP ${response.status}`,
      payload,
    );
  }

  const errors = readGraphQLErrors(payload.errors);
  if (errors.length > 0) {
    throw new ProviderRequestError(
      purpose === "validate" ? 400 : 502,
      `shopify_partner GraphQL error: ${errors.join("; ")}`,
      payload.errors,
    );
  }
  return payload;
}

function buildShopifyPartnerApiBaseUrl(organizationId: string): string {
  return `${shopifyPartnerApiOrigin}/${encodeURIComponent(organizationId)}/api/${partnerApiVersion}`;
}

function buildShopifyPartnerGraphQLUrl(organizationId: string): string {
  return `${buildShopifyPartnerApiBaseUrl(organizationId)}/graphql.json`;
}

async function readShopifyPartnerJson(
  response: Response,
  options: { allowInvalidJson?: boolean } = {},
): Promise<ShopifyPartnerGraphQLResponse> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as ShopifyPartnerGraphQLResponse;
  } catch {
    if (options.allowInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "shopify_partner returned invalid JSON");
  }
}

function readGraphQLErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    return optionalString(record?.message) ?? "unknown GraphQL error";
  });
}

function buildListAppEventsVariables(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    appId: input.appId,
    first: input.first,
    after: input.after,
    chargeId: input.chargeId,
    occurredAtMin: input.occurredAtMin,
    occurredAtMax: input.occurredAtMax,
    shopId: input.shopId,
    types: input.types,
  });
}

function buildListPartnerEventsVariables(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first: input.first,
    after: input.after,
    filter: input.filter,
    orderBy: input.orderBy,
  });
}

function buildListTransactionsVariables(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first: input.first,
    after: input.after,
    appId: input.appId,
    createdAtMin: input.createdAtMin,
    createdAtMax: input.createdAtMax,
    myshopifyDomain: input.myshopifyDomain,
    shopId: input.shopId,
    types: input.types,
  });
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `shopify_partner response missing ${fieldName}`);
  }
  return record;
}

function readNullableObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readObject(value, fieldName);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `shopify_partner response missing ${fieldName}`);
  }
  return value;
}

function normalizeApp(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readString(input.id, "app.id"),
    name: readString(input.name, "app.name"),
    apiKey: readString(input.apiKey, "app.apiKey"),
    raw: input,
  };
}

function normalizePageInfo(value: unknown, options: { includeCursors?: boolean } = {}): Record<string, unknown> {
  const pageInfo = optionalRecord(value) ?? {};
  const normalized = {
    hasNextPage: pageInfo.hasNextPage === true,
    hasPreviousPage: pageInfo.hasPreviousPage === true,
  };

  if (!options.includeCursors) {
    return normalized;
  }

  return {
    ...normalized,
    startCursor: typeof pageInfo.startCursor === "string" ? pageInfo.startCursor : null,
    endCursor: typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null,
  };
}

function readConnection<T>(
  connection: Record<string, unknown>,
  normalize: (node: Record<string, unknown>, cursor: string | null) => T,
  options: { includePageCursors?: boolean } = {},
): { items: T[]; pageInfo: Record<string, unknown> } {
  const edges = Array.isArray(connection.edges) ? connection.edges : [];
  return {
    items: edges.map((edge) => {
      const edgeObject = readObject(edge, "edge");
      const cursor = typeof edgeObject.cursor === "string" ? edgeObject.cursor : null;
      return normalize(readObject(edgeObject.node, "edge.node"), cursor);
    }),
    pageInfo: normalizePageInfo(connection.pageInfo, {
      includeCursors: options.includePageCursors,
    }),
  };
}

function normalizeShopReference(value: unknown): Record<string, unknown> {
  const shop = readObject(value, "shop");
  return {
    id: readString(shop.id, "shop.id"),
    name: readString(shop.name, "shop.name"),
    myshopifyDomain: readString(shop.myshopifyDomain, "shop.myshopifyDomain"),
  };
}

function normalizePartnerEvent(input: Record<string, unknown>, cursor: string | null): Record<string, unknown> {
  const subject = optionalRecord(input.subject);
  return compactObject({
    id: readString(input.id, "event.id"),
    eventType: readString(input.eventType, "event.eventType"),
    occurredAt: readString(input.occurredAt, "event.occurredAt"),
    shop: input.shop ? normalizeShopReference(input.shop) : null,
    subjectType: optionalString(subject?.__typename),
    subjectId: optionalString(subject?.id),
    subjectName: optionalString(subject?.name),
    cursor,
    raw: input,
  });
}

function normalizeAppEvent(input: Record<string, unknown>, cursor: string | null): Record<string, unknown> {
  return {
    type: readString(input.type, "appEvent.type"),
    occurredAt: readString(input.occurredAt, "appEvent.occurredAt"),
    app: normalizeApp(readObject(input.app, "appEvent.app")),
    shop: normalizeShopReference(input.shop),
    cursor,
    raw: input,
  };
}

function normalizeTransaction(input: Record<string, unknown>, cursor: string | null): Record<string, unknown> {
  return compactObject({
    id: readString(input.id, "transaction.id"),
    createdAt: readString(input.createdAt, "transaction.createdAt"),
    type: optionalString(input.__typename),
    cursor,
    raw: input,
  });
}

function requiredCredentialValue(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
