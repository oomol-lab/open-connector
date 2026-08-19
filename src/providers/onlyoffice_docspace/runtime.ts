import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const requestTimeoutMs = 30_000;

export interface OnlyofficeContext {
  apiKey: string;
  portalUrl: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type Phase = "validate" | "execute";

export function normalizePortalUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, "portalUrl is required");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "portalUrl must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "portalUrl must use HTTPS");
  if (url.username || url.password || url.search || url.hash)
    throw new ProviderRequestError(400, "portalUrl must not include credentials, query parameters, or a fragment");
  return url.origin;
}
export function createOnlyofficeContext(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): OnlyofficeContext {
  const portalUrl = normalizePortalUrl(values.portalUrl);
  return { apiKey, portalUrl, apiBaseUrl: `${portalUrl}/api/2.0/`, fetcher, signal };
}

export const onlyofficeActionHandlers: ProviderActionHandlers<
  "onlyoffice_docspace",
  ProviderRuntimeHandler<OnlyofficeContext>
> = {
  async get_current_user(_input, context) {
    return { user: requireResponseObject(await request(context, "people/@self")) };
  },
  async list_users(_input, context) {
    return normalizeList(await request(context, "people"), "users");
  },
  async get_user(input, context) {
    return {
      user: requireResponseObject(
        await request(context, `people/${encodeURIComponent(requiredString(input.userId, "userId"))}`),
      ),
    };
  },
  async list_rooms(input, context) {
    return normalizeList(
      await request(context, "files/rooms", {
        count: input.count,
        startIndex: input.startIndex,
        filterValue: input.search,
      }),
      "rooms",
      "folders",
    );
  },
  async get_room(input, context) {
    return {
      room: requireResponseObject(await request(context, `files/rooms/${positiveInteger(input.roomId, "roomId")}`)),
    };
  },
  async get_folder_contents(input, context) {
    const payload = await request(context, `files/${positiveInteger(input.folderId, "folderId")}`, {
      count: input.count,
      startIndex: input.startIndex,
    });
    const envelope = requireEnvelope(payload);
    const response = requireResponseObject(payload);
    return {
      files: objectArray(response.files, "files"),
      folders: objectArray(response.folders, "folders"),
      current: optionalRecord(response.current) ?? null,
      pagination: pagination(envelope, response),
    };
  },
};

export async function validateOnlyofficeCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createOnlyofficeContext(apiKey, values, fetcher, signal);
  const user = requireResponseObject(await request(context, "people/@self", {}, "validate"));
  const id = optionalString(user.id) ?? optionalInteger(user.id)?.toString();
  if (!id) throw new ProviderRequestError(502, "ONLYOFFICE DocSpace user response is missing id");
  const fullName = [optionalString(user.firstName), optionalString(user.lastName)].filter(Boolean).join(" ");
  const label =
    optionalString(user.displayName) ??
    (fullName || optionalString(user.email) || `ONLYOFFICE DocSpace @ ${new URL(context.portalUrl).host}`);
  return {
    profile: {
      accountId: createHash("sha256").update(`${context.portalUrl}:${id}`).digest("hex").slice(0, 24),
      displayName: label,
    },
    grantedScopes: [],
    metadata: { portalUrl: context.portalUrl, apiBaseUrl: context.apiBaseUrl, userId: id },
  };
}

async function request(
  context: OnlyofficeContext,
  path: string,
  query: Record<string, unknown> = {},
  phase: Phase = "execute",
): Promise<unknown> {
  const url = new URL(path, context.apiBaseUrl);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "ONLYOFFICE DocSpace request timed out");
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "ONLYOFFICE DocSpace request failed");
  } finally {
    timeout.cleanup();
  }
  const payload = await readJson(response);
  if (!response.ok) throw mapError(response.status, payload, phase);
  return payload;
}
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    if (response.ok) throw new ProviderRequestError(502, "ONLYOFFICE DocSpace returned empty JSON");
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "ONLYOFFICE DocSpace returned invalid JSON");
    return null;
  }
}
function normalizeList(payload: unknown, outputKey: string, nestedKey = "employees") {
  const envelope = requireEnvelope(payload);
  const response = optionalRecord(envelope.response);
  const values = Array.isArray(envelope.response)
    ? envelope.response
    : response && Array.isArray(response[nestedKey])
      ? response[nestedKey]
      : null;
  if (!values) throw new ProviderRequestError(502, `ONLYOFFICE DocSpace returned an invalid ${outputKey} list`);
  return { [outputKey]: objectArray(values, outputKey), pagination: pagination(envelope, response) };
}
function pagination(envelope: Record<string, unknown>, response?: Record<string, unknown> | null) {
  return {
    count: optionalInteger(envelope.count) ?? optionalInteger(response?.count) ?? null,
    total: optionalInteger(response?.total) ?? optionalInteger(envelope.total) ?? null,
    startIndex: optionalInteger(response?.startIndex) ?? null,
  };
}
function requireEnvelope(payload: unknown) {
  const value = optionalRecord(payload);
  if (!value || !("response" in value))
    throw new ProviderRequestError(502, "ONLYOFFICE DocSpace returned an invalid response envelope");
  return value;
}
function requireResponseObject(payload: unknown) {
  const value = optionalRecord(requireEnvelope(payload).response);
  if (!value) throw new ProviderRequestError(502, "ONLYOFFICE DocSpace returned an invalid resource");
  return value;
}
function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${field} is required`);
  return value.trim();
}
function positiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new ProviderRequestError(400, `${field} must be a positive integer`);
  return value;
}
function mapError(status: number, payload: unknown, phase: Phase) {
  const root = optionalRecord(payload),
    error = optionalRecord(root?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(root?.message) ??
    `ONLYOFFICE DocSpace request failed with ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, message);
  if (status === 401) return new ProviderRequestError(409, message);
  if ([400, 403, 404, 409, 422].includes(status)) return new ProviderRequestError(400, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
