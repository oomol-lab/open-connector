import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const kitApiBaseUrl = "https://api.kit.com/v4";
const kitDefaultRequestTimeoutMs = 30_000;

type KitPhase = "validate" | "execute";
type KitMethod = "GET" | "POST" | "PUT";
type KitActionHandler = (input: Record<string, unknown>, context: KitRequestContext) => Promise<unknown>;

export interface KitRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const kitActionHandlers: ProviderActionHandlers<"kit", KitActionHandler> = {
  async get_current_account(_input, context) {
    return normalizeAccountResponse(
      await requestKitJson({
        method: "GET",
        path: "/account",
        apiKey: context.apiKey,
        params: {},
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
      }),
    );
  },
  async list_subscribers(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: "/subscribers",
      apiKey: context.apiKey,
      params: buildListSubscribersParams(input),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscribersResponse(payload);
  },
  async get_subscriber(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: `/subscribers/${readRequiredInteger(input.id, "id")}`,
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscriberResponse(payload);
  },
  async create_subscriber(input, context) {
    const payload = await requestKitJson({
      method: "POST",
      path: "/subscribers",
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        email_address: readRequiredString(input.email_address, "email_address"),
        first_name: readNullableString(input.first_name),
        state: readOptionalString(input.state),
        fields: readOptionalCustomFields(input.fields),
      }),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscriberResponse(payload);
  },
  async update_subscriber(input, context) {
    const payload = await requestKitJson({
      method: "PUT",
      path: `/subscribers/${readRequiredInteger(input.id, "id")}`,
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        email_address: readRequiredString(input.email_address, "email_address"),
        first_name: readNullableString(input.first_name),
        fields: readOptionalCustomFields(input.fields),
      }),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscriberResponse(payload);
  },
  async list_forms(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: "/forms",
      apiKey: context.apiKey,
      params: {
        ...buildPaginationParams(input),
        status: readOptionalString(input.status),
        type: readOptionalString(input.type),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      forms: readArray(payload.forms, "forms").map(normalizeForm),
      pagination: normalizePagination(payload.pagination),
    };
  },
  async list_tags(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: "/tags",
      apiKey: context.apiKey,
      params: buildPaginationParams(input),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      tags: readArray(payload.tags, "tags").map(normalizeTag),
      pagination: normalizePagination(payload.pagination),
    };
  },
  async list_form_subscribers(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: `/forms/${readRequiredInteger(input.form_id, "form_id")}/subscribers`,
      apiKey: context.apiKey,
      params: {
        ...buildPaginationParams(input),
        added_after: readOptionalString(input.added_after),
        added_before: readOptionalString(input.added_before),
        created_after: readOptionalString(input.created_after),
        created_before: readOptionalString(input.created_before),
        status: readOptionalString(input.status),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscribersResponse(payload);
  },
  async list_tag_subscribers(input, context) {
    const payload = await requestKitJson({
      method: "GET",
      path: `/tags/${readRequiredInteger(input.tag_id, "tag_id")}/subscribers`,
      apiKey: context.apiKey,
      params: {
        ...buildPaginationParams(input),
        created_after: readOptionalString(input.created_after),
        created_before: readOptionalString(input.created_before),
        tagged_after: readOptionalString(input.tagged_after),
        tagged_before: readOptionalString(input.tagged_before),
        status: readOptionalString(input.status),
      },
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeSubscribersResponse(payload);
  },
};

export async function validateKitCredential(
  input: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const payload = await requestKitJson({
    method: "GET",
    path: "/account",
    apiKey: input.apiKey,
    params: {},
    fetcher: input.fetcher,
    phase: "validate",
    signal: input.signal,
  });
  const account = normalizeAccountResponse(payload);
  const accountId = String(account.account.id);
  const displayName = account.account.name || account.account.primary_email_address || "Kit Account";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/account",
      accountId: account.account.id,
      accountName: account.account.name,
      userEmail: account.user.email,
      primaryEmailAddress: account.account.primary_email_address,
    }),
  };
}

async function requestKitJson(input: {
  method: KitMethod;
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: KitPhase;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal, kitDefaultRequestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-Kit-Api-Key": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.fetcher(buildKitUrl(input.path, input.params), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readKitPayload(response);

    if (!response.ok) {
      throw createKitError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Kit returned an invalid payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kit request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kit request failed: ${error.message}` : "Kit request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKitUrl(path: string, params: Record<string, string | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${kitApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

async function readKitPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kit returned invalid JSON");
  }
}

function createKitError(status: number, payload: unknown, phase: KitPhase) {
  const message = extractKitErrorMessage(payload) ?? `Kit request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractKitErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors)
    ? record.errors.map((item) => optionalString(item)).filter((item) => item !== undefined)
    : [];
  if (errors.length > 0) {
    return errors.join("; ");
  }

  return optionalString(record.error)?.trim() || optionalString(record.message)?.trim();
}

function buildPaginationParams(input: Record<string, unknown>) {
  return compactObject({
    after: readOptionalString(input.after),
    before: readOptionalString(input.before),
    per_page: readOptionalIntegerString(input.per_page),
    include_total_count: readOptionalBooleanString(input.include_total_count),
  });
}

function buildListSubscribersParams(input: Record<string, unknown>) {
  const include = Array.isArray(input.include)
    ? input.include.map((item) => readRequiredString(item, "include")).join(",")
    : undefined;

  return compactObject({
    ...buildPaginationParams(input),
    created_after: readOptionalString(input.created_after),
    created_before: readOptionalString(input.created_before),
    updated_after: readOptionalString(input.updated_after),
    updated_before: readOptionalString(input.updated_before),
    email_address: readOptionalString(input.email_address),
    include: include || undefined,
    sort_field: readOptionalString(input.sort_field),
    sort_order: readOptionalString(input.sort_order),
    status: readOptionalString(input.status),
  });
}

function normalizeAccountResponse(payload: Record<string, unknown>) {
  const user = readObject(payload.user, "user");
  const account = readObject(payload.account, "account");
  const timezone = readObject(account.timezone, "timezone");

  return {
    user: {
      id: optionalNumber(user.id) ?? null,
      email: readRequiredString(user.email, "user.email"),
    },
    account: {
      id: readRequiredNumber(account.id, "account.id"),
      name: readRequiredString(account.name, "account.name"),
      plan_type: readRequiredString(account.plan_type, "account.plan_type"),
      primary_email_address: readRequiredString(account.primary_email_address, "account.primary_email_address"),
      created_at: readRequiredString(account.created_at, "account.created_at"),
      timezone: {
        name: readRequiredString(timezone.name, "account.timezone.name"),
        friendly_name: readRequiredString(timezone.friendly_name, "account.timezone.friendly_name"),
        utc_offset: readRequiredString(timezone.utc_offset, "account.timezone.utc_offset"),
      },
      sending_addresses: readArray(account.sending_addresses, "account.sending_addresses").map(normalizeSendingAddress),
    },
  };
}

function normalizeSendingAddress(value: unknown) {
  const record = readObject(value, "sending_address");
  return {
    email_address: readRequiredString(record.email_address, "email_address"),
    from_name: readRequiredString(record.from_name, "from_name"),
    status: readRequiredString(record.status, "status"),
    is_default: readRequiredBoolean(record.is_default, "is_default"),
    is_verified: readRequiredBoolean(record.is_verified, "is_verified"),
    is_dmarc_configured: readRequiredBoolean(record.is_dmarc_configured, "is_dmarc_configured"),
  };
}

function normalizeSubscribersResponse(payload: Record<string, unknown>) {
  return {
    subscribers: readArray(payload.subscribers, "subscribers").map(normalizeSubscriber),
    pagination: normalizePagination(payload.pagination),
  };
}

function normalizeSubscriberResponse(payload: Record<string, unknown>) {
  return {
    subscriber: normalizeSubscriber(payload.subscriber),
  };
}

function normalizeSubscriber(value: unknown) {
  const record = readObject(value, "subscriber");
  return {
    id: readRequiredNumber(record.id, "subscriber.id"),
    first_name: readNullableString(record.first_name),
    email_address: readRequiredString(record.email_address, "subscriber.email_address"),
    state: readRequiredString(record.state, "subscriber.state"),
    created_at: readRequiredString(record.created_at, "subscriber.created_at"),
    fields: normalizeCustomFields(record.fields),
    canceled_at: readNullableString(record.canceled_at),
    attribution: record.attribution === undefined ? null : normalizeAttribution(record.attribution),
    tags: readArrayOrEmpty(record.tags).map(normalizeTag),
    location: record.location === undefined ? null : normalizeLocation(record.location),
    added_at: readNullableString(record.added_at),
    tagged_at: readNullableString(record.tagged_at),
    referrer: readNullableString(record.referrer),
    referrer_utm_parameters:
      record.referrer_utm_parameters === undefined ? null : normalizeUtmParameters(record.referrer_utm_parameters),
  };
}

function normalizePagination(value: unknown) {
  const record = readObject(value, "pagination");
  return {
    has_previous_page: readRequiredBoolean(record.has_previous_page, "has_previous_page"),
    has_next_page: readRequiredBoolean(record.has_next_page, "has_next_page"),
    start_cursor: readNullableString(record.start_cursor),
    end_cursor: readNullableString(record.end_cursor),
    per_page: readRequiredNumber(record.per_page, "per_page"),
    total_count: optionalNumber(record.total_count) ?? null,
  };
}

function normalizeTag(value: unknown) {
  const record = readObject(value, "tag");
  return {
    id: readRequiredNumber(record.id, "tag.id"),
    name: readRequiredString(record.name, "tag.name"),
    created_at: readNullableString(record.created_at),
  };
}

function normalizeForm(value: unknown) {
  const record = readObject(value, "form");
  return {
    id: readRequiredNumber(record.id, "form.id"),
    name: readRequiredString(record.name, "form.name"),
    created_at: readRequiredString(record.created_at, "form.created_at"),
    type: readRequiredString(record.type, "form.type"),
    format: readNullableString(record.format),
    embed_js: readRequiredString(record.embed_js, "form.embed_js"),
    embed_url: readRequiredString(record.embed_url, "form.embed_url"),
    archived: readRequiredBoolean(record.archived, "form.archived"),
    uid: readRequiredString(record.uid, "form.uid"),
  };
}

function normalizeAttribution(value: unknown) {
  const record = readObject(value, "attribution");
  return {
    referrer: readNullableString(record.referrer),
    utm_source: readNullableString(record.utm_source),
    utm_medium: readNullableString(record.utm_medium),
    utm_campaign: readNullableString(record.utm_campaign),
    utm_term: readNullableString(record.utm_term),
    utm_content: readNullableString(record.utm_content),
    source_type: readNullableString(record.source_type),
    source_name: readNullableString(record.source_name),
    source_mechanism: readNullableString(record.source_mechanism),
  };
}

function normalizeLocation(value: unknown) {
  const record = readObject(value, "location");
  return {
    city: readNullableString(record.city),
    state: readNullableString(record.state),
    country: readNullableString(record.country),
    latitude: optionalNumber(record.latitude) ?? null,
    longitude: optionalNumber(record.longitude) ?? null,
  };
}

function normalizeUtmParameters(value: unknown) {
  const record = readObject(value, "referrer_utm_parameters");
  return {
    source: readNullableString(record.source),
    medium: readNullableString(record.medium),
    campaign: readNullableString(record.campaign),
    term: readNullableString(record.term),
    content: readNullableString(record.content),
  };
}

function normalizeCustomFields(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const fields: Record<string, string | null> = {};
  for (const [key, fieldValue] of Object.entries(record)) {
    if (fieldValue === null || typeof fieldValue === "string") {
      fields[key] = fieldValue;
    }
  }
  return fields;
}

function readOptionalCustomFields(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return normalizeCustomFields(value);
}

function readObject(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Kit response missing object field: ${fieldName}`);
  }
  return record;
}

function readArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Kit response missing array field: ${fieldName}`);
  }
  return value;
}

function readArrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function readRequiredNumber(value: unknown, fieldName: string) {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Kit response missing numeric field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const parsed = optionalNumber(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Kit response missing boolean field: ${fieldName}`);
  }
  return parsed;
}

function readOptionalIntegerString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = readRequiredInteger(value, "per_page");
  return String(parsed);
}

function readOptionalBooleanString(value: unknown) {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}
