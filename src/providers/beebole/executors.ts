import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "beebole";
const beeboleApiBaseUrl = "https://app.beebole.com";
const beeboleGraphqlPath = "/graphql";
const beeboleGraphqlEndpoint = `${beeboleApiBaseUrl}${beeboleGraphqlPath}`;

type BeeboleRequestPhase = "validate" | "execute";

interface BeeboleGraphqlRequestOptions {
  apiKey: string;
  body: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: BeeboleRequestPhase;
}

export const beeboleActionHandlers: ProviderActionHandlers<"beebole", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  execute_graphql(input, context) {
    return requestBeeboleGraphql({
      apiKey: context.apiKey,
      body: compactObject({
        query: readRequiredInputString(input.query, "query"),
        variables: readOptionalInputObject(input.variables, "variables"),
        operationName: readOptionalInputString(input.operationName, "operationName"),
      }),
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beeboleActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: beeboleApiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestBeeboleGraphql({
      apiKey: input.apiKey,
      body: { query: "{ __typename }" },
      context: { fetcher, signal },
      phase: "validate",
    });
    if (payload.errors && payload.errors.length > 0) {
      throw new ProviderRequestError(
        400,
        extractBeeboleGraphqlErrorMessage(payload) ?? "Beebole credential validation failed",
        payload,
      );
    }

    return {
      profile: {
        displayName: "Beebole API Key",
      },
      grantedScopes: [],
      metadata: {
        graphqlEndpoint: beeboleGraphqlEndpoint,
        validationEndpoint: beeboleGraphqlPath,
        validationReturnedData: payload.data !== undefined,
        validationReturnedErrors: false,
      },
    };
  },
};

async function requestBeeboleGraphql(input: BeeboleGraphqlRequestOptions): Promise<BeeboleGraphqlPayload> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(beeboleGraphqlEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        apikey: input.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Beebole GraphQL returned invalid JSON",
    });
    if (!response.ok) {
      throw createBeeboleGraphqlError(response.status, payload, input.phase);
    }
    return normalizeBeeboleGraphqlPayload(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Beebole GraphQL request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Beebole GraphQL request failed: ${error.message}` : "Beebole GraphQL request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

interface BeeboleGraphqlPayload extends Record<string, unknown> {
  data?: unknown;
  errors?: Array<Record<string, unknown>>;
  extensions?: Record<string, unknown>;
}

function normalizeBeeboleGraphqlPayload(payload: unknown): BeeboleGraphqlPayload {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Beebole GraphQL returned an invalid payload");
  }
  const errors = readGraphqlErrors(record.errors);
  const extensions = readOptionalProviderObject(record.extensions, "extensions");
  return compactObject({
    data: record.data,
    errors,
    extensions,
  });
}

function readGraphqlErrors(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Beebole GraphQL errors must be an array");
  }
  return value.map((item) => {
    const error = optionalRecord(item);
    if (!error) {
      throw new ProviderRequestError(502, "Beebole GraphQL error entries must be objects");
    }
    validateOptionalGraphqlString(error.message, "error message");
    validateOptionalGraphqlLocations(error.locations);
    if (error.path !== undefined && !Array.isArray(error.path)) {
      throw new ProviderRequestError(502, "Beebole GraphQL error path must be an array");
    }
    readOptionalProviderObject(error.extensions, "error extensions");
    return error;
  });
}

function validateOptionalGraphqlString(value: unknown, fieldName: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new ProviderRequestError(502, `Beebole GraphQL ${fieldName} must be a string`);
  }
}

function validateOptionalGraphqlLocations(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Beebole GraphQL error locations must be an array");
  }
  for (const item of value) {
    const location = optionalRecord(item);
    if (!location) {
      throw new ProviderRequestError(502, "Beebole GraphQL error locations must contain objects");
    }
    validateOptionalGraphqlInteger(location.line, "error location line");
    validateOptionalGraphqlInteger(location.column, "error location column");
  }
}

function validateOptionalGraphqlInteger(value: unknown, fieldName: string): void {
  if (value !== undefined && !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Beebole GraphQL ${fieldName} must be an integer`);
  }
}

function readOptionalInputObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readOptionalProviderObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Beebole GraphQL ${fieldName} must be an object`);
  }
  return record;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = readOptionalInputString(value, fieldName);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalInputString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return text;
}

function createBeeboleGraphqlError(status: number, payload: unknown, phase: BeeboleRequestPhase): ProviderRequestError {
  const message = extractBeeboleGraphqlErrorMessage(payload) ?? `Beebole GraphQL request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractBeeboleGraphqlErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const message = optionalString(record.message);
  if (message) {
    return message;
  }
  const firstError = Array.isArray(record.errors) ? optionalRecord(record.errors[0]) : undefined;
  return optionalString(firstError?.message);
}
