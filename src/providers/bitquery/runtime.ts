import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const bitqueryGraphqlEndpoint: string = "https://streaming.bitquery.io/graphql";

const bitqueryValidationQuery = `
{
  EVM(network: eth) {
    Blocks(limit: { count: 1 }) {
      Block {
        Number
      }
    }
  }
}
`;

type BitqueryPhase = "validate" | "execute";
type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

interface BitqueryRuntimeContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BitqueryGraphqlRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BitqueryPhase;
  body: Record<string, unknown>;
}

type BitqueryActionHandler = (input: Record<string, unknown>, context: BitqueryRuntimeContext) => Promise<unknown>;

export const bitqueryActionHandlers: ProviderActionHandlers<"bitquery", BitqueryActionHandler> = {
  run_query: runQuery,
};

export async function validateBitqueryCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const envelope = await requestBitqueryGraphqlEnvelope({
    apiKey,
    fetcher,
    signal,
    phase: "validate",
    body: {
      query: bitqueryValidationQuery,
    },
  });

  return {
    profile: {
      accountId: "bitquery",
      displayName: "Bitquery API Token",
    },
    grantedScopes: [],
    metadata: {
      graphqlEndpoint: bitqueryGraphqlEndpoint,
      validationEndpoint: bitqueryGraphqlEndpoint,
      validationReturnedData: Object.prototype.hasOwnProperty.call(envelope, "data"),
      validationReturnedErrors: Array.isArray(envelope.errors),
    },
  };
}

async function runQuery(input: Record<string, unknown>, context: BitqueryRuntimeContext) {
  return requestBitqueryGraphqlEnvelope({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: buildGraphqlRequestBody(input),
  });
}

function buildGraphqlRequestBody(input: Record<string, unknown>) {
  return {
    query: readRequiredString(input.query, "query"),
    ...(input.variables === undefined ? {} : { variables: input.variables }),
    ...(input.operationName === undefined
      ? {}
      : { operationName: readRequiredString(input.operationName, "operationName") }),
  };
}

async function requestBitqueryGraphqlEnvelope(input: BitqueryGraphqlRequestInput) {
  const payload = await requestBitqueryJson(input);
  return requireGraphqlEnvelope(payload);
}

async function requestBitqueryJson(input: BitqueryGraphqlRequestInput) {
  let response: Response;
  let payload: JsonPayloadReadResult;
  try {
    response = await input.fetcher(bitqueryGraphqlEndpoint, {
      method: "POST",
      headers: buildBitqueryHeaders(input.apiKey),
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bitquery request failed: ${error.message}` : "Bitquery request failed",
    );
  }

  if (!response.ok) {
    throw createBitqueryError(response, payload.kind === "json" ? payload.value : undefined, input.phase);
  }

  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, `Bitquery returned invalid JSON: ${payload.raw.slice(0, 200)}`);
  }

  return payload.kind === "json" ? payload.value : null;
}

function buildBitqueryHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const raw = await response.text();
  if (raw.trim() === "") {
    return { kind: "empty" };
  }

  try {
    return { kind: "json", value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: "invalid_json", raw };
  }
}

function requireGraphqlEnvelope(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Bitquery returned a non-object GraphQL response");
  }

  const envelope = payload as Record<string, unknown>;
  const hasData = Object.prototype.hasOwnProperty.call(envelope, "data");
  const hasErrors = Object.prototype.hasOwnProperty.call(envelope, "errors");
  const hasExtensions = Object.prototype.hasOwnProperty.call(envelope, "extensions");
  if (!hasData && !hasErrors && !hasExtensions) {
    throw new ProviderRequestError(502, "Bitquery returned an invalid GraphQL response envelope");
  }

  return envelope;
}

function createBitqueryError(response: Response, payload: unknown, phase: BitqueryPhase) {
  const message = readBitqueryErrorMessage(payload) ?? `Bitquery request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function readBitqueryErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const body = payload as Record<string, unknown>;
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const firstError = errors[0];
  if (firstError && typeof firstError === "object" && !Array.isArray(firstError)) {
    const message = optionalString((firstError as Record<string, unknown>).message);
    if (message) {
      return message;
    }
  }

  return optionalString(body.message) ?? optionalString(body.error);
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return value;
}
