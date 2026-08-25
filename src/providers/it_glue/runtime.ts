import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const itGlueApiBaseUrls = {
  us: "https://api.itglue.com",
  eu: "https://api.eu.itglue.com",
  au: "https://api.au.itglue.com",
};
const itGlueValidationPath = "/users";

type ItGlueRegion = keyof typeof itGlueApiBaseUrls;
type ItGlueRequestPhase = "validate" | "execute";
type ItGlueResource = Record<string, unknown>;
type ItGlueEnvelope = Record<string, unknown>;

interface ItGlueActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ItGlueRequestOptions extends ItGlueActionContext {
  path: string;
  phase: ItGlueRequestPhase;
  query?: Record<string, unknown>;
}

export const itGlueActionHandlers: ProviderActionHandlers<"it_glue", ProviderRuntimeHandler<ItGlueActionContext>> = {
  async list_organizations(input, context) {
    const payload = await requestItGlueJson({
      ...context,
      path: "/organizations",
      phase: "execute",
      query: compactItGlueQuery({
        sort: optionalString(input.sort),
        include: readOptionalCommaList(input.include),
        "filter[name]": optionalString(input.name),
        "filter[organization_type_id]": input.organizationTypeId,
        "filter[organization_status_id]": input.organizationStatusId,
        "filter[primary]": optionalBoolean(input.primary),
        "filter[created_at]": optionalString(input.createdAtRange),
        "filter[updated_at]": optionalString(input.updatedAtRange),
        ...readPaginationQuery(input),
      }),
    });
    return createListResult("organizations", payload);
  },
  async get_organization(input, context) {
    const payload = await requestItGlueJson({
      ...context,
      path: `/organizations/${readPathId(input.id, "id")}`,
      phase: "execute",
      query: compactItGlueQuery({
        include: readOptionalCommaList(input.include),
      }),
    });
    return createItemResult("organization", payload);
  },
  async list_users(input, context) {
    const payload = await requestItGlueJson({
      ...context,
      path: "/users",
      phase: "execute",
      query: compactItGlueQuery({
        sort: optionalString(input.sort),
        "filter[name]": optionalString(input.name),
        "filter[email]": optionalString(input.email),
        "filter[role_name]": optionalString(input.roleName),
        ...readPaginationQuery(input),
      }),
    });
    return createListResult("users", payload);
  },
  async get_user(input, context) {
    const payload = await requestItGlueJson({
      ...context,
      path: `/users/${readPathId(input.id, "id")}`,
      phase: "execute",
    });
    return createItemResult("user", payload);
  },
  async list_configurations(input, context) {
    const organizationId = readOptionalPathId(input.organizationId, "organizationId");
    const payload = await requestItGlueJson({
      ...context,
      path: "/configurations",
      phase: "execute",
      query: compactItGlueQuery({
        sort: optionalString(input.sort),
        include: readOptionalCommaList(input.include),
        "filter[organization_id]": organizationId,
        "filter[name]": optionalString(input.name),
        "filter[serial_number]": optionalString(input.serialNumber),
        "filter[asset_tag]": optionalString(input.assetTag),
        "filter[configuration_type_id]": input.configurationTypeId,
        "filter[configuration_status_id]": input.configurationStatusId,
        "filter[archived]": optionalBoolean(input.archived),
        ...readPaginationQuery(input),
      }),
    });
    return createListResult("configurations", payload);
  },
  async get_configuration(input, context) {
    const organizationId = readOptionalPathId(input.organizationId, "organizationId");
    const configurationId = readPathId(input.id, "id");
    const payload = await requestItGlueJson({
      ...context,
      path: organizationId
        ? `/organizations/${organizationId}/relationships/configurations/${configurationId}`
        : `/configurations/${configurationId}`,
      phase: "execute",
      query: compactItGlueQuery({
        include: readOptionalCommaList(input.include),
      }),
    });
    return createItemResult("configuration", payload);
  },
  async list_contacts(input, context) {
    const organizationId = readOptionalPathId(input.organizationId, "organizationId");
    const payload = await requestItGlueJson({
      ...context,
      path: "/contacts",
      phase: "execute",
      query: compactItGlueQuery({
        sort: optionalString(input.sort),
        include: readOptionalCommaList(input.include),
        "filter[organization_id]": organizationId,
        "filter[first_name]": optionalString(input.firstName),
        "filter[last_name]": optionalString(input.lastName),
        "filter[title]": optionalString(input.title),
        "filter[contact_type_id]": input.contactTypeId,
        "filter[important]": optionalBoolean(input.important),
        "filter[primary_email]": optionalString(input.primaryEmail),
        ...readPaginationQuery(input),
      }),
    });
    return createListResult("contacts", payload);
  },
  async get_contact(input, context) {
    const organizationId = readOptionalPathId(input.organizationId, "organizationId");
    const contactId = readPathId(input.id, "id");
    const payload = await requestItGlueJson({
      ...context,
      path: organizationId
        ? `/organizations/${organizationId}/relationships/contacts/${contactId}`
        : `/contacts/${contactId}`,
      phase: "execute",
      query: compactItGlueQuery({
        include: readOptionalCommaList(input.include),
      }),
    });
    return createItemResult("contact", payload);
  },
};

export async function validateItGlueCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const region = normalizeItGlueRegion(input.values.region);
  const apiBaseUrl = resolveItGlueApiBaseUrl(region);
  const payload = await requestItGlueJson({
    apiKey: input.apiKey,
    apiBaseUrl,
    path: itGlueValidationPath,
    query: { "page[size]": 1 },
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const users = readResourceList(payload, "IT Glue users");
  const firstUser = users[0];
  const firstUserLabel = firstUser ? formatItGlueUserLabel(firstUser) : undefined;
  const firstUserId = optionalString(firstUser?.id);

  return {
    profile: {
      accountId: firstUserId ?? `it_glue:${region}`,
      displayName: firstUserLabel ? `IT Glue ${firstUserLabel}` : "IT Glue API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      region,
      validationEndpoint: itGlueValidationPath,
      firstUserId,
      firstUserEmail: readAttributeString(firstUser, "email"),
    },
  };
}

export function resolveItGlueApiBaseUrl(regionInput: unknown): string {
  return itGlueApiBaseUrls[normalizeItGlueRegion(regionInput)];
}

async function requestItGlueJson(options: ItGlueRequestOptions): Promise<unknown> {
  const url = new URL(options.path, options.apiBaseUrl);
  applyQuery(url, options.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
        "user-agent": providerUserAgent,
        "x-api-key": options.apiKey,
      },
      signal: options.signal,
    });
    payload = await readItGluePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `IT Glue request failed: ${error.message}` : "IT Glue request failed",
    );
  }

  if (!response.ok) {
    throw createItGlueError(response, payload, options.phase);
  }

  return payload;
}

function applyQuery(url: URL, query: Record<string, unknown> | undefined): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.map(String).join(","));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function readPaginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactItGlueQuery({
    "page[number]": input.pageNumber,
    "page[size]": input.pageSize,
  });
}

function compactItGlueQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null));
}

function readOptionalCommaList(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).filter(Boolean).join(",") : undefined;
}

function readPathId(value: unknown, fieldName: string): string {
  const id = optionalInteger(value);
  if (id == null || id <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(id);
}

function readOptionalPathId(value: unknown, fieldName: string): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return readPathId(value, fieldName);
}

function normalizeItGlueRegion(value: unknown): ItGlueRegion {
  const region = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!region) {
    return "us";
  }
  if (region === "us" || region === "eu" || region === "au") {
    return region;
  }
  throw new ProviderRequestError(400, "IT Glue region must be one of us, eu, or au");
}

async function readItGluePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createItGlueError(response: Response, payload: unknown, phase: ItGlueRequestPhase): ProviderRequestError {
  const message = readItGlueErrorMessage(payload) ?? `IT Glue request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function readItGlueErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const errors = object.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      const errorObject = optionalRecord(error);
      const message =
        readStringField(errorObject, "detail") ??
        readStringField(errorObject, "title") ??
        readStringField(errorObject, "message");
      if (message) {
        return message;
      }
    }
  }

  return readStringField(object, "message") ?? readStringField(object, "error");
}

function createListResult(key: string, payload: unknown): Record<string, unknown> {
  const envelope = readEnvelope(payload);
  return {
    [key]: readResourceArray(envelope.data, `IT Glue ${key}`),
    meta: readEnvelopeObject(envelope, "meta"),
    links: readEnvelopeObject(envelope, "links"),
    raw: envelope,
  };
}

function createItemResult(key: string, payload: unknown): Record<string, unknown> {
  const envelope = readEnvelope(payload);
  return {
    [key]: readResource(envelope.data, `IT Glue ${key}`),
    meta: readEnvelopeObject(envelope, "meta"),
    links: readEnvelopeObject(envelope, "links"),
    raw: envelope,
  };
}

function readEnvelope(payload: unknown): ItGlueEnvelope {
  const envelope = optionalRecord(payload);
  if (!envelope) {
    throw new ProviderRequestError(502, "IT Glue returned an invalid JSON:API envelope");
  }
  return envelope;
}

function readResourceList(payload: unknown, label: string): ItGlueResource[] {
  const envelope = readEnvelope(payload);
  return readResourceArray(envelope.data, label);
}

function readResourceArray(value: unknown, label: string): ItGlueResource[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response must contain a data array`);
  }
  return value.map((item) => readResource(item, label));
}

function readResource(value: unknown, label: string): ItGlueResource {
  const resource = optionalRecord(value);
  if (!resource) {
    throw new ProviderRequestError(502, `${label} response contains an invalid resource`);
  }
  return resource;
}

function readEnvelopeObject(envelope: ItGlueEnvelope, key: string): Record<string, unknown> {
  return optionalRecord(envelope[key]) ?? {};
}

function formatItGlueUserLabel(user: ItGlueResource): string | undefined {
  const firstName = readAttributeString(user, "first-name");
  const lastName = readAttributeString(user, "last-name");
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || readAttributeString(user, "email");
}

function readAttributeString(resource: ItGlueResource | undefined, key: string): string | undefined {
  const attributes = optionalRecord(resource?.attributes);
  return readStringField(attributes, key);
}

function readStringField(object: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
