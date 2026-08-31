import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "acculynx";
const acculynxApiBaseUrl = "https://api.acculynx.com";
const companySettingsPath = "/company-settings";
const contactTypesPath = "/contacts/contact-types";
const leadSourcesPath = "/company-settings/leads/lead-sources";
const jobCategoriesPath = "/company-settings/job-file-settings/job-categories";
const tradeTypesPath = "/company-settings/job-file-settings/trade-types";
const workTypesPath = "/company-settings/job-file-settings/work-types";
const contactsPath = "/contacts";
const jobsPath = "/jobs";
const calendarsPath = "/calendars";

interface AcculynxActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AcculynxActionHandler = (input: Record<string, unknown>, context: AcculynxActionContext) => Promise<unknown>;

export const acculynxActionHandlers: ProviderActionHandlers<"acculynx", AcculynxActionHandler> = {
  get_company_settings: async (_input, context) => {
    const payload = await acculynxRequestJson({
      path: companySettingsPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeCompanySettings(payload);
  },
  list_contact_types: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: contactTypesPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        pageStartIndex: readOptionalInteger(input.pageStartIndex),
      }),
    });
    return normalizeContactTypesCollection(payload);
  },
  list_lead_sources: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: leadSourcesPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        recordStartIndex: readOptionalInteger(input.recordStartIndex),
      }),
    });
    return normalizeLeadSourcesCollection(payload);
  },
  list_job_categories: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: jobCategoriesPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        pageStartIndex: readOptionalInteger(input.recordStartIndex),
      }),
    });
    return normalizeJobCategoriesCollection(payload);
  },
  list_trade_types: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: tradeTypesPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        pageStartIndex: readOptionalInteger(input.recordStartIndex),
      }),
    });
    return normalizeTradeTypesCollection(payload);
  },
  list_work_types: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: workTypesPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        pageStartIndex: readOptionalInteger(input.recordStartIndex),
      }),
    });
    return normalizeWorkTypesCollection(payload);
  },
  create_contact: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: contactsPath,
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body: input,
    });
    return {
      contact: normalizeLinkResource(payload, "contact"),
    };
  },
  create_job: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: jobsPath,
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body: input,
    });
    return {
      job: normalizeLinkResource(payload, "job"),
    };
  },
  list_calendars: async (input, context) => {
    const payload = await acculynxRequestJson({
      path: calendarsPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        recordStartIndex: readOptionalInteger(input.recordStartIndex),
      }),
    });
    return normalizeCalendarsCollection(payload);
  },
  list_calendar_appointments: async (input, context) => {
    const calendarId = requiredInputString(input.calendarId, "calendarId");
    const payload = await acculynxRequestJson({
      path: `${calendarsPath}/${encodeURIComponent(calendarId)}/appointments`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      searchParams: buildPaginationSearchParams({
        pageSize: readOptionalInteger(input.pageSize),
        pageStartIndex: readOptionalInteger(input.pageStartIndex),
        startDate: requiredInputString(input.startDate, "startDate"),
        endDate: requiredInputString(input.endDate, "endDate"),
      }),
    });
    return normalizeCalendarAppointmentsCollection(payload);
  },
  get_initial_appointment: async (input, context) => {
    const jobId = requiredInputString(input.jobId, "jobId");
    const payload = await acculynxRequestJson({
      path: `${jobsPath}/${encodeURIComponent(jobId)}/initial-appointment`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      initialAppointment: normalizeInitialAppointment(payload),
    };
  },
  upsert_initial_appointment: async (input, context) => {
    const jobId = requiredInputString(input.jobId, "jobId");
    const payload = compactObject({
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
      notes: optionalString(input.notes),
    });
    await acculynxRequestJson({
      path: `${jobsPath}/${encodeURIComponent(jobId)}/initial-appointment`,
      method: "PUT",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body: payload,
    });

    return {
      initialAppointment: {
        link: `${acculynxApiBaseUrl}/api/v2${jobsPath}/${encodeURIComponent(jobId)}/initial-appointment`,
        startDate: payload.startDate ?? null,
        endDate: payload.endDate ?? null,
        notes: payload.notes ?? null,
      },
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AcculynxActionContext>({
  service,
  handlers: acculynxActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AcculynxActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAcculynxCredential(input.apiKey, fetcher, signal);
  },
};

async function validateAcculynxCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const payload = await acculynxRequestJson({
    path: companySettingsPath,
    method: "GET",
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });
  const company = normalizeCompanySettings(payload);

  return {
    profile: {
      accountId: company.id,
      displayName: company.name,
    },
    grantedScopes: [],
    metadata: compactObject({
      companyId: company.id,
      companyName: company.name,
      validationEndpoint: companySettingsPath,
      timeZoneName: optionalString(optionalRecord(company.timeZoneInfo)?.name),
    }),
  };
}

type RequestPhase = "validate" | "execute";

async function acculynxRequestJson(input: {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  signal?: AbortSignal;
  searchParams?: URLSearchParams;
  body?: unknown;
}) {
  const response = await acculynxRequest(input);
  const payload = await readAcculynxPayload(response);
  if (!response.ok) {
    throw createAcculynxError(response, payload, input.phase);
  }
  return payload;
}

async function acculynxRequest(input: {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  signal?: AbortSignal;
  searchParams?: URLSearchParams;
  body?: unknown;
}) {
  const url = new URL(`/api/v2${input.path}`, acculynxApiBaseUrl);
  for (const [key, value] of input.searchParams ?? []) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      signal: input.signal,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AccuLynx request failed: ${error.message}` : "AccuLynx request failed",
    );
  }

  if (input.method === "PUT" && response.status === 204) {
    return new Response(null, { status: 200 });
  }

  return response;
}

async function readAcculynxPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAcculynxError(response: Response, payload: unknown, phase: RequestPhase) {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "AccuLynx request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if ([400, 404, 412, 416, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function buildPaginationSearchParams(input: Record<string, number | string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue;
    }
    searchParams.set(key, String(value));
  }
  return searchParams;
}

function readOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value;
}

function normalizeCompanySettings(payload: unknown) {
  const record = requiredResponseRecord(payload, "company settings");
  const timeZoneInfo = optionalRecord(record.timeZoneInfo);
  return compactObject({
    id: requiredInputString(record.id, "id"),
    name: requiredInputString(record.name, "name"),
    hasInsurance: optionalBoolean(record.hasInsurance),
    timeZoneInfo: timeZoneInfo
      ? compactObject({
          name: optionalString(timeZoneInfo.name),
          daylightName: optionalString(timeZoneInfo.daylightName),
          baseUtcOffset: optionalString(timeZoneInfo.baseUtcOffset),
          adjustedUtcOffset: optionalString(timeZoneInfo.adjustedUtcOffset),
          supportsDaylightSavingTime: optionalBoolean(timeZoneInfo.supportsDaylightSavingTime),
        })
      : undefined,
  });
}

function normalizeContactTypesCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "contact type");
    return {
      id: requiredInputString(record.id, "id"),
      name: requiredInputString(record.name, "name"),
      isDefault: readRequiredBoolean(record.isDefault, "isDefault"),
    };
  });
}

function normalizeLeadSourcesCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => normalizeLeadSource(item));
}

function normalizeJobCategoriesCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "job category");
    return {
      id: readRequiredInteger(record.id, "id"),
      name: requiredInputString(record.name, "name"),
    };
  });
}

function normalizeTradeTypesCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "trade type");
    return {
      id: requiredInputString(record.tradeId, "tradeId"),
      name: requiredInputString(record.name, "name"),
    };
  });
}

function normalizeWorkTypesCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "work type");
    return {
      id: readRequiredInteger(record.id, "id"),
      name: requiredInputString(record.name, "name"),
      systemDefault: readRequiredBoolean(record.systemDefault, "systemDefault"),
      link: requiredInputString(record._link, "_link"),
    };
  });
}

function normalizeCalendarsCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "calendar");
    return {
      id: requiredInputString(record.id, "id"),
      name: requiredInputString(record.name, "name"),
    };
  });
}

function normalizeCalendarAppointmentsCollection(payload: unknown) {
  return normalizePagedCollection(payload, (item) => {
    const record = requiredResponseRecord(item, "calendar appointment");
    return compactObject({
      id: requiredInputString(record.id, "id"),
      title: requiredInputString(record.title, "title"),
      start: requiredInputString(record.start, "start"),
      end: requiredInputString(record.end, "end"),
      allDay: readRequiredBoolean(record.allDay, "allDay"),
      jobId: optionalString(record.jobId),
      jobName: optionalString(record.jobName),
      location: optionalString(record.location),
      notes: optionalString(record.notes),
      eventType: optionalString(record.eventType),
      link: requiredInputString(record._link, "_link"),
    });
  });
}

function normalizeInitialAppointment(payload: unknown) {
  const record = requiredResponseRecord(payload, "initial appointment");
  return {
    link: requiredInputString(record._link, "_link"),
    startDate: optionalString(record.startDate) ?? null,
    endDate: optionalString(record.endDate) ?? null,
    notes: optionalString(record.notes) ?? null,
  };
}

function normalizeLeadSource(payload: unknown) {
  const record = requiredResponseRecord(payload, "lead source");
  const children = Array.isArray(record.children)
    ? record.children.map((item) => {
        const child = requiredResponseRecord(item, "lead source child");
        return {
          id: requiredInputString(child.id, "id"),
          parentId: requiredInputString(child.parentId, "parentId"),
          name: requiredInputString(child.name, "name"),
          link: requiredInputString(child._link, "_link"),
        };
      })
    : undefined;

  return compactObject({
    id: requiredInputString(record.id, "id"),
    name: requiredInputString(record.name, "name"),
    link: requiredInputString(record._link, "_link"),
    children,
  });
}

function normalizeLinkResource(payload: unknown, resourceName: string) {
  const record = requiredResponseRecord(payload, resourceName);
  return {
    id: requiredInputString(record.id, "id"),
    link: requiredInputString(record._link, `${resourceName}._link`),
  };
}

function normalizePagedCollection<T>(payload: unknown, mapItem: (item: unknown) => T) {
  const record = requiredResponseRecord(payload, "paged collection");
  const items = Array.isArray(record.items) ? record.items.map(mapItem) : [];
  return {
    count: readRequiredInteger(record.count, "count"),
    pageSize: readRequiredInteger(record.pageSize, "pageSize"),
    pageStartIndex: readRequiredInteger(record.pageStartIndex, "pageStartIndex"),
    items,
  };
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`);
  }
  return value;
}
