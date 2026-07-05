import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DaffyActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const daffyApiBaseUrl = "https://public.daffy.org/v1";

type DaffyPhase = "validate" | "execute";
type DaffyHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const daffyActionHandlers: Record<DaffyActionName, DaffyHandler> = {
  async get_current_user(_input, context) {
    return { user: await daffyGetObject("/users/me", {}, context, "execute") };
  },
  async get_user(input, context) {
    const username = requiredString(input.username, "username", badInput);
    return { user: await daffyGetObject(`/users/${encodePathSegment(username)}`, {}, context, "execute") };
  },
  async get_balance(_input, context) {
    return { balance: await daffyGetObject("/users/me/balance", {}, context, "execute") };
  },
  async list_user_causes(input, context) {
    const userId = requiredPathSegment(input.userId, "userId");
    return { causes: await daffyGetArray(`/users/${encodePathSegment(userId)}/causes`, {}, context, "execute") };
  },
  async search_nonprofits(input, context) {
    return normalizeDaffyList(
      await daffyGetObject(
        "/non_profits",
        queryParams({
          query: optionalString(input.query),
          cause_id: optionalInteger(input.causeId),
          page: optionalInteger(input.page),
        }),
        context,
        "execute",
      ),
      "nonprofits",
    );
  },
  async get_nonprofit(input, context) {
    const ein = requiredString(input.ein, "ein", badInput);
    return { nonprofit: await daffyGetObject(`/non_profits/${encodePathSegment(ein)}`, {}, context, "execute") };
  },
  async list_contributions(input, context) {
    return normalizeDaffyList(
      await daffyGetObject("/contributions", queryParams({ page: optionalInteger(input.page) }), context, "execute"),
      "contributions",
    );
  },
  async list_donations(input, context) {
    return normalizeDaffyList(
      await daffyGetObject("/donations", queryParams({ page: optionalInteger(input.page) }), context, "execute"),
      "donations",
    );
  },
  async list_user_donations(input, context) {
    const userId = requiredPathSegment(input.userId, "userId");
    return normalizeDaffyList(
      await daffyGetObject(
        `/users/${encodePathSegment(userId)}/donations`,
        queryParams({ page: optionalInteger(input.page) }),
        context,
        "execute",
      ),
      "donations",
    );
  },
  async get_user_donation(input, context) {
    const userId = requiredPathSegment(input.userId, "userId");
    const donationId = requiredPathSegment(input.donationId, "donationId");
    return {
      donation: await daffyGetObject(
        `/users/${encodePathSegment(userId)}/donations/${encodePathSegment(donationId)}`,
        {},
        context,
        "execute",
      ),
    };
  },
};

export async function validateDaffyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const user = await daffyGetObject("/users/me", {}, context, "validate");
  const userId = readStringOrNumberField(user, "id");
  const email = readStringField(user, "email");
  const slug = readStringField(user, "slug") ?? readStringField(user, "username");
  const accountId = userId ? `daffy:${userId}` : slug ? `daffy:${slug}` : email ? `daffy:${email}` : "daffy:api_key";

  return {
    profile: {
      accountId,
      displayName: readStringField(user, "name") ?? email ?? slug ?? userId ?? "Daffy API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: daffyApiBaseUrl,
      userId,
      slug,
      email,
    }),
  };
}

async function daffyGetObject(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: DaffyPhase,
): Promise<Record<string, unknown>> {
  const payload = await daffyGet(path, query, context, phase);
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Daffy response was not a JSON object");
  }
  return object;
}

async function daffyGetArray(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: DaffyPhase,
): Promise<Array<Record<string, unknown>>> {
  const payload = await daffyGet(path, query, context, phase);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Daffy response was not a JSON array");
  }
  return payload.map((item) => {
    const object = optionalRecord(item);
    if (!object) {
      throw new ProviderRequestError(502, "Daffy array response item was not an object");
    }
    return object;
  });
}

async function daffyGet(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: DaffyPhase,
): Promise<unknown> {
  const url = new URL(`${daffyApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Daffy request failed: ${error.message}` : "Daffy request failed",
    );
  }

  const payload = await readDaffyPayload(response);
  if (!response.ok) {
    throw createDaffyError(response, payload, phase);
  }
  return payload;
}

async function readDaffyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Daffy returned invalid JSON");
  }
}

function createDaffyError(response: Response, payload: unknown, phase: DaffyPhase): ProviderRequestError {
  const message = extractDaffyErrorMessage(payload) ?? response.statusText ?? "Daffy request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractDaffyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const directMessage =
    readStringField(record, "error") ?? readStringField(record, "message") ?? readStringField(record, "detail");
  if (directMessage) {
    return directMessage;
  }
  if (Array.isArray(record.errors)) {
    return record.errors.find((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return undefined;
}

function normalizeDaffyList(payload: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  if (!Array.isArray(payload.items)) {
    throw new ProviderRequestError(502, "Daffy list response missing items array");
  }
  const meta = optionalRecord(payload.meta) ?? {};
  return {
    meta,
    [fieldName]: payload.items.map((item) => {
      const object = optionalRecord(item);
      if (!object) {
        throw new ProviderRequestError(502, "Daffy list response item was not an object");
      }
      return object;
    }),
  };
}

function requiredPathSegment(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  return requiredString(value, fieldName, badInput);
}

function readStringField(input: Record<string, unknown>, fieldName: string): string | undefined {
  return optionalString(input[fieldName]);
}

function readStringOrNumberField(input: Record<string, unknown>, fieldName: string): string | undefined {
  const value = input[fieldName];
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return readStringField(input, fieldName);
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
