import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const highLevelApiBaseUrl = "https://services.leadconnectorhq.com";
const highLevelApiVersion = "2021-07-28";

type HighLevelRequestPhase = "validate" | "execute";

export interface HighLevelContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  locationId: string;
}

interface HighLevelRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  apiKey: string;
  phase: HighLevelRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}

export const highLevelActionHandlers: ProviderActionHandlers<"high_level", ProviderRuntimeHandler<HighLevelContext>> = {
  async get_contact(input, context): Promise<unknown> {
    const payload = await requestHighLevelJson({
      path: `/contacts/${readPathId(input.contactId, "contactId")}`,
      method: "GET",
      apiKey: context.apiKey,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return contactResponse(payload);
  },
  async create_contact(input, context): Promise<unknown> {
    const fields = readFields(input.fields);
    const payload = await requestHighLevelJson({
      path: "/contacts/",
      method: "POST",
      apiKey: context.apiKey,
      body: {
        ...fields,
        locationId: readActionLocationId(context, fields.locationId),
      },
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return contactResponse(payload);
  },
  async update_contact(input, context): Promise<unknown> {
    const payload = await requestHighLevelJson({
      path: `/contacts/${readPathId(input.contactId, "contactId")}`,
      method: "PUT",
      apiKey: context.apiKey,
      body: readFields(input.fields),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return contactResponse(payload);
  },
  async delete_contact(input, context): Promise<unknown> {
    const payload = await requestHighLevelJson({
      path: `/contacts/${readPathId(input.contactId, "contactId")}`,
      method: "DELETE",
      apiKey: context.apiKey,
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return {
      success: readSuccess(payload),
      message: optionalString(payload.message) ?? "",
      raw: payload,
    };
  },
  async search_contacts(input, context): Promise<unknown> {
    const payload = await requestHighLevelJson({
      path: "/contacts/search",
      method: "POST",
      apiKey: context.apiKey,
      body: compactObject({
        locationId: readActionLocationId(context, input.locationId),
        query: optionalString(input.query),
        page: input.page,
        pageLimit: input.pageLimit,
        filters: Array.isArray(input.filters) ? input.filters : undefined,
        sort: Array.isArray(input.sort) ? input.sort : undefined,
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    const contacts = readContacts(payload);
    return {
      contacts,
      total: optionalNumber(payload.total) ?? contacts.length,
      raw: payload,
    };
  },
};

export async function validateHighLevelCredential(
  apiKey: string,
  locationId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const validationEndpoint = `/locations/${encodeURIComponent(locationId)}`;
  const payload = await requestHighLevelJson({
    path: validationEndpoint,
    method: "GET",
    apiKey,
    phase: "validate",
    fetcher,
    signal,
  });
  const location = optionalRecord(payload.location) ?? payload;
  const label = optionalString(location.name) ?? optionalString(location.businessName) ?? "HighLevel Location";

  return {
    profile: {
      accountId: `high_level:${createHash("sha256").update(`${apiKey}:${locationId}`).digest("hex").slice(0, 16)}`,
      displayName: label,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: highLevelApiBaseUrl,
      validationEndpoint,
      locationId,
    },
  };
}

export function readHighLevelLocationId(value: unknown): string {
  return requiredString(value, "locationId", (message) => new ProviderRequestError(400, message));
}

async function requestHighLevelJson(input: HighLevelRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildHighLevelUrl(input.path), {
      method: input.method,
      headers: highLevelHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response, { allowInvalidJson: !response.ok });
    if (!response.ok) {
      throw mapHighLevelError(response.status, payload, input.phase);
    }
    return requiredRecord(payload, "high_level response", (message) => new ProviderRequestError(502, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "high_level request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `high_level request failed: ${error.message}` : "high_level request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function highLevelHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    version: highLevelApiVersion,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildHighLevelUrl(path: string): URL {
  return new URL(path.startsWith("/") ? path.slice(1) : path, `${highLevelApiBaseUrl}/`);
}

async function readJsonPayload(response: Response, input: { allowInvalidJson: boolean }): Promise<unknown> {
  if (response.status === 204) return {};
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (input.allowInvalidJson) {
      return { message: text };
    }
    throw new ProviderRequestError(502, "high_level returned invalid JSON");
  }
}

function mapHighLevelError(status: number, payload: unknown, phase: HighLevelRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `high_level request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_description);
}

function contactResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    contact: readContact(payload),
    raw: payload,
  };
}

function readContact(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.contact) ?? optionalRecord(payload.data) ?? payload;
}

function readContacts(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const contacts = payload.contacts ?? payload.data;
  if (!Array.isArray(contacts)) {
    throw new ProviderRequestError(502, "high_level returned invalid contacts payload");
  }
  return contacts.map((item) =>
    requiredRecord(item, "high_level contact payload", (message) => new ProviderRequestError(502, message)),
  );
}

function readSuccess(payload: Record<string, unknown>): boolean {
  const success = payload.success ?? payload.succeeded;
  return success === undefined ? true : Boolean(success);
}

function readFields(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "fields", (message) => new ProviderRequestError(400, message));
}

function readPathId(value: unknown, fieldName: string): string {
  return encodeURIComponent(requiredString(value, fieldName, (message) => new ProviderRequestError(400, message)));
}

function readActionLocationId(context: Pick<HighLevelContext, "locationId">, override: unknown): string {
  return optionalString(override) ?? context.locationId;
}
