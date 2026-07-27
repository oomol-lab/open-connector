import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalIntegerLike,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "upstash_redis";
const requestTimeoutMs = 30_000;
const upstashHostnameSuffix = ".upstash.io";

type UpstashRequestPhase = "validate" | "execute";
type UpstashCommandArgument = string | number;

export interface UpstashRedisContext {
  restToken: string;
  restUrl: URL;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const upstashRedisActionHandlers: Record<string, ProviderRuntimeHandler<UpstashRedisContext>> = {
  async get(input, context) {
    const result = await executeUpstashCommand(context, ["GET", readKey(input)], "execute");
    return { value: readStringOrNullResult(result, "GET") };
  },
  async set(input, context) {
    const command: UpstashCommandArgument[] = ["SET", readKey(input), readValue(input)];
    const expirationSeconds = readOptionalPositiveInteger(input.expirationSeconds, "expirationSeconds");
    if (expirationSeconds !== undefined) {
      command.push("EX", expirationSeconds);
    }
    const condition = optionalString(input.condition);
    if (condition !== undefined) {
      if (condition !== "NX" && condition !== "XX") {
        throw providerInputError("condition must be NX or XX");
      }
      command.push(condition);
    }

    const result = await executeUpstashCommand(context, command, "execute");
    if (result !== "OK" && result !== null) {
      throw providerResponseError("Upstash Redis returned an invalid SET result");
    }
    return { stored: result === "OK" };
  },
  async delete(input, context) {
    const result = await executeUpstashCommand(context, ["DEL", readKey(input)], "execute");
    return { deleted: readBooleanCommandResult(result, "DEL") };
  },
  async exists(input, context) {
    const result = await executeUpstashCommand(context, ["EXISTS", readKey(input)], "execute");
    return { exists: readBooleanCommandResult(result, "EXISTS") };
  },
  async expire(input, context) {
    const result = await executeUpstashCommand(
      context,
      ["EXPIRE", readKey(input), readRequiredPositiveInteger(input.expirationSeconds, "expirationSeconds")],
      "execute",
    );
    return { updated: readBooleanCommandResult(result, "EXPIRE") };
  },
  async ttl(input, context) {
    const result = await executeUpstashCommand(context, ["TTL", readKey(input)], "execute");
    return { ttlSeconds: readIntegerResult(result, "TTL") };
  },
  async scan(input, context) {
    const command: UpstashCommandArgument[] = ["SCAN", optionalString(input.cursor) ?? "0"];
    const match = optionalString(input.match);
    if (match !== undefined) {
      command.push("MATCH", match);
    }
    const count = readOptionalPositiveInteger(input.count, "count", 1000);
    if (count !== undefined) {
      command.push("COUNT", count);
    }

    const result = await executeUpstashCommand(context, command, "execute");
    const [nextCursor, keys] = readScanResult(result);
    return { nextCursor, keys, complete: nextCursor === "0" };
  },
};

export function createUpstashRedisContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): UpstashRedisContext {
  return {
    restToken: requiredString(values.restToken, "restToken", providerInputError),
    restUrl: normalizeUpstashRestUrl(values.restUrl),
    fetcher,
    signal,
  };
}

export async function validateUpstashRedisCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createUpstashRedisContext(values, fetcher, signal);
  const result = await executeUpstashCommand(context, ["PING"], "validate");
  if (result !== "PONG") {
    throw providerResponseError("Upstash Redis returned an invalid PING result");
  }

  return {
    profile: {
      accountId: `${service}:${context.restUrl.hostname}`,
      displayName: `Upstash Redis - ${context.restUrl.hostname}`,
    },
    grantedScopes: [],
    metadata: {
      restUrl: context.restUrl.origin,
      validationCommand: "PING",
    },
  };
}

async function executeUpstashCommand(
  context: UpstashRedisContext,
  command: readonly UpstashCommandArgument[],
  phase: UpstashRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(new URL(context.restUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.restToken}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(command),
      signal: timeout.signal,
    });
    const text = await readProviderTextBody(response, "Upstash Redis response");
    if (!response.ok) {
      const payload = parseProviderJsonBodyText(text, {
        emptyBody: {},
        invalidJsonMessage: "Upstash Redis returned invalid JSON",
        invalidJsonFallback: (body) => ({ error: body }),
      });
      throw createUpstashError(response.status, payload, phase);
    }
    const payload = parseProviderJsonBodyText(text, {
      emptyBody: undefined,
      invalidJsonMessage: "Upstash Redis returned invalid JSON",
    });
    return readUpstashResult(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Upstash Redis request timed out", error);
    }
    if (isAbortSignalError(context.signal, error)) {
      throw new ProviderRequestError(499, "Upstash Redis request was cancelled", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Upstash Redis request failed: ${error.message}` : "Upstash Redis request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeUpstashRestUrl(value: string | undefined): URL {
  const restUrl = assertPublicHttpUrl(requiredString(value, "restUrl", providerInputError), {
    fieldName: "restUrl",
    createError: providerInputError,
  });
  if (restUrl.protocol !== "https:") {
    throw providerInputError("restUrl must use https");
  }
  if (restUrl.username || restUrl.password) {
    throw providerInputError("restUrl must not include credentials");
  }
  if (restUrl.port) {
    throw providerInputError("restUrl must not include a port");
  }
  if (restUrl.pathname !== "/" || restUrl.search || restUrl.hash) {
    throw providerInputError("restUrl must not include a path, query, or fragment");
  }
  if (!restUrl.hostname.endsWith(upstashHostnameSuffix)) {
    throw providerInputError("restUrl must use an official upstash.io endpoint");
  }
  return restUrl;
}

function readUpstashResult(payload: unknown): unknown {
  const record = requiredRecord(payload, "Upstash Redis response");
  const error = optionalString(record.error);
  if (error !== undefined) {
    throw new ProviderRequestError(400, error, payload);
  }
  if (!Object.hasOwn(record, "result")) {
    throw providerResponseError("Upstash Redis response is missing result");
  }
  return record.result;
}

function createUpstashError(status: number, payload: unknown, phase: UpstashRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    `Upstash Redis request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (isUpstashQuotaMessage(message)) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

/**
 * Upstash reports quota and throttling as Redis errors inside a 400 response,
 * so the message is the only signal that the request should be retried later.
 */
function isUpstashQuotaMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("limit exceeded") || normalized.includes("connections exceeded");
}

function readKey(input: Record<string, unknown>): string {
  return requiredString(input.key, "key", providerInputError);
}

/**
 * Read the SET payload verbatim. Redis strings are opaque, so surrounding
 * whitespace must reach the database and match what GET reads back.
 */
function readValue(input: Record<string, unknown>): string {
  const value = optionalRawString(input.value);
  if (value === undefined) {
    throw providerInputError("value is required");
  }
  return value;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const result = readOptionalPositiveInteger(value, fieldName);
  if (result === undefined) {
    throw providerInputError(`${fieldName} is required`);
  }
  return result;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string, maximum?: number): number | undefined {
  const result = optionalIntegerLike(value, fieldName, providerInputError);
  if (result === undefined) {
    return undefined;
  }
  if (result < 1 || (maximum !== undefined && result > maximum)) {
    throw providerInputError(
      maximum === undefined
        ? `${fieldName} must be greater than zero`
        : `${fieldName} must be between 1 and ${maximum}`,
    );
  }
  return result;
}

function readStringOrNullResult(result: unknown, command: string): string | null {
  if (result === null || typeof result === "string") {
    return result;
  }
  throw providerResponseError(`Upstash Redis returned an invalid ${command} result`);
}

function readBooleanCommandResult(result: unknown, command: string): boolean {
  const value = readIntegerResult(result, command);
  if (value !== 0 && value !== 1) {
    throw providerResponseError(`Upstash Redis returned an invalid ${command} result`);
  }
  return value === 1;
}

function readIntegerResult(result: unknown, command: string): number {
  if (typeof result !== "number" || !Number.isInteger(result)) {
    throw providerResponseError(`Upstash Redis returned an invalid ${command} result`);
  }
  return result;
}

function readScanResult(result: unknown): [string, string[]] {
  if (!Array.isArray(result) || result.length !== 2) {
    throw providerResponseError("Upstash Redis returned an invalid SCAN result");
  }
  const cursor = result[0];
  const rawKeys = result[1];
  if ((typeof cursor !== "string" && typeof cursor !== "number") || !Array.isArray(rawKeys)) {
    throw providerResponseError("Upstash Redis returned an invalid SCAN result");
  }
  if (rawKeys.some((key) => typeof key !== "string")) {
    throw providerResponseError("Upstash Redis returned an invalid SCAN key");
  }
  return [String(cursor), rawKeys];
}

function requiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record !== undefined) {
    return record;
  }
  throw providerResponseError(`${fieldName} must be an object`);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
