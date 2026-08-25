import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "companycam";
const companycamApiBaseUrl = "https://api.companycam.com/v2";
const companycamApiOrigin = "https://api.companycam.com";
const companycamDefaultRequestTimeoutMs = 30_000;

type CompanycamRequestPhase = "validate" | "execute";
type CompanycamContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CompanycamActionHandler = (input: Record<string, unknown>, context: CompanycamContext) => Promise<unknown>;

interface CompanycamRequest {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method: string;
  path: string;
  phase: CompanycamRequestPhase;
  query?: Record<string, string | undefined>;
  body?: unknown;
  currentUserEmail?: string;
}

export const companycamActionHandlers: ProviderActionHandlers<"companycam", CompanycamActionHandler> = {
  async get_company(_input, context) {
    const payload = await requestCompanycamJson({ ...context, method: "GET", path: "/company", phase: "execute" });
    const company = normalizeCompany(optionalRecord(payload) ?? {});
    return { company, raw: optionalRecord(payload) ?? {} };
  },
  async get_current_user(_input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "GET",
      path: "/users/current",
      phase: "execute",
    });
    const user = normalizeUser(optionalRecord(payload) ?? {});
    return { user, raw: optionalRecord(payload) ?? {} };
  },
  async list_projects(input, context) {
    return normalizeProjectsPayload(
      await requestCompanycamJson({
        ...context,
        method: "GET",
        path: "/projects",
        phase: "execute",
        query: buildListProjectsQuery(input),
      }),
    );
  },
  async get_project(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "GET",
      path: `/projects/${encodePathSegment(input.projectId)}`,
      phase: "execute",
    });
    const project = normalizeProject(optionalRecord(payload) ?? {});
    return { project, raw: optionalRecord(payload) ?? {} };
  },
  async create_project(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "POST",
      path: "/projects",
      phase: "execute",
      body: buildProjectMutationBody(input),
      currentUserEmail: optionalString(input.currentUserEmail),
    });
    const project = normalizeProject(optionalRecord(payload) ?? {});
    return { project, raw: optionalRecord(payload) ?? {} };
  },
  async update_project(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "PUT",
      path: `/projects/${encodePathSegment(input.projectId)}`,
      phase: "execute",
      body: buildProjectMutationBody(input),
    });
    const project = normalizeProject(optionalRecord(payload) ?? {});
    return { project, raw: optionalRecord(payload) ?? {} };
  },
  async archive_project(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "PATCH",
      path: `/projects/${encodePathSegment(input.projectId)}/archive`,
      phase: "execute",
    });
    const project = normalizeProject(optionalRecord(payload) ?? {});
    return { project, raw: optionalRecord(payload) ?? {} };
  },
  async restore_project(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "PUT",
      path: `/projects/${encodePathSegment(input.projectId)}/restore`,
      phase: "execute",
    });
    const project = normalizeProject(optionalRecord(payload) ?? {});
    return { project, raw: optionalRecord(payload) ?? {} };
  },
  async list_users(input, context) {
    return normalizeUsersPayload(
      await requestCompanycamJson({
        ...context,
        method: "GET",
        path: "/users",
        phase: "execute",
        query: buildPaginationQuery(input),
      }),
    );
  },
  async get_user(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "GET",
      path: `/users/${encodePathSegment(input.userId)}`,
      phase: "execute",
    });
    const user = normalizeUser(optionalRecord(payload) ?? {});
    return { user, raw: optionalRecord(payload) ?? {} };
  },
  async list_tags(input, context) {
    return normalizeTagsPayload(
      await requestCompanycamJson({
        ...context,
        method: "GET",
        path: "/tags",
        phase: "execute",
        query: buildPaginationQuery(input),
      }),
    );
  },
  async get_tag(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "GET",
      path: `/tags/${encodePathSegment(input.tagId)}`,
      phase: "execute",
    });
    const tag = normalizeTag(optionalRecord(payload) ?? {});
    return { tag, raw: optionalRecord(payload) ?? {} };
  },
  async create_tag(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "POST",
      path: "/tags",
      phase: "execute",
      body: { tag: { display_value: input.displayValue } },
    });
    const tag = normalizeTag(optionalRecord(payload) ?? {});
    return { tag, raw: optionalRecord(payload) ?? {} };
  },
  async update_tag(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "PUT",
      path: `/tags/${encodePathSegment(input.tagId)}`,
      phase: "execute",
      body: { tag: { display_value: input.displayValue } },
    });
    const tag = normalizeTag(optionalRecord(payload) ?? {});
    return { tag, raw: optionalRecord(payload) ?? {} };
  },
  async delete_tag(input, context) {
    const payload = await requestCompanycamJson({
      ...context,
      method: "DELETE",
      path: `/tags/${encodePathSegment(input.tagId)}`,
      phase: "execute",
    });
    return { deleted: true, raw: optionalRecord(payload) ?? {} };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, companycamActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestCompanycamJson({
      apiKey: input.apiKey,
      fetcher,
      signal,
      method: "GET",
      path: "/company",
      phase: "validate",
    });
    const company = normalizeCompany(optionalRecord(payload) ?? {});
    const companyId = optionalString(company.id);
    const companyName = optionalString(company.name);

    return {
      profile: {
        accountId: companyId ?? "api_key",
        displayName: companyName ?? "CompanyCam Access Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: companycamApiBaseUrl,
        validationEndpoint: "/company",
        companyId,
        companyName,
      }),
    };
  },
};

async function requestCompanycamJson(input: CompanycamRequest): Promise<unknown> {
  const url = new URL(`/v2${input.path}`, companycamApiOrigin);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, companycamDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: companycamHeaders(input),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readCompanycamPayload(response);

    if (!response.ok) {
      throw mapCompanycamError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "CompanyCam request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CompanyCam request failed: ${error.message}` : "CompanyCam request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function companycamHeaders(input: {
  apiKey: string;
  body?: unknown;
  currentUserEmail?: string;
}): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "content-type": input.body === undefined ? undefined : "application/json",
    "user-agent": providerUserAgent,
    "x-companycam-user": input.currentUserEmail,
  }) as Record<string, string>;
}

async function readCompanycamPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "CompanyCam returned a non-JSON response");
  }
}

function mapCompanycamError(status: number, payload: unknown, phase: CompanycamRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `CompanyCam request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const errors = object.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((error) => typeof error === "string");
    if (firstError) {
      return firstError;
    }
  }

  return optionalString(object.error) ?? optionalString(object.message) ?? optionalString(object.detail);
}

function buildListProjectsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    ...buildPaginationQuery(input),
    query: optionalString(input.query),
    modified_since: optionalString(input.modifiedSince),
  }) as Record<string, string | undefined>;
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    page: input.page === undefined ? undefined : String(input.page),
    per_page: input.perPage === undefined ? undefined : String(input.perPage),
  }) as Record<string, string | undefined>;
}

function buildProjectMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    address: mapAddressInput(input.address),
    coordinates: mapCoordinateInput(input.coordinates),
    geofence: mapCoordinateArray(input.geofence),
    primary_contact: mapPrimaryContactInput(input.primaryContact),
  });
}

function mapAddressInput(value: unknown): Record<string, unknown> | undefined {
  const object = optionalRecord(value);
  if (!object) return undefined;
  return compactObject({
    street_address_1: object.streetAddress1,
    street_address_2: object.streetAddress2,
    city: object.city,
    state: object.state,
    postal_code: object.postalCode,
    country: object.country,
  });
}

function mapCoordinateInput(value: unknown): Record<string, unknown> | undefined {
  const object = optionalRecord(value);
  if (!object) return undefined;
  return compactObject({ lat: object.lat, lon: object.lon });
}

function mapCoordinateArray(value: unknown): Array<Record<string, unknown> | undefined> | undefined {
  return Array.isArray(value) ? value.map(mapCoordinateInput) : undefined;
}

function mapPrimaryContactInput(value: unknown): Record<string, unknown> | undefined {
  const object = optionalRecord(value);
  if (!object) return undefined;
  return compactObject({
    name: object.name,
    email: object.email,
    phone_number: object.phoneNumber,
  });
}

function normalizeProjectsPayload(payload: unknown): Record<string, unknown> {
  const items = readObjectArray(payload);
  return { projects: items.map(normalizeProject), raw: items };
}

function normalizeUsersPayload(payload: unknown): Record<string, unknown> {
  const items = readObjectArray(payload);
  return { users: items.map(normalizeUser), raw: items };
}

function normalizeTagsPayload(payload: unknown): Record<string, unknown> {
  const items = readObjectArray(payload);
  return { tags: items.map(normalizeTag), raw: items };
}

function normalizeCompany(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    name: asNullableString(input.name),
    status: asNullableString(input.status),
    address: normalizeNullableAddress(input.address),
    logo: readObjectArray(input.logo).map(normalizeImage),
    raw: input,
  };
}

function normalizeProject(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    companyId: asNullableString(input.company_id),
    creatorId: asNullableString(input.creator_id),
    creatorType: asNullableString(input.creator_type),
    creatorName: asNullableString(input.creator_name),
    status: asNullableString(input.status),
    archived: asNullableBoolean(input.archived),
    name: asNullableString(input.name),
    address: normalizeNullableAddress(input.address),
    coordinates: normalizeNullableCoordinate(input.coordinates),
    featuredImage: readObjectArray(input.featured_image).map(normalizeImage),
    projectUrl: asNullableString(input.project_url),
    embeddedProjectUrl: asNullableString(input.embedded_project_url),
    slug: asNullableString(input.slug),
    public: asNullableBoolean(input.public),
    geofence: readObjectArray(input.geofence).map(normalizeCoordinate),
    notepad: asNullableString(input.notepad),
    createdAt: asNullableInteger(input.created_at),
    updatedAt: asNullableInteger(input.updated_at),
    raw: input,
  };
}

function normalizeUser(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    companyId: asNullableString(input.company_id),
    emailAddress: asNullableString(input.email_address),
    status: asNullableString(input.status),
    firstName: asNullableString(input.first_name),
    lastName: asNullableString(input.last_name),
    profileImage: readObjectArray(input.profile_image).map(normalizeImage),
    phoneNumber: asNullableString(input.phone_number),
    createdAt: asNullableInteger(input.created_at),
    updatedAt: asNullableInteger(input.updated_at),
    userUrl: asNullableString(input.user_url),
    raw: input,
  };
}

function normalizeTag(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    companyId: asNullableString(input.company_id),
    displayValue: asNullableString(input.display_value),
    value: asNullableString(input.value),
    createdAt: asNullableInteger(input.created_at),
    updatedAt: asNullableInteger(input.updated_at),
    raw: input,
  };
}

function normalizeNullableAddress(value: unknown): Record<string, unknown> | null {
  const object = optionalRecord(value);
  return object ? normalizeAddress(object) : null;
}

function normalizeAddress(input: Record<string, unknown>): Record<string, unknown> {
  return {
    streetAddress1: asNullableString(input.street_address_1),
    streetAddress2: asNullableString(input.street_address_2),
    city: asNullableString(input.city),
    state: asNullableString(input.state),
    postalCode: asNullableString(input.postal_code),
    country: asNullableString(input.country),
  };
}

function normalizeNullableCoordinate(value: unknown): Record<string, unknown> | null {
  const object = optionalRecord(value);
  return object ? normalizeCoordinate(object) : null;
}

function normalizeCoordinate(input: Record<string, unknown>): Record<string, unknown> {
  return {
    lat: optionalNumber(input.lat) ?? 0,
    lon: optionalNumber(input.lon) ?? 0,
  };
}

function normalizeImage(input: Record<string, unknown>): Record<string, unknown> {
  return {
    type: asNullableString(input.type),
    uri: asNullableString(input.uri),
    url: asNullableString(input.url),
  };
}

function readObjectArray(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input) ? input.map((item) => optionalRecord(item) ?? {}) : [];
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function asNullableInteger(value: unknown): number | null {
  const number = optionalNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
