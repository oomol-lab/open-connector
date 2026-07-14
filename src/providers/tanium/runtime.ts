import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { TaniumActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const taniumGatewayPath = "/plugin/products/gateway/graphql";

const taniumRequestTimeoutMs = 30_000;
const taniumValidationOperationName = "OomolConnectValidation";
const taniumValidationQuery = "query OomolConnectValidation { __typename }";

type TaniumPhase = "validate" | "execute";
type TaniumActionHandler = (input: Record<string, unknown>, context: TaniumContext) => Promise<unknown>;

export interface TaniumContext {
  apiKey: string;
  gatewayUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface TaniumGraphqlPayload {
  data?: unknown;
  errors?: unknown;
  extensions?: unknown;
  error?: unknown;
  message?: unknown;
}

export const taniumActionHandlers: Record<TaniumActionName, TaniumActionHandler> = {
  async execute_graphql(input, context) {
    const payload = await requestTaniumGraphql({
      gatewayUrl: context.gatewayUrl,
      apiKey: context.apiKey,
      operationName: optionalString(input.operationName),
      query: requiredString(input.query, "query", requestInputError),
      variables: optionalRecord(input.variables),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return normalizeTaniumGraphqlResult(payload);
  },
};

export async function validateTaniumCredential(
  input: { apiKey: string; gatewayUrl?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", requestInputError);
  const gatewayUrl = normalizeTaniumGatewayUrl(input.gatewayUrl);
  const payload = await requestTaniumGraphql({
    gatewayUrl,
    apiKey,
    operationName: taniumValidationOperationName,
    query: taniumValidationQuery,
    phase: "validate",
    fetcher,
    signal,
  });
  const errors = readGraphqlErrors(payload.errors);
  if (errors && errors.length > 0) {
    throw createTaniumGraphqlError(errors, "validate");
  }

  const url = new URL(gatewayUrl);
  return {
    profile: {
      accountId: `tanium:${url.host}:${buildTokenFingerprint(apiKey)}`,
      displayName: `Tanium Gateway (${url.hostname})`,
    },
    grantedScopes: [],
    metadata: {
      gatewayUrl,
      gatewayOrigin: url.origin,
      validationEndpoint: url.pathname,
    },
  };
}

// Private-network egress is gated by deployment config; see isPrivateNetworkAccessAllowed.
export function normalizeTaniumGatewayUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "gatewayUrl is required");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "gatewayUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "gatewayUrl must be an HTTPS URL");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "gatewayUrl must not include credentials");
  }

  url.hash = "";
  url.search = "";
  while (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  if (url.pathname !== taniumGatewayPath) {
    throw new ProviderRequestError(400, "gatewayUrl must be a Tanium Gateway GraphQL endpoint");
  }

  return assertPublicHttpUrl(url.toString(), {
    fieldName: "gatewayUrl",
    createError: requestInputError,
    allowPrivateNetwork,
  }).toString();
}

async function requestTaniumGraphql(input: {
  gatewayUrl: string;
  apiKey: string;
  query: string;
  phase: TaniumPhase;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  operationName?: string;
  variables?: Record<string, unknown>;
}): Promise<TaniumGraphqlPayload> {
  const timeout = createProviderTimeout(input.signal, taniumRequestTimeoutMs);
  try {
    const response = await input.fetcher(input.gatewayUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        session: input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(
        compactObject({
          operationName: input.operationName,
          query: input.query,
          variables: input.variables,
        }),
      ),
      signal: timeout.signal,
    });
    const payload = await readTaniumPayload(response);
    if (!response.ok) {
      throw createTaniumHttpError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tanium Gateway request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tanium Gateway request failed: ${error.message}` : "Tanium Gateway request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readTaniumPayload(response: Response): Promise<TaniumGraphqlPayload> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const record = optionalRecord(parsed);
    if (!record) {
      throw new ProviderRequestError(502, "Tanium Gateway returned non-object JSON");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Tanium Gateway returned malformed JSON");
  }
}

function normalizeTaniumGraphqlResult(payload: TaniumGraphqlPayload): Record<string, unknown> {
  const data =
    payload.data === null
      ? null
      : payload.data === undefined
        ? undefined
        : expectObject(payload.data, "Tanium Gateway data");
  const errors = readGraphqlErrors(payload.errors);
  const extensions = optionalRecord(payload.extensions);
  const message = summarizeGraphqlErrors(errors);
  const result = compactObject({
    data,
    errors,
    extensions,
    message,
  });

  if (!("data" in result) && !("errors" in result)) {
    throw new ProviderRequestError(502, "Tanium Gateway response did not include data or errors");
  }

  return result;
}

function createTaniumHttpError(
  status: number,
  payload: TaniumGraphqlPayload,
  phase: TaniumPhase,
): ProviderRequestError {
  const message = extractTaniumErrorMessage(payload) ?? `Tanium Gateway request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function createTaniumGraphqlError(errors: Array<Record<string, unknown>>, phase: TaniumPhase): ProviderRequestError {
  const message = summarizeGraphqlErrors(errors) ?? "Tanium Gateway GraphQL request failed";
  const firstError = errors[0];
  const code = firstError ? readGraphqlErrorCode(firstError) : undefined;

  if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, firstError);
  }
  return new ProviderRequestError(400, message, firstError);
}

function extractTaniumErrorMessage(payload: TaniumGraphqlPayload): string | undefined {
  const errors = readGraphqlErrors(payload.errors);
  const errorMessage = summarizeGraphqlErrors(errors);
  if (errorMessage) {
    return errorMessage;
  }

  for (const key of ["message", "error", "detail", "title"]) {
    const value = optionalString((payload as Record<string, unknown>)[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readGraphqlErrors(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((error) => {
    const record = optionalRecord(error);
    if (!record) {
      return {
        message: String(error),
      };
    }
    const message = optionalString(record.message) ?? "unknown GraphQL error";
    return {
      ...record,
      message,
    };
  });
}

function summarizeGraphqlErrors(errors: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!errors || errors.length === 0) {
    return undefined;
  }
  return errors.map((error) => optionalString(error.message) ?? "unknown GraphQL error").join("; ");
}

function readGraphqlErrorCode(error: Record<string, unknown>): string | undefined {
  const extensions = optionalRecord(error.extensions);
  return optionalString(extensions?.code);
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function buildTokenFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

function requestInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
