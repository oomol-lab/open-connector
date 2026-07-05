import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { ElevioActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";

export const elevioApiBaseUrl = "https://api.elev.io/v1";

interface ElevioCredentialInput {
  apiKey: string;
  values: Record<string, string>;
}

interface ElevioContext {
  apiKey: string;
  jwt: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ElevioRequestPhase = "validate" | "execute";

export const elevioActionHandlers: Record<ElevioActionName, ProviderRuntimeHandler<ElevioContext>> = {
  list_categories(_input, context) {
    return listCategories(context);
  },
  get_category(input, context) {
    return getCategory(input, context);
  },
  list_articles(input, context) {
    return listArticles(input, context);
  },
  get_article(input, context) {
    return getArticle(input, context);
  },
  search_articles(input, context) {
    return searchArticles(input, context);
  },
};

export async function createElevioContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<ElevioContext> {
  const credential = await requireApiKeyCredential(context, "elevio");
  return {
    apiKey: credential.apiKey,
    jwt: requireElevioJwt(credential.values.jwt),
    fetcher,
    signal: context.signal,
  };
}

export async function validateElevioCredential(
  input: ElevioCredentialInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credentials = {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    jwt: requireElevioJwt(input.values.jwt),
    fetcher,
    signal,
  };
  const payload = await requestElevio("categories", {}, credentials, "validate");
  const object = readObject(payload, "Elevio returned invalid categories payload");
  const categories = readArray(object.categories, "Elevio returned invalid categories list");

  return {
    profile: {
      displayName: "Elevio API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: elevioApiBaseUrl,
      validationEndpoint: "/categories",
      categoryCount: categories.length,
    },
  };
}

async function listCategories(context: ElevioContext): Promise<unknown> {
  const payload = await requestElevio("categories", {}, context, "execute");
  const object = readObject(payload, "Elevio returned invalid categories payload");
  return {
    categories: readArray(object.categories, "Elevio returned invalid categories list"),
  };
}

async function getCategory(input: Record<string, unknown>, context: ElevioContext): Promise<unknown> {
  const id = readPositiveInteger(input.id, "id");
  const payload = await requestElevio(`categories/${id}`, {}, context, "execute");
  const object = readObject(payload, "Elevio returned invalid category payload");
  return {
    category: readObject(object.category, "Elevio returned invalid category object"),
  };
}

async function listArticles(input: Record<string, unknown>, context: ElevioContext): Promise<unknown> {
  const payload = await requestElevio(
    "articles",
    {
      query: compactObject({
        page: input.page,
        page_size: input.pageSize,
        status: input.status,
        from_created_at: input.fromCreatedAt,
        to_created_at: input.toCreatedAt,
        from_published_at: input.fromPublishedAt,
        to_published_at: input.toPublishedAt,
        "tag[]": input.tags,
      }),
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Elevio returned invalid articles payload");
  return compactObject({
    articles: readArray(object.articles, "Elevio returned invalid articles list"),
    page_number: optionalInteger(object.page_number),
    page_size: optionalInteger(object.page_size),
    total_pages: optionalInteger(object.total_pages),
    total_entries: optionalInteger(object.total_entries),
  });
}

async function getArticle(input: Record<string, unknown>, context: ElevioContext): Promise<unknown> {
  const id = readPositiveInteger(input.id, "id");
  const payload = await requestElevio(`articles/${id}`, {}, context, "execute");
  const object = readObject(payload, "Elevio returned invalid article payload");
  return {
    article: readObject(object.article, "Elevio returned invalid article object"),
  };
}

async function searchArticles(input: Record<string, unknown>, context: ElevioContext): Promise<unknown> {
  const languageCode = requiredString(
    input.languageCode,
    "languageCode",
    (message) => new ProviderRequestError(400, message),
  );
  return requestElevio(
    `search/${encodeURIComponent(languageCode)}`,
    {
      query: compactObject({
        query: input.query,
        page: input.page,
        rows: input.rows,
        "tag[]": input.tags,
        user_email: input.userEmail,
        group: input.groups,
        hash: input.hash,
        url: input.url,
      }),
    },
    context,
    "execute",
  );
}

async function requestElevio(
  path: string,
  input: {
    query?: Record<string, unknown>;
  },
  context: ElevioContext,
  phase: ElevioRequestPhase,
): Promise<unknown> {
  const url = new URL(path, `${elevioApiBaseUrl}/`);
  appendQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.jwt}`,
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: context.signal,
    });
    payload = await readElevioPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Elevio request failed: ${error.message}` : "Elevio request failed",
    );
  }

  if (!response.ok) {
    throw createElevioError(response, payload, phase);
  }

  return payload;
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, String(child));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readElevioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  if (!response.headers.get("content-type")?.includes("json")) {
    return text;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireElevioJwt(value: unknown): string {
  return requiredString(value, "jwt", (message) => new ProviderRequestError(400, message));
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value as number;
}

function createElevioError(response: Response, payload: unknown, phase: ElevioRequestPhase): ProviderRequestError {
  const status = response.status;
  const message = extractElevioErrorMessage(payload) ?? `Elevio request failed with ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractElevioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["message", "error_description", "error"]) {
    const value = object[key];
    const text = optionalString(value);
    if (text) {
      return text;
    }
    const nested = optionalRecord(value);
    const nestedMessage = optionalString(nested?.message);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  const errors = object.errors;
  if (Array.isArray(errors)) {
    const first = errors[0];
    const firstText = optionalString(first);
    if (firstText) {
      return firstText;
    }
    const firstObject = optionalRecord(first);
    const firstMessage = optionalString(firstObject?.message);
    if (firstMessage) {
      return firstMessage;
    }
  }

  return undefined;
}
