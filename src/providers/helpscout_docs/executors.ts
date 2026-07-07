import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { HelpscoutDocsActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "helpscout_docs";
const helpscoutDocsApiBaseUrl = "https://docsapi.helpscout.net/v1";

type HelpscoutDocsActionContext = ApiKeyProviderContext;
type HelpscoutDocsActionHandler = (
  input: Record<string, unknown>,
  context: HelpscoutDocsActionContext,
) => Promise<unknown>;

export const helpscoutDocsActionHandlers: Record<HelpscoutDocsActionName, HelpscoutDocsActionHandler> = {
  list_sites(input, context) {
    return executePagedRequest("sites", "sites", input, context);
  },
  list_collections(input, context) {
    return executePagedRequest("collections", "collections", input, context);
  },
  list_categories(input, context) {
    const collectionId = readRequiredString(input.collectionId, "collectionId");
    return executePagedRequest(
      `collections/${encodeURIComponent(collectionId)}/categories`,
      "categories",
      input,
      context,
    );
  },
  list_articles(input, context) {
    const collectionId = optionalString(input.collectionId);
    const categoryId = optionalString(input.categoryId);
    if ((collectionId && categoryId) || (!collectionId && !categoryId)) {
      throw new ProviderRequestError(400, "Provide exactly one of collectionId or categoryId.");
    }
    const path = collectionId
      ? `collections/${encodeURIComponent(collectionId)}/articles`
      : `categories/${encodeURIComponent(categoryId ?? "")}/articles`;
    return executePagedRequest(path, "articles", input, context);
  },
  search_articles(input, context) {
    return executePagedRequest(
      "search/articles",
      "articles",
      input,
      context,
      compactObject({
        query: readRequiredString(input.query, "query"),
        collectionId: optionalString(input.collectionId),
        siteId: optionalString(input.siteId),
        visibility: optionalString(input.visibility),
      }),
    );
  },
  async get_article(input, context): Promise<unknown> {
    const articleIdOrNumber = readRequiredString(input.articleIdOrNumber, "articleIdOrNumber");
    const payload = await helpscoutDocsGetJson(
      `articles/${encodeURIComponent(articleIdOrNumber)}`,
      context,
      compactObject({
        draft: optionalBoolean(input.draft) === undefined ? undefined : String(input.draft),
      }),
    );
    const article = optionalRecord(optionalRecord(payload)?.article);
    if (!article) {
      throw new ProviderRequestError(502, "Help Scout Docs article response is missing article.", payload);
    }
    return { article };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, helpscoutDocsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: helpscoutDocsApiBaseUrl,
  auth: {
    type: "api_key_basic",
    suffix: ":X",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await helpscoutDocsGetJson(
      "sites",
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      { page: "1", pageSize: "1" },
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Help Scout Docs API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: helpscoutDocsApiBaseUrl,
        validationEndpoint: "/sites",
      },
    };
  },
};

async function executePagedRequest(
  path: string,
  envelopeKey: string,
  input: Record<string, unknown>,
  context: HelpscoutDocsActionContext,
  query: Record<string, unknown> = {},
): Promise<unknown> {
  const payload = await helpscoutDocsGetJson(
    path,
    context,
    compactObject({
      ...query,
      page: readOptionalQueryNumber(input.page),
      pageSize: readOptionalQueryNumber(input.pageSize),
    }),
  );

  return normalizePagedPayload(payload, envelopeKey);
}

async function helpscoutDocsGetJson(
  path: string,
  context: Pick<HelpscoutDocsActionContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, unknown> = {},
): Promise<unknown> {
  const url = new URL(joinPath(path));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: helpscoutDocsHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Help Scout Docs request failed: ${error.message}` : "Help Scout Docs request failed",
    );
  }

  const payload = await readHelpScoutDocsPayload(response);
  if (!response.ok) {
    throw createHelpScoutDocsError(response, payload);
  }

  return payload;
}

function helpscoutDocsHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: helpscoutDocsAuthorization(apiKey),
    "user-agent": providerUserAgent,
  });
}

function helpscoutDocsAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
}

function normalizePagedPayload(
  payload: unknown,
  envelopeKey: string,
): {
  page: number | null;
  pages: number | null;
  count: number | null;
  items: Record<string, unknown>[];
} {
  const container = optionalRecord(optionalRecord(payload)?.[envelopeKey]);
  if (!container) {
    throw new ProviderRequestError(502, `Help Scout Docs response is missing ${envelopeKey}.`, payload);
  }
  return {
    page: optionalIntegerOrNull(container.page),
    pages: optionalIntegerOrNull(container.pages),
    count: optionalIntegerOrNull(container.count),
    items: Array.isArray(container.items) ? objectItems(container.items) : [],
  };
}

function objectItems(items: unknown[]): Array<Record<string, unknown>> {
  return items.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

async function readHelpScoutDocsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHelpScoutDocsError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractHelpScoutDocsErrorMessage(payload) ?? response.statusText ?? "Help Scout Docs request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractHelpScoutDocsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.Message);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalQueryNumber(value: unknown): string | undefined {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? undefined : String(numberValue);
}

function optionalIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function joinPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${helpscoutDocsApiBaseUrl}/${normalizedPath}`;
}
