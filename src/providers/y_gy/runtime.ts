import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const yGyApiBaseUrl = "https://api.y.gy/api/v1";
const linksPath = "/link";
const maxResponseBytes = 10 * 1024 * 1024;
const requestTimeoutMs = 30_000;
const updateFields = [
  "destination_url",
  "password",
  "og_title",
  "og_description",
  "og_image",
  "expiration_date",
  "qr_code_foreground_hex",
  "qr_code_background_hex",
  "name",
  "add_tags",
  "remove_tags",
  "android_link_destination",
  "ios_link_destination",
  "bot_protection",
  "captcha",
  "webhook_url",
  "webhook_auth_key",
];

type YGyMode = "validate" | "execute";
type YGyMethod = "GET" | "POST" | "PATCH" | "DELETE";
type YGyPayload = { kind: "empty" } | { kind: "json"; value: unknown } | { kind: "text"; value: string };

export const yGyActionHandlers: ProviderActionHandlers<"y_gy", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async create_link(input, context) {
    const payload = await requestYGyJson(context, {
      path: linksPath,
      method: "POST",
      query: {
        disable_png: optionalBoolean(input.disable_png) === true ? true : undefined,
      },
      body: createLinkBody(input),
      mode: "execute",
    });
    return normalizeLink(payload);
  },
  async get_link(input, context) {
    const id = requireLinkId(input.id);
    const payload = await requestYGyJson(context, {
      path: `${linksPath}/${id}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return normalizeLink(payload);
  },
  async list_links(input, context) {
    return normalizeLinkList(
      await requestYGyJson(context, {
        path: linksPath,
        query: {
          limit: optionalInteger(input.limit),
          offset: optionalInteger(input.offset),
        },
        mode: "execute",
      }),
    );
  },
  async update_link(input, context) {
    if (!updateFields.some((field) => input[field] !== undefined)) {
      throw new ProviderRequestError(400, "At least one link field must be provided for update.");
    }
    const id = requireLinkId(input.id);
    const payload = await requestYGyJson(context, {
      path: `${linksPath}/${id}`,
      method: "PATCH",
      body: updateLinkBody(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return normalizeLink(payload);
  },
  async delete_link(input, context) {
    const id = requireLinkId(input.id);
    const { response, payload } = await requestYGy(context, {
      path: `${linksPath}/${id}`,
      method: "DELETE",
    });
    if (!response.ok) throw createYGyError(response.status, payload, "execute", true);
    if (response.status !== 204) {
      throw new ProviderRequestError(502, `Y.GY delete returned unexpected status ${response.status}`);
    }
    return { id, deleted: true };
  },
};

export async function validateYGyCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context = { apiKey: input.apiKey, fetcher, signal };
  normalizeLinkList(
    await requestYGyJson(context, {
      path: linksPath,
      query: { limit: 1, offset: 0 },
      mode: "validate",
    }),
  );
  return {
    profile: { accountId: "y_gy", displayName: "Y.GY API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: yGyApiBaseUrl,
      validationEndpoint: "/link?limit=1&offset=0",
      validationMode: "read_only_list_probe",
    },
  };
}

function createLinkBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    destination_url: optionalString(input.destination_url),
    domain: optionalString(input.domain),
    suffix: optionalString(input.suffix),
    password: optionalString(input.password),
    og_title: optionalString(input.og_title),
    og_description: optionalString(input.og_description),
    og_image: optionalString(input.og_image),
    expiration_date: optionalString(input.expiration_date),
    qr_code_foreground_hex: optionalString(input.qr_code_foreground_hex),
    qr_code_background_hex: optionalString(input.qr_code_background_hex),
    name: optionalString(input.name),
    tags: readOptionalIntegerArray(input.tags, "tags"),
    android_link_destination: optionalString(input.android_link_destination),
    ios_link_destination: optionalString(input.ios_link_destination),
    webhook_url: optionalString(input.webhook_url),
    webhook_auth_key: optionalString(input.webhook_auth_key),
  });
}

function updateLinkBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    destination_url: optionalString(input.destination_url),
    password: optionalString(input.password),
    og_title: optionalString(input.og_title),
    og_description: optionalString(input.og_description),
    og_image: optionalString(input.og_image),
    expiration_date: optionalString(input.expiration_date),
    qr_code_foreground_hex: optionalString(input.qr_code_foreground_hex),
    qr_code_background_hex: optionalString(input.qr_code_background_hex),
    name: optionalString(input.name),
    add_tags: readOptionalIntegerArray(input.add_tags, "add_tags"),
    remove_tags: readOptionalIntegerArray(input.remove_tags, "remove_tags"),
    android_link_destination: optionalString(input.android_link_destination),
    ios_link_destination: optionalString(input.ios_link_destination),
    bot_protection: optionalBoolean(input.bot_protection),
    captcha: optionalBoolean(input.captcha),
    webhook_url: optionalString(input.webhook_url),
    webhook_auth_key: optionalString(input.webhook_auth_key),
  });
}

async function requestYGyJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: {
    path: string;
    method?: Exclude<YGyMethod, "DELETE">;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    mode: YGyMode;
    notFoundAsInvalidInput?: boolean;
  },
): Promise<unknown> {
  const { response, payload } = await requestYGy(context, input);
  if (!response.ok) {
    throw createYGyError(response.status, payload, input.mode, input.notFoundAsInvalidInput === true);
  }
  if (payload.kind === "empty") {
    throw new ProviderRequestError(502, "Y.GY returned an empty response body");
  }
  if (payload.kind === "text") {
    throw new ProviderRequestError(502, "Y.GY returned invalid JSON");
  }
  return payload.value;
}

async function requestYGy(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: {
    path: string;
    method?: YGyMethod;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<{ response: Response; payload: YGyPayload }> {
  const url = new URL(`${yGyApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    "api-key": context.apiKey,
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) headers["content-type"] = "application/json";
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    return { response, payload: await readYGyPayload(response) };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown transport error";
    const normalized = message.toLowerCase();
    const isTimeout =
      timeout.didTimeout() ||
      isAbortLikeError(error) ||
      normalized.includes("timeout") ||
      normalized.includes("timed out");
    throw new ProviderRequestError(isTimeout ? 504 : 502, `Y.GY request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readYGyPayload(response: Response): Promise<YGyPayload> {
  const text = await readProviderTextBody(response, "Y.GY response", maxResponseBytes);
  if (!text.trim()) return { kind: "empty" };
  try {
    return { kind: "json", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "text", value: text };
  }
}

function createYGyError(
  status: number,
  payload: YGyPayload,
  mode: YGyMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractYGyErrorMessage(payload, `Y.GY request failed with status ${status}`);
  if ((status === 401 || status === 403) && mode === "validate") {
    return new ProviderRequestError(status, message);
  }
  if (status === 401 || status === 403 || status === 429) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 409 || status === 422 || (status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractYGyErrorMessage(payload: YGyPayload, fallback: string): string {
  if (payload.kind === "text" && payload.value.trim()) return payload.value;
  if (payload.kind !== "json") return fallback;
  const error = optionalRecord(payload.value);
  if (!error) return fallback;
  const errorString = optionalString(error.error_string);
  const fieldKey = optionalString(error.field_key);
  if (errorString) return fieldKey ? `${fieldKey}: ${errorString}` : errorString;
  return optionalString(error.error_code) ?? fallback;
}

function normalizeLinkList(payload: unknown): Record<string, unknown> {
  const object = requireProviderObject(payload, "link list");
  if (!Array.isArray(object.links)) {
    throw new ProviderRequestError(502, "Y.GY returned an invalid links array");
  }
  return {
    links: object.links.map(normalizeLink),
    total_links: requireProviderInteger(object.total_links, "total_links"),
  };
}

function normalizeLink(payload: unknown): Record<string, unknown> {
  const link = requireProviderObject(payload, "link");
  return compactObject({
    id: requireProviderInteger(link.id, "id"),
    destination_url: requireProviderString(link.destination_url, "destination_url"),
    url: requireProviderString(link.url, "url"),
    created_at: optionalString(link.created_at),
    domain: optionalString(link.domain),
    suffix: optionalString(link.suffix),
    organization_id: optionalInteger(link.organization_id),
    og_title: nullableString(link.og_title),
    og_description: nullableString(link.og_description),
    og_image: nullableString(link.og_image),
    expiration_date: nullableString(link.expiration_date),
    qr_code_svg: optionalString(link.qr_code_svg),
    qr_code_png: nullableString(link.qr_code_png),
    qr_code_foreground_hex: optionalString(link.qr_code_foreground_hex),
    qr_code_background_hex: optionalString(link.qr_code_background_hex),
    has_password: optionalBoolean(link.has_password),
    android_link_destination: nullableString(link.android_link_destination),
    ios_link_destination: nullableString(link.ios_link_destination),
    bot_protection: nullableBoolean(link.bot_protection),
    captcha: nullableBoolean(link.captcha),
    name: nullableString(link.name),
    tags: readOptionalTags(link.tags),
    webhook_url: nullableString(link.webhook_url),
  });
}

function readOptionalTags(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Y.GY returned invalid link tags");
  }
  return value.map((item) => {
    const tag = requireProviderObject(item, "tag");
    return {
      id: requireProviderInteger(tag.id, "tag.id"),
      name: requireProviderString(tag.name, "tag.name"),
      created_at: requireProviderString(tag.created_at, "tag.created_at"),
      organization_id: requireProviderInteger(tag.organization_id, "tag.organization_id"),
    };
  });
}

function readOptionalIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => {
    const parsed = optionalInteger(item);
    if (parsed === undefined || parsed <= 0) {
      throw new ProviderRequestError(400, `${fieldName} must contain positive integers`);
    }
    return parsed;
  });
}

function requireLinkId(value: unknown): number {
  const parsed = optionalInteger(value) ?? parseLinkIdString(value);
  if (parsed === undefined || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, "id must be a positive integer");
  }
  return parsed;
}

function parseLinkIdString(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  for (const character of value) {
    if (character < "0" || character > "9") return undefined;
  }
  return Number(value);
}

function requireProviderObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Y.GY returned an invalid ${fieldName}`);
  }
  return object;
}

function requireProviderString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Y.GY response is missing ${fieldName}`);
  }
  return parsed;
}

function requireProviderInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Y.GY response is missing ${fieldName}`);
  }
  return parsed;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  return value === null ? null : optionalBoolean(value);
}
