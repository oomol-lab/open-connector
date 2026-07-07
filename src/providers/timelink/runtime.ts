import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TimelinkActionName } from "./actions.ts";

import {
  compactObject,
  optionalNumber as asOptionalNumber,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const timelinkApiBaseUrl: string = "https://api.timelink.io/api/v1";
const timelinkRequestTimeoutMs = 30_000;

type TimelinkPhase = "validate" | "execute";
type TimelinkActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type TimelinkPagination = {
  currentPage: number;
  from: number;
  lastPage: number;
  links: Array<{ url: string | null; label: string; active: boolean }>;
  path: string;
  perPage: number;
  to: number;
  total: number;
};

export const timelinkActionHandlers: Record<TimelinkActionName, TimelinkActionHandler> = {
  async list_clients(input, context) {
    const payload = await requestTimelinkJson({
      path: "/clients",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        search: readOptionalString(input.search),
        ids: readOptionalStringArray(input.ids),
        orders: readOptionalOrderArray(input.orders),
        active: readOptionalBoolean(input.active),
        withLimitedPartOfProjects: readOptionalBoolean(input.withLimitedPartOfProjects),
        projectsLimit: readOptionalInteger(input.projectsLimit),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      clients: readDataArray(payload).map(normalizeClient),
      pagination: normalizePagination(payload.meta),
    };
  },
  async get_client(input, context) {
    const payload = await requestTimelinkJson({
      path: `/clients/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      client: normalizeClient(readDataObject(payload)),
    };
  },
  async list_projects(input, context) {
    const payload = await requestTimelinkJson({
      path: "/projects",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        search: readOptionalString(input.search),
        ids: readOptionalStringArray(input.ids),
        orders: readOptionalOrderArray(input.orders),
        active: readOptionalBoolean(input.active),
        client_id: readOptionalString(input.clientId),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      projects: readDataArray(payload).map(normalizeProject),
      pagination: normalizePagination(payload.meta),
    };
  },
  async get_project(input, context) {
    const payload = await requestTimelinkJson({
      path: `/projects/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      project: normalizeProject(readDataObject(payload)),
    };
  },
  async list_services(input, context) {
    const payload = await requestTimelinkJson({
      path: "/services",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        search: readOptionalString(input.search),
        ids: readOptionalStringArray(input.ids),
        orders: readOptionalOrderArray(input.orders),
        active: readOptionalBoolean(input.active),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      services: readDataArray(payload).map(normalizeService),
      pagination: normalizePagination(payload.meta),
    };
  },
  async get_service(input, context) {
    const payload = await requestTimelinkJson({
      path: `/services/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      service: normalizeService(readDataObject(payload)),
    };
  },
  async list_time_entries(input, context) {
    const payload = await requestTimelinkJson({
      path: "/timeEntries",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        search: readOptionalString(input.search),
        ids: readOptionalStringArray(input.ids),
        orders: readOptionalOrderArray(input.orders),
        withRelations: readOptionalBoolean(input.withRelations),
        start: readOptionalString(input.start),
        end: readOptionalString(input.end),
        onlyDeleted: readOptionalBoolean(input.onlyDeleted),
        isInterrupt: readOptionalBoolean(input.isInterrupt),
        isBilled: readOptionalBoolean(input.isBilled),
        isBillable: readOptionalBoolean(input.isBillable),
        searchInDescription: readOptionalString(input.searchInDescription),
        clientId: readOptionalString(input.clientId),
        projectId: readOptionalString(input.projectId),
        serviceId: readOptionalString(input.serviceId),
        userId: readOptionalString(input.userId),
        userIds: readOptionalStringArray(input.userIds),
        extToolId: readOptionalString(input.extToolId),
        exact: readOptionalBoolean(input.exact),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      timeEntries: readDataArray(payload).map(normalizeTimeEntry),
      pagination: normalizePagination(payload.meta),
    };
  },
  async get_time_entry(input, context) {
    const payload = await requestTimelinkJson({
      path: `/timeEntries/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      timeEntry: normalizeTimeEntry(readDataObject(payload)),
    };
  },
  async list_active_time_entries(input, context) {
    const payload = await requestTimelinkJson({
      path: "/timeEntries/active",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        withRelations: readOptionalBoolean(input.withRelations),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      timeEntries: readDataArray(payload).map(normalizeTimeEntry),
      pagination: normalizePagination(payload.meta),
    };
  },
  async list_time_entry_required_fields(_input, context) {
    const payload = await requestTimelinkJson({
      path: "/timeEntries/fieldsRequired",
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      fields: readDataArray(payload)
        .map((item) => (typeof item === "string" ? item : undefined))
        .filter((item): item is string => item !== undefined),
    };
  },
  async list_users(input, context) {
    const payload = await requestTimelinkJson({
      path: "/users",
      token: context.apiKey,
      query: buildListQuery({
        limit: readOptionalInteger(input.limit),
        search: readOptionalString(input.search),
        ids: readOptionalStringArray(input.ids),
        orders: readOptionalOrderArray(input.orders),
        active: readOptionalBoolean(input.active),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      users: readDataArray(payload).map(normalizeUser),
      pagination: normalizePagination(payload.meta),
    };
  },
  async get_user(input, context) {
    const payload = await requestTimelinkJson({
      path: `/users/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      user: normalizeUser(readDataObject(payload)),
    };
  },
  async get_company(_input, context) {
    const payload = await requestTimelinkJson({
      path: "/company",
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      company: normalizeCompany(readDataObject(payload)),
    };
  },
  async get_current_token(_input, context) {
    const payload = await requestTimelinkJson({
      path: "/token",
      token: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      token: normalizeToken(readDataObject(payload)),
    };
  },
} satisfies Record<TimelinkActionName, TimelinkActionHandler>;

export async function validateTimelinkCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  const payload = await requestTimelinkJson({
    path: "/token",
    token: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    query: {},
    fetcher,
    phase: "validate",
  });

  const token = normalizeToken(readDataObject(payload));

  return {
    profile: { accountId: String(token.id), displayName: token.name, grantedScopes: [] },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/token",
      tokenId: token.id,
      tokenName: token.name,
      apiBaseUrl: timelinkApiBaseUrl,
      expiresAt: token.expiresAt,
    }),
  };
}

async function requestTimelinkJson(input: {
  path: string;
  token: string;
  query: Record<string, string[] | string | undefined>;
  fetcher: typeof fetch;
  phase: TimelinkPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined, timelinkRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildTimelinkUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.token}`,
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readTimelinkPayload(response);

    if (!response.ok) {
      throw createTimelinkError(response.status, payload, input.phase);
    }

    const payloadRecord = asOptionalObject(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Timelink returned an invalid payload");
    }

    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Timelink request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Timelink request failed: ${error.message}` : "Timelink request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildTimelinkUrl(path: string, query: Record<string, string[] | string | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${timelinkApiBaseUrl}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    url.searchParams.set(key, value);
  }

  return url;
}

async function readTimelinkPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Timelink returned invalid JSON");
  }
}

function createTimelinkError(status: number, payload: unknown, phase: TimelinkPhase) {
  const message = extractTimelinkErrorMessage(payload) ?? `Timelink request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 502, message);
}

function extractTimelinkErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = asOptionalObject(payload);
  if (!record) {
    return undefined;
  }

  const message = asOptionalString(record.message)?.trim();
  if (message) {
    return message;
  }

  return undefined;
}

function buildListQuery(input: Record<string, string[] | string | number | boolean | undefined>) {
  const query: Record<string, string[] | string | undefined> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      query[key] = value.map(String);
      continue;
    }
    query[key] = String(value);
  }

  return query;
}

function readDataObject(payload: Record<string, unknown>) {
  const data = asOptionalObject(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, "Timelink response data object is missing");
  }
  return data;
}

function readDataArray(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "Timelink response data array is missing");
  }
  return payload.data;
}

function normalizePagination(value: unknown): TimelinkPagination {
  const meta = asOptionalObject(value);
  const links = Array.isArray(meta?.links) ? meta.links : [];

  return {
    currentPage: asOptionalNumber(meta?.current_page) ?? 1,
    from: asOptionalNumber(meta?.from) ?? 0,
    lastPage: asOptionalNumber(meta?.last_page) ?? 1,
    links: links
      .map((item) => asOptionalObject(item))
      .filter((item): item is Record<string, unknown> => item !== undefined)
      .map((item) => ({
        url: asOptionalString(item.url) ?? null,
        label: asOptionalString(item.label) ?? "",
        active: typeof item.active === "boolean" ? item.active : false,
      })),
    path: asOptionalString(meta?.path) ?? "",
    perPage: asOptionalNumber(meta?.per_page) ?? 0,
    to: asOptionalNumber(meta?.to) ?? 0,
    total: asOptionalNumber(meta?.total) ?? 0,
  };
}

function normalizeClient(value: unknown) {
  const item = requireObject(value, "client");

  return {
    id: asOptionalString(item.id) ?? "",
    name: asOptionalString(item.name) ?? "",
    companyId: asOptionalNumber(item.company_id) ?? null,
    extToolId: asOptionalNumber(item.ext_tool_id) ?? null,
    info: asOptionalString(item.info) ?? null,
    color: asOptionalString(item.color) ?? null,
    active: typeof item.active === "boolean" ? item.active : false,
    billable: typeof item.billable === "boolean" ? item.billable : false,
    acronym: asOptionalString(item.acronym) ?? null,
    imageId: asOptionalString(item.image_id) ?? null,
    demoFlag: typeof item.demo_flag === "boolean" ? item.demo_flag : false,
    projectCount: asOptionalNumber(item.projects_count) ?? null,
    activeProjectCount: asOptionalNumber(item.active_projects_count) ?? null,
    raw: item,
  };
}

function normalizeProject(value: unknown) {
  const item = requireObject(value, "project");

  return {
    id: asOptionalString(item.id) ?? "",
    name: asOptionalString(item.name) ?? "",
    clientId: asOptionalNumber(item.client_id) ?? null,
    extToolId: asOptionalNumber(item.ext_tool_id) ?? null,
    info: asOptionalString(item.info) ?? null,
    color: asOptionalString(item.color) ?? null,
    active: typeof item.active === "boolean" ? item.active : false,
    billable: typeof item.billable === "boolean" ? item.billable : false,
    acronym: asOptionalString(item.acronym) ?? null,
    imageId: asOptionalString(item.image_id) ?? null,
    demoFlag: typeof item.demo_flag === "boolean" ? item.demo_flag : false,
    raw: item,
  };
}

function normalizeService(value: unknown) {
  const item = requireObject(value, "service");

  return {
    id: asOptionalString(item.id) ?? "",
    name: asOptionalString(item.name) ?? "",
    companyId: asOptionalNumber(item.company_id) ?? null,
    extToolId: asOptionalNumber(item.ext_tool_id) ?? null,
    info: asOptionalString(item.info) ?? null,
    color: asOptionalString(item.color) ?? null,
    active: typeof item.active === "boolean" ? item.active : false,
    billable: typeof item.billable === "boolean" ? item.billable : false,
    acronym: asOptionalString(item.acronym) ?? null,
    imageId: asOptionalString(item.image_id) ?? null,
    defaultTimeEntryDescription: asOptionalString(item.default_time_entry_description) ?? null,
    raw: item,
  };
}

function normalizeTimeEntry(value: unknown) {
  const item = requireObject(value, "time entry");

  return {
    id: asOptionalString(item.id) ?? "",
    userId: asOptionalString(item.user_id) ?? null,
    clientId: asOptionalString(item.client_id) ?? null,
    projectId: asOptionalString(item.project_id) ?? null,
    serviceId: asOptionalString(item.service_id) ?? null,
    description: asOptionalString(item.description) ?? null,
    billable: typeof item.billable === "boolean" ? item.billable : false,
    billed: typeof item.billed === "boolean" ? item.billed : false,
    billedAt: asOptionalString(item.billed_at) ?? null,
    isInterrupt: typeof item.is_interrupt === "boolean" ? item.is_interrupt : false,
    startedAt: asOptionalString(item.started_at) ?? "",
    endedAt: asOptionalString(item.ended_at) ?? null,
    createdAt: asOptionalString(item.created_at) ?? "",
    updatedAt: asOptionalString(item.updated_at) ?? "",
    deletedAt: asOptionalString(item.deleted_at) ?? null,
    extToolId: asOptionalString(item.ext_tool_id) ?? null,
    tempId: asOptionalString(item.temp_id) ?? null,
    pushState: asOptionalNumber(item.push_state) ?? null,
    pushErrors: Array.isArray(item.push_errors)
      ? item.push_errors
          .map((child) => (typeof child === "string" ? child : undefined))
          .filter((child): child is string => child !== undefined)
      : [],
    raw: item,
  };
}

function normalizeUser(value: unknown) {
  const item = requireObject(value, "user");
  const lastUsed = asOptionalObject(item.last_used);

  return {
    id: asOptionalString(item.id) ?? "",
    firstName: asOptionalString(item.first_name) ?? "",
    lastName: asOptionalString(item.last_name) ?? "",
    fullName: asOptionalString(item.full_name) ?? "",
    email: asOptionalString(item.email) ?? "",
    companyId: asOptionalString(item.company_id) ?? "",
    emailVerifiedAt: asOptionalString(item.email_verified_at) ?? null,
    active: typeof item.active === "boolean" ? item.active : false,
    timezone: asOptionalString(item.timezone) ?? "",
    language: asOptionalString(item.language) ?? "",
    lastUsed: {
      clients: readOptionalStringArray(lastUsed?.clients) ?? [],
      projects: readOptionalStringArray(lastUsed?.projects) ?? [],
      services: readOptionalStringArray(lastUsed?.services) ?? [],
    },
    settings: asOptionalObject(item.settings) ?? null,
    raw: item,
  };
}

function normalizeCompany(value: unknown) {
  const item = requireObject(value, "company");
  const subscription = asOptionalObject(item.subscription);

  return {
    id: asOptionalString(item.id) ?? "",
    name: asOptionalString(item.name) ?? "",
    address: asOptionalString(item.address) ?? "",
    city: asOptionalString(item.city) ?? "",
    zip: asOptionalString(item.zip) ?? "",
    country: asOptionalString(item.country) ?? "",
    phone: asOptionalString(item.phone) ?? "",
    email: asOptionalString(item.email) ?? "",
    invoiceEmail: asOptionalString(item.invoice_email) ?? "",
    forceOauth: readNullableBoolean(item.force_oauth),
    oauthProvider: asOptionalString(item.oauth_provider) ?? null,
    autoupdateQuantity: readNullableBoolean(item.autoupdate_quantity),
    subscription: subscription
      ? {
          status: asOptionalString(subscription.status) === "canceled" ? "canceled" : "active",
          product: asOptionalString(subscription.product) === "trial" ? "trial" : "basic",
          quantity: asOptionalNumber(subscription.quantity) ?? 0,
          trial: typeof subscription.trial === "boolean" ? subscription.trial : false,
          trialEndsAt: asOptionalString(subscription.trial_ends_at) ?? null,
          endsAt: asOptionalString(subscription.ends_at) ?? null,
          raw: subscription,
        }
      : null,
    pullProvider: asOptionalString(item.pull_provider) ?? null,
    pushProvider: asOptionalString(item.push_provider) ?? null,
    settings: asOptionalObject(item.settings) ?? null,
    raw: item,
  };
}

function normalizeToken(value: unknown) {
  const item = requireObject(value, "token");

  return {
    id: asOptionalNumber(item.id) ?? 0,
    name: asOptionalString(item.name) ?? "",
    abilities: readOptionalStringArray(item.abilities) ?? [],
    lastUsedAt: asOptionalString(item.last_used_at) ?? null,
    expiresAt: asOptionalString(item.expires_at) ?? null,
    createdAt: asOptionalString(item.created_at) ?? "",
    updatedAt: asOptionalString(item.updated_at) ?? "",
  };
}

function requireObject(value: unknown, label: string) {
  const object = asOptionalObject(value);
  if (!object) {
    throw new ProviderRequestError(502, `Timelink ${label} payload is invalid`);
  }
  return object;
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readOptionalInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  return typeof value === "boolean" ? value : null;
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.map((item) => readOptionalString(item)).filter((item): item is string => item !== undefined);

  return items.length > 0 ? items : [];
}

function readOptionalOrderArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => {
      const record = asOptionalObject(item);
      const column = readOptionalString(record?.column);
      const direction = readOptionalString(record?.direction);
      if (!column || (direction !== "asc" && direction !== "desc")) {
        return undefined;
      }
      return JSON.stringify({ column, direction });
    })
    .filter((item): item is string => item !== undefined);

  return items.length > 0 ? items : [];
}
