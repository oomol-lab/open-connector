import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ContentfulGraphqlActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "contentful_graphql";
const contentfulGraphqlGlobalApiBaseUrl = "https://graphql.contentful.com";
const contentfulGraphqlEuApiBaseUrl = "https://graphql.eu.contentful.com";
const contentfulGraphqlDefaultEnvironmentId = "master";
const contentfulGraphqlDefaultRegion = "global";
const contentfulGraphqlDefaultTimeoutMs = 30_000;

type ContentfulGraphqlRegion = "global" | "eu";
type ContentfulGraphqlPhase = "validate" | "execute";
type ContentfulGraphqlActionHandler = (
  input: Record<string, unknown>,
  context: ContentfulGraphqlActionContext,
) => Promise<unknown>;

interface ContentfulGraphqlActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  providerMetadata: Record<string, unknown>;
  providerValues: Record<string, string>;
  signal?: AbortSignal;
}

interface ContentfulGraphqlTarget {
  spaceId: string;
  environmentId: string;
  region: ContentfulGraphqlRegion;
}

interface ContentfulGraphqlResponse {
  payload: Record<string, unknown>;
  requestId?: string;
  queryCost?: number;
  rateLimitSecondLimit?: number;
  rateLimitReset?: number;
}

export const contentfulGraphqlActionHandlers: Record<ContentfulGraphqlActionName, ContentfulGraphqlActionHandler> = {
  execute_query(input, context) {
    return executeContentfulGraphqlQuery(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ContentfulGraphqlActionContext>({
  service,
  handlers: contentfulGraphqlActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ContentfulGraphqlActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      providerMetadata: credential.metadata,
      providerValues: credential.values,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateContentfulGraphqlCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateContentfulGraphqlCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<CredentialValidationResult> {
  const target: ContentfulGraphqlTarget = {
    spaceId: requiredString(values.spaceId, "spaceId", providerInputError),
    environmentId: optionalString(values.environmentId) ?? contentfulGraphqlDefaultEnvironmentId,
    region: readOptionalContentfulGraphqlRegion(values.region, "region") ?? contentfulGraphqlDefaultRegion,
  };
  const result = await requestContentfulGraphql({
    ...target,
    apiKey,
    fetcher,
    signal,
    body: {
      query: "{ __typename }",
    },
    phase: "validate",
  });

  const errors = readGraphqlErrors(result.payload);
  if (errors && errors.length > 0) {
    throw new ProviderRequestError(
      400,
      extractContentfulGraphqlErrorMessage(result.payload) ?? "Contentful GraphQL credential validation failed",
      result.payload,
    );
  }

  return {
    profile: {
      accountId: `${target.region}:${target.spaceId}:${target.environmentId}`,
      displayName: formatContentfulGraphqlAccountLabel(target),
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: getContentfulGraphqlApiBaseUrl(target.region),
      endpoint: buildContentfulGraphqlEndpoint(target),
      validationEndpoint: buildContentfulGraphqlPath(target),
      region: target.region,
      spaceId: target.spaceId,
      environmentId: target.environmentId,
      requestId: result.requestId,
      queryCost: result.queryCost,
    }),
  };
}

async function executeContentfulGraphqlQuery(
  input: Record<string, unknown>,
  context: ContentfulGraphqlActionContext,
): Promise<unknown> {
  const target: ContentfulGraphqlTarget = {
    spaceId:
      optionalString(input.spaceId) ??
      optionalString(context.providerValues.spaceId) ??
      requiredString(context.providerMetadata.spaceId, "spaceId", providerInputError),
    environmentId:
      optionalString(input.environmentId) ??
      optionalString(context.providerValues.environmentId) ??
      optionalString(context.providerMetadata.environmentId) ??
      contentfulGraphqlDefaultEnvironmentId,
    region:
      readOptionalContentfulGraphqlRegion(input.region, "region") ??
      readOptionalContentfulGraphqlRegion(context.providerValues.region, "region") ??
      readOptionalContentfulGraphqlRegion(context.providerMetadata.region, "region") ??
      contentfulGraphqlDefaultRegion,
  };
  const payload = await requestContentfulGraphql({
    ...target,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    body: compactObject({
      query: requiredString(input.query, "query", providerInputError),
      variables: readOptionalInputObject(input.variables, "variables"),
      operationName: optionalString(input.operationName),
    }),
    phase: "execute",
  });

  return normalizeContentfulGraphqlResponse(payload);
}

async function requestContentfulGraphql(input: {
  spaceId: string;
  environmentId: string;
  apiKey: string;
  fetcher: typeof fetch;
  body: Record<string, unknown>;
  phase: ContentfulGraphqlPhase;
  region: ContentfulGraphqlRegion;
  signal?: AbortSignal;
}): Promise<ContentfulGraphqlResponse> {
  const timeout = createProviderTimeout(input.signal, contentfulGraphqlDefaultTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildContentfulGraphqlEndpoint(input), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readContentfulGraphqlPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Contentful GraphQL request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Contentful GraphQL request failed: ${error.message}`
        : "Contentful GraphQL request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createContentfulGraphqlError(response.status, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Contentful GraphQL returned an invalid payload", payload);
  }

  return {
    payload: record,
    requestId: response.headers.get("x-contentful-request-id") ?? undefined,
    queryCost: readIntegerHeader(response.headers, "x-contentful-graphql-query-cost"),
    rateLimitSecondLimit: readIntegerHeader(response.headers, "x-contentful-ratelimit-second-limit"),
    rateLimitReset: readIntegerHeader(response.headers, "x-contentful-ratelimit-reset"),
  };
}

function normalizeContentfulGraphqlResponse(input: ContentfulGraphqlResponse): Record<string, unknown> {
  return compactObject({
    data: readOptionalGraphqlData(input.payload.data),
    errors: readGraphqlErrors(input.payload),
    extensions: readOptionalProviderObject(input.payload.extensions, "extensions"),
    requestId: input.requestId,
    queryCost: input.queryCost,
    rateLimitSecondLimit: input.rateLimitSecondLimit,
    rateLimitReset: input.rateLimitReset,
  });
}

function buildContentfulGraphqlEndpoint(input: ContentfulGraphqlTarget): string {
  return `${getContentfulGraphqlApiBaseUrl(input.region)}${buildContentfulGraphqlPath(input)}`;
}

function buildContentfulGraphqlPath(input: { spaceId: string; environmentId: string }): string {
  return `/content/v1/spaces/${encodeURIComponent(input.spaceId)}/environments/${encodeURIComponent(
    input.environmentId,
  )}`;
}

async function readContentfulGraphqlPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Contentful GraphQL returned invalid JSON");
  }
}

function createContentfulGraphqlError(
  status: number,
  payload: unknown,
  phase: ContentfulGraphqlPhase,
): ProviderRequestError {
  const message = extractContentfulGraphqlErrorMessage(payload) ?? `Contentful GraphQL request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractContentfulGraphqlErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return typeof payload === "string" && payload.trim() !== "" ? payload : undefined;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const firstError = Array.isArray(record.errors) ? optionalRecord(record.errors[0]) : undefined;
  return optionalString(firstError?.message);
}

function readGraphqlErrors(payload: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (payload.errors === undefined) {
    return undefined;
  }
  if (!Array.isArray(payload.errors)) {
    throw new ProviderRequestError(502, "Contentful GraphQL errors must be an array", payload);
  }

  return payload.errors.map((item) => {
    const error = optionalRecord(item);
    if (!error) {
      throw new ProviderRequestError(502, "Contentful GraphQL error entries must be objects", payload);
    }
    return error;
  });
}

function readOptionalGraphqlData(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Contentful GraphQL data must be an object or null", value);
  }
  return record;
}

function readOptionalInputObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = optionalRecord(value);
  if (!object) {
    throw providerInputError(`${fieldName} must be an object`);
  }
  return object;
}

function readOptionalProviderObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Contentful GraphQL ${fieldName} must be an object`, value);
  }
  return object;
}

function readOptionalContentfulGraphqlRegion(value: unknown, fieldName: string): ContentfulGraphqlRegion | undefined {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "global" || normalized === "eu") {
    return normalized;
  }
  throw providerInputError(`${fieldName} must be global or eu`);
}

function readIntegerHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getContentfulGraphqlApiBaseUrl(region: ContentfulGraphqlRegion): string {
  return region === "eu" ? contentfulGraphqlEuApiBaseUrl : contentfulGraphqlGlobalApiBaseUrl;
}

function formatContentfulGraphqlAccountLabel(input: ContentfulGraphqlTarget): string {
  const regionLabel = input.region === "eu" ? " EU" : "";
  return `Contentful GraphQL${regionLabel} ${input.spaceId}/${input.environmentId}`;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
