import type { TransitFileStore } from "../../core/types.ts";

import {
  optionalInteger,
  optionalNumber,
  optionalBoolean,
  pickOptionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const appStoreServerEnvironments = ["production", "sandbox"] as const;

export type AppStoreServerEnvironment = (typeof appStoreServerEnvironments)[number];

export const appStoreServerApiOrigins: Record<AppStoreServerEnvironment, string> = {
  production: "https://api.storekit.apple.com",
  sandbox: "https://api.storekit-sandbox.apple.com",
};

const providerLabel = "App Store Server API";

export const appStoreServerWrongAppErrorCodes: Set<number> = new Set([4_000_002, 4_040_003]);

export const appStoreServerWrongAccountErrorCodes: Set<number> = new Set([4_040_001]);

export const appStoreServerRetryableErrorCodes: Set<number> = new Set([
  4_040_002, 4_040_004, 4_040_006, 4_040_008, 5_000_001,
]);

export type AppStoreServerPhase = "execute" | "validate";

export interface AppStoreServerContext {
  authorization: () => Promise<string>;
  environment: AppStoreServerEnvironment;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileStore;
}

export type AppStoreServerQuery = Record<string, string | readonly string[] | undefined>;

export interface AppStoreServerRawBody {
  bytes: Uint8Array;
  contentType: string;
}

export interface AppStoreServerRequest {
  path: string;
  method?: string;
  query?: AppStoreServerQuery;

  body?: Record<string, unknown>;

  rawBody?: AppStoreServerRawBody;
  phase?: AppStoreServerPhase;
}

export interface AppStoreServerResponse {
  status: number;
  payload: unknown;
}

export type AppStoreServerHandler = (
  input: Record<string, unknown>,
  context: AppStoreServerContext,
) => Promise<unknown>;

export type AppStoreServerHandlers = Record<string, AppStoreServerHandler>;

export function readAppStoreServerEnvironment(value: unknown): AppStoreServerEnvironment {
  const environment = requiredInputString(value, "environment").toLowerCase();
  if (!isAppStoreServerEnvironment(environment)) {
    throw new ProviderRequestError(
      400,
      `environment must be one of ${appStoreServerEnvironments.join(", ")}`,
      undefined,
      "invalid_input",
    );
  }

  return environment;
}

export function isAppStoreServerEnvironment(value: string): value is AppStoreServerEnvironment {
  return appStoreServerEnvironments.some((environment) => environment === value);
}

export async function requestAppStoreServer(
  context: AppStoreServerContext,
  input: AppStoreServerRequest,
): Promise<AppStoreServerResponse> {
  const url = new URL(`${appStoreServerApiOrigins[context.environment]}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (typeof value === "string") {
      url.searchParams.set(name, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(name, item);
      }
    }
  }

  return runProviderRequest({ label: providerLabel, signal: context.signal }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: await context.authorization(),
      "user-agent": providerUserAgent,
    };
    if (input.rawBody !== undefined) {
      headers["content-type"] = input.rawBody.contentType;
    } else if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.rawBody
        ? Uint8Array.from(input.rawBody.bytes)
        : input.body === undefined
          ? undefined
          : JSON.stringify(input.body),
      signal,
      redirect: "manual",
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createAppStoreServerError(
        response.status,
        payload,
        input.phase ?? "execute",
        response.headers.get("retry-after"),
      );
    }
    return { status: response.status, payload };
  });
}

export function readResponseInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readResponseBoolean(value: unknown): boolean | null {
  return optionalBoolean(value) ?? null;
}

export async function getAppStoreServerObject(
  context: AppStoreServerContext,
  input: AppStoreServerRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreServer(context, input);
  return requiredResponseRecord(payload, `${providerLabel} response`);
}

export async function writeAppStoreServerNoContent(
  context: AppStoreServerContext,
  input: AppStoreServerRequest & { allowedStatuses: readonly number[]; label: string },
): Promise<void> {
  const response = await requestAppStoreServer(context, input);
  if (!input.allowedStatuses.includes(response.status)) {
    throw new ProviderRequestError(
      502,
      `${input.label} answered HTTP ${response.status} instead of ${input.allowedStatuses.join(" or ")}`,
      undefined,
      "provider_error",
    );
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAppStoreServerError(
  status: number,
  payload: unknown,
  phase: AppStoreServerPhase,
  retryAfter: string | null,
): ProviderRequestError {
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(
      400,
      "The App Store Server API rejected the key. Check the Issuer ID, Key ID and private key, and that the key is an In-App Purchase key rather than an App Store Connect API key.",
      payload,
      "invalid_input",
    );
  }

  const errorCode = readErrorCode(payload);
  if (phase === "validate" && errorCode !== undefined) {
    if (appStoreServerWrongAppErrorCodes.has(errorCode)) {
      return new ProviderRequestError(
        400,
        "The App Store Server API accepted the key but found no app for it. Check the Bundle ID, and that the app exists in the selected environment.",
        payload,
        "invalid_input",
      );
    }
    if (appStoreServerWrongAccountErrorCodes.has(errorCode)) {
      return new ProviderRequestError(
        400,
        "The App Store Server API accepted the key signature but found no App Store account for it. Check the Issuer ID, and that the key belongs to that account.",
        payload,
        "invalid_input",
      );
    }
  }

  const message = readErrorMessage(status, payload);
  if (status === 429) {
    const retryHint = retryAfter ? ` (retry after ${retryAfter})` : "";
    return new ProviderRequestError(429, `${message}${retryHint}`, payload, "rate_limited");
  }
  if (errorCode !== undefined && appStoreServerRetryableErrorCodes.has(errorCode)) {
    return new ProviderRequestError(responseStatus(status), message, payload, "provider_error");
  }
  if (status === 401) {
    return new ProviderRequestError(status, message, payload, "provider_error");
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload, "invalid_input");
  }

  return new ProviderRequestError(responseStatus(status), message, payload, "provider_error");
}

function readErrorCode(payload: unknown): number | undefined {
  return optionalNumber(recordOrEmpty(payload).errorCode);
}

function responseStatus(status: number): number {
  return 400 <= status && status < 600 ? status : 502;
}

function readErrorMessage(status: number, payload: unknown): string {
  const body = recordOrEmpty(payload);
  const errorCode = readErrorCode(body);
  const errorMessage = pickOptionalString(body, "errorMessage");
  const summary = [errorCode === undefined ? undefined : String(errorCode), errorMessage]
    .filter((part) => part !== undefined)
    .join(": ");

  return summary || `App Store Server API request failed with HTTP ${status}`;
}

export function readAppStoreServerId(value: unknown, fieldName: string): string {
  const id = requiredInputString(value, fieldName);
  if (id === "." || id === "..") {
    throw new ProviderRequestError(400, `${fieldName} must not be . or ..`, undefined, "invalid_input");
  }

  return id;
}

export function appStoreServerPath(base: string, ...segments: string[]): string {
  return [base, ...segments.map((segment) => encodeURIComponent(segment))].join("/");
}

export function readIntegerQuery(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

export function readRepeatedQuery(value: unknown, fieldName: string): readonly string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of strings`, undefined, "invalid_input");
  }
  if (value.length === 0) {
    return undefined;
  }

  return value.map((item) => readAppStoreServerId(item, fieldName));
}

export function readRepeatedIntegerQuery(value: unknown, fieldName: string): readonly string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of integers`, undefined, "invalid_input");
  }
  if (value.length === 0) {
    return undefined;
  }

  return value.map((item) => {
    const integer = optionalInteger(item);
    if (integer === undefined) {
      throw new ProviderRequestError(400, `${fieldName} must contain integers`, undefined, "invalid_input");
    }
    return String(integer);
  });
}
