import type { CredentialValidationResult } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, positiveInteger } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type MauticCredential = {
  baseUrl: string;
  username: string;
  password: string;
};

type MauticRequest = {
  credential: MauticCredential;
  fetcher: typeof fetch;
  path: string;
  phase: "execute" | "validate";
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  query?: Record<string, unknown>;
  jsonBody?: Record<string, unknown>;
};

type MauticActionHandler = (
  input: Record<string, unknown>,
  credential: MauticCredential,
  fetcher: typeof fetch,
) => Promise<unknown>;

const mauticRequestTimeoutMs = 30_000;
const mauticMaxResponseBytes = 10 * 1024 * 1024;

class MauticError extends ProviderRequestError {
  constructor(_code: string, message: string, status: number, _cause?: unknown, details?: unknown) {
    super(status, message, details);
  }
}

export const mauticActionHandlers: Record<string, MauticActionHandler> = {
  async list_contacts(input, credential, fetcher) {
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: "contacts",
      phase: "execute",
      query: buildListQuery(input),
    });
    const contacts = normalizeEntityCollection(readObjectValue(payload, "contacts"), "contacts");
    return {
      contacts,
      total: readCollectionTotal(payload, contacts.length),
    };
  },

  async get_contact(input, credential, fetcher) {
    const contactId = readEntityId(input.contactId, "contactId");
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: `contacts/${contactId}`,
      phase: "execute",
    });
    return { contact: requireResponseObject(readObjectValue(payload, "contact"), "contact") };
  },

  async create_contact(input, credential, fetcher) {
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: "contacts/new",
      phase: "execute",
      method: "POST",
      jsonBody: requireInputFields(input.fields),
    });
    return { contact: requireResponseObject(readObjectValue(payload, "contact"), "contact") };
  },

  async update_contact(input, credential, fetcher) {
    const contactId = readEntityId(input.contactId, "contactId");
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: `contacts/${contactId}/edit`,
      phase: "execute",
      method: "PATCH",
      jsonBody: requireInputFields(input.fields),
    });
    return { contact: requireResponseObject(readObjectValue(payload, "contact"), "contact") };
  },

  async delete_contact(input, credential, fetcher) {
    const contactId = readEntityId(input.contactId, "contactId");
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: `contacts/${contactId}/delete`,
      phase: "execute",
      method: "DELETE",
    });
    return { contact: requireResponseObject(readObjectValue(payload, "contact"), "contact") };
  },

  async list_segments(input, credential, fetcher) {
    const payload = await requestMauticJson({
      credential,
      fetcher,
      path: "segments",
      phase: "execute",
      query: buildListQuery(input),
    });
    const segments = normalizeEntityCollection(readObjectValue(payload, "lists"), "segments");
    return {
      segments,
      total: readCollectionTotal(payload, segments.length),
    };
  },

  async add_contact_to_segment(input, credential, fetcher) {
    return changeSegmentMembership(input, credential, fetcher, "add");
  },

  async remove_contact_from_segment(input, credential, fetcher) {
    return changeSegmentMembership(input, credential, fetcher, "remove");
  },
};

export async function validateMauticCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<CredentialValidationResult> {
  const credential = buildMauticCredential(input);
  const payload = await requestMauticJson({
    credential,
    fetcher,
    path: "users/self",
    phase: "validate",
  });
  const user = optionalRecord(payload.user) ?? payload;
  const userId = optionalInteger(user.id);
  const fullName = [optionalString(user.firstName), optionalString(user.lastName)]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
  const accountName = fullName || optionalString(user.username)?.trim() || optionalString(user.email)?.trim();
  const instanceUrl = new URL(credential.baseUrl);
  const instanceRoot = mauticInstanceRoot(credential.baseUrl);

  return {
    profile: {
      accountId: `mautic:${credential.baseUrl}:${userId ?? credential.username}`,
      displayName: `${accountName || credential.username} @ ${instanceUrl.host}`,
    },
    metadata: {
      baseUrl: credential.baseUrl,
      instanceUrl: instanceRoot,
      ...(userId === undefined ? {} : { userId }),
    },
  };
}

export function normalizeMauticBaseUrl(
  value: string,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MauticError("invalid_input", "baseUrl is required", 400);
  }

  const url = assertPublicHttpUrl(trimmed, {
    fieldName: "baseUrl",
    createError: (message) => new MauticError("invalid_input", message, 400),
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") {
    throw new MauticError(
      "invalid_input",
      "baseUrl must use https because Mautic Basic Auth sends reusable credentials",
      400,
    );
  }
  if (url.username || url.password) {
    throw new MauticError("invalid_input", "baseUrl must not include credentials", 400);
  }

  let pathname = url.pathname;
  while (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = `${pathname.endsWith("/api") ? pathname : `${pathname}/api`}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildMauticCredential(input: Record<string, string>): MauticCredential {
  return {
    baseUrl: normalizeMauticBaseUrl(requireCredentialValue(input.baseUrl, "baseUrl")),
    username: requireCredentialValue(input.username, "username"),
    password: requireCredentialValue(input.password, "password", false),
  };
}

function requireCredentialValue(value: string | undefined, fieldName: string, trim = true) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MauticError("invalid_input", `${fieldName} is required`, 400);
  }
  return trim ? value.trim() : value;
}

function mauticInstanceRoot(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  if (url.pathname.endsWith("/api/")) {
    url.pathname = url.pathname.slice(0, -5) || "/";
  }
  return url.toString();
}

function buildListQuery(input: Record<string, unknown>) {
  return compactObject({
    search: input.search,
    start: input.start,
    limit: input.limit,
    orderBy: input.orderBy,
    orderByDir: input.orderByDir,
    published: input.publishedOnly === true ? 1 : undefined,
  });
}

function readEntityId(value: unknown, fieldName: string) {
  return positiveInteger(value, fieldName);
}

function requireInputFields(value: unknown) {
  const fields = optionalRecord(value);
  if (!fields || Object.keys(fields).length === 0) {
    throw new MauticError("invalid_input", "fields must contain at least one contact field", 400);
  }
  return fields;
}

async function changeSegmentMembership(
  input: Record<string, unknown>,
  credential: MauticCredential,
  fetcher: typeof fetch,
  operation: "add" | "remove",
) {
  const segmentId = readEntityId(input.segmentId, "segmentId");
  const contactId = readEntityId(input.contactId, "contactId");
  const payload = await requestMauticJson({
    credential,
    fetcher,
    path: `segments/${segmentId}/contact/${contactId}/${operation}`,
    phase: "execute",
    method: "POST",
  });
  const success = payload.success;
  if (success !== true && success !== 1 && success !== "1") {
    throw new MauticError(
      "provider_error",
      `Mautic did not confirm the segment membership ${operation} operation`,
      502,
    );
  }
  return { success: true, segmentId, contactId };
}

async function requestMauticJson(input: MauticRequest): Promise<Record<string, unknown>> {
  const url = new URL(input.path, input.credential.baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(undefined, mauticRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${input.credential.username}:${input.credential.password}`).toString("base64")}`,
        "user-agent": providerUserAgent,
        ...(input.jsonBody ? { "content-type": "application/json" } : {}),
      },
      ...(input.jsonBody ? { body: JSON.stringify(input.jsonBody) } : {}),
      signal: timeout.signal,
    });
    const responseText = await readBoundedResponseText(response);
    const parsedPayload = parseMauticPayload(responseText);
    const payload = parsedPayload.kind === "object" ? parsedPayload.value : undefined;
    if (!response.ok) {
      throw mapMauticError(response, payload, input.phase);
    }
    if (parsedPayload.kind === "empty") {
      throw new MauticError("provider_error", "Mautic returned an empty response", 502);
    }
    if (parsedPayload.kind === "invalid_json") {
      throw new MauticError("provider_error", "Mautic returned invalid JSON", 502);
    }
    if (parsedPayload.kind === "non_object") {
      throw new MauticError("provider_error", "Mautic returned a non-object JSON response", 502);
    }
    return parsedPayload.value;
  } catch (error) {
    if (error instanceof MauticError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new MauticError("provider_error", "Mautic request timed out", 504);
    }
    throw new MauticError(
      "provider_error",
      error instanceof Error ? `Mautic request failed: ${error.message}` : "Mautic request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBoundedResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > mauticMaxResponseBytes) {
    await response.body?.cancel();
    throw new MauticError("provider_error", `Mautic response exceeds ${mauticMaxResponseBytes} bytes`, 413);
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > mauticMaxResponseBytes) {
        await reader.cancel();
        throw new MauticError("provider_error", `Mautic response exceeds ${mauticMaxResponseBytes} bytes`, 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseMauticPayload(value: string) {
  if (!value.trim()) {
    return { kind: "empty" } as const;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { kind: "invalid_json" } as const;
  }
  const payload = optionalRecord(parsed);
  return payload ? ({ kind: "object", value: payload } as const) : ({ kind: "non_object" } as const);
}

function mapMauticError(
  response: Response,
  payload: Record<string, unknown> | undefined,
  phase: "execute" | "validate",
) {
  const message = readMauticErrorMessage(payload) ?? `Mautic request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new MauticError(
      "invalid_input",
      "Mautic username or password is invalid, Basic Auth is disabled, or the user cannot access the API",
      400,
    );
  }
  if (response.status === 401) {
    return new MauticError("credential_expired", message, 401);
  }
  if (response.status === 403) {
    return new MauticError(
      "scope_missing",
      "The connected Mautic user does not have permission to perform this action",
      403,
    );
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new MauticError("invalid_input", message, 400);
  }
  if (response.status === 404) {
    return new MauticError("invalid_input", message, 404);
  }
  return new MauticError("provider_error", message, response.status >= 500 ? 502 : response.status);
}

function readMauticErrorMessage(payload: Record<string, unknown> | undefined) {
  if (!payload) {
    return undefined;
  }
  const direct = optionalString(payload.message) ?? optionalString(payload.error);
  if (direct?.trim()) {
    return direct.trim();
  }
  if (Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      const message = optionalString(optionalRecord(error)?.message);
      if (message?.trim()) {
        return message.trim();
      }
    }
  }
  return undefined;
}

function readObjectValue(payload: Record<string, unknown>, key: string) {
  if (!(key in payload)) {
    throw new MauticError("provider_error", `Mautic response is missing ${key}`, 502);
  }
  return payload[key];
}

function requireResponseObject(value: unknown, label: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new MauticError("provider_error", `Mautic returned invalid ${label} data`, 502);
  }
  return object;
}

function normalizeEntityCollection(value: unknown, label: string) {
  const items = Array.isArray(value) ? value : Object.values(requireResponseObject(value, label));
  return items.map((item) => requireResponseObject(item, label));
}

function readCollectionTotal(payload: Record<string, unknown>, fallback: number) {
  const total = Number(payload.total);
  return Number.isInteger(total) && total >= 0 ? total : fallback;
}
