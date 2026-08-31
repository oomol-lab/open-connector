import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const textmagicApiBaseUrl = "https://rest.textmagic.com/api/v2";

const textmagicValidationPath = "/user";
const textmagicRequestTimeoutMs = 30_000;

export interface TextmagicActionContext {
  apiKey: string;
  username: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export interface TextmagicCredentialInput {
  apiKey: string;
  username: string;
}

interface TextmagicRequestInput {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}

type TextmagicActionHandler = (input: Record<string, unknown>, context: TextmagicActionContext) => Promise<unknown>;

export const textmagicActionHandlers: ProviderActionHandlers<"textmagic", TextmagicActionHandler> = {
  get_current_user(_input, context) {
    return requestTextmagicJson({ path: textmagicValidationPath, phase: "execute" }, context);
  },
  send_message(input, context) {
    return requestTextmagicJson(
      {
        path: "/messages",
        method: "POST",
        phase: "execute",
        body: compactObject({
          text: input.text,
          phones: requiredStringArray(input.phones, "phones", providerInputError).join(","),
          from: input.from,
          referenceId: input.referenceId,
          cutExtra: input.cutExtra,
          partsCount: input.partsCount,
          local: input.local,
          localCountry: input.localCountry,
        }),
      },
      context,
    );
  },
  list_contacts(input, context) {
    return requestTextmagicJson(
      {
        path: "/contacts",
        phase: "execute",
        query: pickQuery(input, ["page", "limit", "shared", "orderBy", "direction"]),
      },
      context,
    );
  },
  get_contact(input, context) {
    return requestTextmagicJson(
      {
        path: `/contacts/${readPositiveInteger(input.id, "id")}`,
        phase: "execute",
      },
      context,
    );
  },
  list_lists(input, context) {
    return requestTextmagicJson(
      {
        path: "/lists",
        phase: "execute",
        query: pickQuery(input, ["page", "limit", "orderBy", "direction", "favoriteOnly", "onlyMine"]),
      },
      context,
    );
  },
  create_list(input, context) {
    return requestTextmagicJson(
      {
        path: "/lists",
        method: "POST",
        phase: "execute",
        body: compactObject({
          name: input.name,
          shared: input.shared,
          favorited: input.favorited,
          isDefault: input.isDefault,
        }),
      },
      context,
    );
  },
  list_templates(input, context) {
    return requestTextmagicJson(
      {
        path: "/templates",
        phase: "execute",
        query: pickQuery(input, ["page", "limit"]),
      },
      context,
    );
  },
};

export async function validateTextmagicCredential(
  input: TextmagicCredentialInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const username = requireTextmagicUsername(input.username);
  const user = await requestTextmagicJson(
    { path: textmagicValidationPath, phase: "validate" },
    { apiKey: input.apiKey, username, fetcher, signal },
  );
  const userId = optionalInteger(user.id);
  const accountUsername = optionalString(user.username) ?? username;
  const fullName = [optionalString(user.firstName), optionalString(user.lastName)].filter(Boolean).join(" ");
  const email = optionalString(user.email);

  return {
    profile: {
      accountId: userId === undefined ? `textmagic:${accountUsername}` : `textmagic:${userId}`,
      displayName: fullName || email || `Textmagic (${accountUsername})`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: textmagicApiBaseUrl,
      validationEndpoint: textmagicValidationPath,
      username,
      userId,
      email,
    }),
  };
}

export function requireTextmagicUsername(value: unknown): string {
  return requiredString(value, "Textmagic username", providerInputError);
}

export function textmagicAuthorization(username: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
}

async function requestTextmagicJson(
  input: TextmagicRequestInput,
  context: TextmagicActionContext,
): Promise<Record<string, unknown>> {
  const url = new URL(`${textmagicApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(name, value);
  }

  const timeout = createProviderTimeout(context.signal, textmagicRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: textmagicAuthorization(context.username, context.apiKey),
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    payload = await readTextmagicPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "Textmagic request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Textmagic request failed: ${error.message}` : "Textmagic request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) throw mapTextmagicError(response.status, payload, input.phase);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Textmagic returned a non-object JSON response");
  }
  return payload as Record<string, unknown>;
}

async function readTextmagicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Textmagic returned malformed JSON");
    return { message: text };
  }
}

function mapTextmagicError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readTextmagicErrorMessage(payload) ?? `Textmagic API request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readTextmagicErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  return optionalString(record.message) ?? optionalString(record.error);
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  return output;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return Number(value);
}
