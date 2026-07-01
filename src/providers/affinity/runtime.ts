import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AffinityActionName } from "./actions.ts";

import { compactObject, nullableString, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const affinityApiBaseUrl = "https://api.affinity.co";
export const affinityValidationPath = "/v2/auth/whoami";
const affinityRequestTimeoutMs = 30_000;

type AffinityMode = "validation" | "execution";
type AffinityActionHandler = (input: Record<string, unknown>, context: AffinityActionContext) => Promise<unknown>;

type AffinityActionContext = {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
};

type AffinityPagedResponse = {
  data: unknown;
  pagination: unknown;
};

export const affinityActionHandlers: Record<AffinityActionName, AffinityActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_persons(input, context) {
    return listPersons(input, context);
  },
  get_person(input, context) {
    return getPerson(input, context);
  },
  list_person_fields(input, context) {
    return listPersonFields(input, context);
  },
  list_person_lists(input, context) {
    return listPersonLists(input, context);
  },
  list_person_list_entries(input, context) {
    return listPersonListEntries(input, context);
  },
  list_companies(input, context) {
    return listCompanies(input, context);
  },
  get_company(input, context) {
    return getCompany(input, context);
  },
  list_company_fields(input, context) {
    return listCompanyFields(input, context);
  },
  list_company_lists(input, context) {
    return listCompanyLists(input, context);
  },
  list_company_list_entries(input, context) {
    return listCompanyListEntries(input, context);
  },
  list_opportunities(input, context) {
    return listOpportunities(input, context);
  },
  get_opportunity(input, context) {
    return getOpportunity(input, context);
  },
  list_lists(input, context) {
    return listLists(input, context);
  },
  get_list(input, context) {
    return getList(input, context);
  },
  list_list_fields(input, context) {
    return listListFields(input, context);
  },
  list_list_entries(input, context) {
    return listListEntries(input, context);
  },
  list_saved_views(input, context) {
    return listSavedViews(input, context);
  },
  get_saved_view(input, context) {
    return getSavedView(input, context);
  },
  list_saved_view_list_entries(input, context) {
    return listSavedViewListEntries(input, context);
  },
} satisfies Record<AffinityActionName, AffinityActionHandler>;

export async function validateAffinityCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "affinity api_key is required");
  }

  const payload = readWhoAmI(
    await affinityRequest(affinityValidationPath, {}, trimmedApiKey, fetcher, "validation", signal),
  );

  const user = payload.user;
  const tenant = payload.tenant;
  const grant = payload.grant;
  const firstName = optionalString(user.firstName)?.trim();
  const lastName = nullableString(user.lastName)?.trim() ?? null;
  const fullName = [firstName, lastName].filter((value) => value && value.length > 0).join(" ");
  const emailAddress = optionalString(user.emailAddress)?.trim();
  const userId = readPositiveInteger(user.id, "user.id");
  const tenantId = readPositiveInteger(tenant.id, "tenant.id");
  const providerScopes = readStringArray(grant.scopes, "grant.scopes");

  return {
    profile: {
      accountId: String(userId),
      displayName: fullName || emailAddress || String(userId),
      grantedScopes: providerScopes,
    },
    grantedScopes: providerScopes,
    metadata: compactObject({
      apiBaseUrl: affinityApiBaseUrl,
      validationEndpoint: affinityValidationPath,
      userId,
      userEmailAddress: emailAddress,
      tenantId,
      tenantName: optionalString(tenant.name)?.trim(),
      tenantSubdomain: optionalString(tenant.subdomain)?.trim(),
      grantType: optionalString(grant.type)?.trim(),
      grantCreatedAt: optionalString(grant.createdAt)?.trim(),
    }),
  };
}

async function getCurrentUser(context: AffinityActionContext) {
  return readWhoAmI(
    await affinityRequest(affinityValidationPath, {}, context.apiKey, context.fetcher, "execution", context.signal),
  );
}

async function listPersons(input: Record<string, unknown>, context: AffinityActionContext) {
  return readEntityPage(
    await affinityRequest(
      "/v2/persons",
      buildEntityQuery(input, { includeIds: true, includeFieldSelectors: true }),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
    "persons",
  );
}

async function getPerson(input: Record<string, unknown>, context: AffinityActionContext) {
  return {
    person: readObjectPayload(
      await affinityRequest(
        `/v2/persons/${readPositiveInteger(input.personId, "personId")}`,
        buildEntityQuery(input, { includeFieldSelectors: true }),
        context.apiKey,
        context.fetcher,
        "execution",
        context.signal,
      ),
      "person",
    ),
  };
}

async function listPersonFields(input: Record<string, unknown>, context: AffinityActionContext) {
  return readFieldMetadataPage(
    await affinityRequest(
      "/v2/persons/fields",
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listPersonLists(input: Record<string, unknown>, context: AffinityActionContext) {
  return readListPage(
    await affinityRequest(
      `/v2/persons/${readPositiveInteger(input.personId, "personId")}/lists`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listPersonListEntries(input: Record<string, unknown>, context: AffinityActionContext) {
  return readEntityListEntryPage(
    await affinityRequest(
      `/v2/persons/${readPositiveInteger(input.personId, "personId")}/list-entries`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listCompanies(input: Record<string, unknown>, context: AffinityActionContext) {
  return readCompanyPage(
    await affinityRequest(
      "/v2/companies",
      buildEntityQuery(input, { includeIds: true, includeFieldSelectors: true }),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function getCompany(input: Record<string, unknown>, context: AffinityActionContext) {
  return {
    company: readObjectPayload(
      await affinityRequest(
        `/v2/companies/${readPositiveInteger(input.companyId, "companyId")}`,
        buildEntityQuery(input, { includeFieldSelectors: true }),
        context.apiKey,
        context.fetcher,
        "execution",
        context.signal,
      ),
      "company",
    ),
  };
}

async function listCompanyFields(input: Record<string, unknown>, context: AffinityActionContext) {
  return readFieldMetadataPage(
    await affinityRequest(
      "/v2/companies/fields",
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listCompanyLists(input: Record<string, unknown>, context: AffinityActionContext) {
  return readListPage(
    await affinityRequest(
      `/v2/companies/${readPositiveInteger(input.companyId, "companyId")}/lists`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listCompanyListEntries(input: Record<string, unknown>, context: AffinityActionContext) {
  return readEntityListEntryPage(
    await affinityRequest(
      `/v2/companies/${readPositiveInteger(input.companyId, "companyId")}/list-entries`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listOpportunities(input: Record<string, unknown>, context: AffinityActionContext) {
  return readOpportunityPage(
    await affinityRequest(
      "/v2/opportunities",
      buildEntityQuery(input, { includeIds: true }),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function getOpportunity(input: Record<string, unknown>, context: AffinityActionContext) {
  return {
    opportunity: readObjectPayload(
      await affinityRequest(
        `/v2/opportunities/${readPositiveInteger(input.opportunityId, "opportunityId")}`,
        {},
        context.apiKey,
        context.fetcher,
        "execution",
        context.signal,
      ),
      "opportunity",
    ),
  };
}

async function listLists(input: Record<string, unknown>, context: AffinityActionContext) {
  return readListPage(
    await affinityRequest(
      "/v2/lists",
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function getList(input: Record<string, unknown>, context: AffinityActionContext) {
  return {
    list: readObjectPayload(
      await affinityRequest(
        `/v2/lists/${readPositiveInteger(input.listId, "listId")}`,
        {},
        context.apiKey,
        context.fetcher,
        "execution",
        context.signal,
      ),
      "list",
    ),
  };
}

async function listListFields(input: Record<string, unknown>, context: AffinityActionContext) {
  return readFieldMetadataPage(
    await affinityRequest(
      `/v2/lists/${readPositiveInteger(input.listId, "listId")}/fields`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listListEntries(input: Record<string, unknown>, context: AffinityActionContext) {
  return readSavedViewListEntryPage(
    await affinityRequest(
      `/v2/lists/${readPositiveInteger(input.listId, "listId")}/list-entries`,
      buildListEntriesQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function listSavedViews(input: Record<string, unknown>, context: AffinityActionContext) {
  return readSavedViewPage(
    await affinityRequest(
      `/v2/lists/${readPositiveInteger(input.listId, "listId")}/saved-views`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function getSavedView(input: Record<string, unknown>, context: AffinityActionContext) {
  return {
    savedView: readObjectPayload(
      await affinityRequest(
        `/v2/lists/${readPositiveInteger(input.listId, "listId")}/saved-views/${readPositiveInteger(
          input.viewId,
          "viewId",
        )}`,
        {},
        context.apiKey,
        context.fetcher,
        "execution",
        context.signal,
      ),
      "saved view",
    ),
  };
}

async function listSavedViewListEntries(input: Record<string, unknown>, context: AffinityActionContext) {
  return readSavedViewListEntryPage(
    await affinityRequest(
      `/v2/lists/${readPositiveInteger(input.listId, "listId")}/saved-views/${readPositiveInteger(
        input.viewId,
        "viewId",
      )}/list-entries`,
      buildPageQuery(input),
      context.apiKey,
      context.fetcher,
      "execution",
      context.signal,
    ),
  );
}

async function affinityRequest(
  path: string,
  query: Record<string, string | string[] | undefined>,
  apiKey: string,
  fetcher: ProviderFetch,
  mode: AffinityMode,
  signal?: AbortSignal,
) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${affinityApiBaseUrl}/`);
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

  const timeoutSignal = AbortSignal.timeout(affinityRequestTimeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: requestSignal,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Affinity request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Affinity request failed: ${error.message}` : "Affinity request failed",
    );
  }

  const payload = await readAffinityPayload(response, !response.ok);
  if (!response.ok) {
    throw buildAffinityError(response.status, payload, mode);
  }

  return payload;
}

async function readAffinityPayload(response: Response, allowNonJsonText: boolean) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (allowNonJsonText) {
      return text;
    }

    throw new ProviderRequestError(502, "Affinity returned invalid JSON");
  }
}

function buildAffinityError(status: number, payload: unknown, mode: AffinityMode) {
  const message = extractAffinityErrorMessage(payload) ?? `Affinity request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (mode === "validation" && status === 401) {
    return new ProviderRequestError(400, message);
  }

  if (mode === "execution" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }

  if (status === 404) {
    return new ProviderRequestError(400, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

function extractAffinityErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message)?.trim() ?? optionalString(record.error)?.trim();
  if (directMessage) {
    return directMessage;
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  for (const entry of errors) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      return entry.trim();
    }

    const nested = optionalRecord(entry);
    const nestedMessage = optionalString(nested?.message)?.trim() ?? optionalString(nested?.error)?.trim();
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return undefined;
}

function buildPageQuery(input: Record<string, unknown>) {
  return compactObject({
    cursor: readOptionalTrimmedString(input.cursor),
    limit: readOptionalPositiveInteger(input.limit, "limit")?.toString(),
  });
}

function buildEntityQuery(
  input: Record<string, unknown>,
  options: {
    includeIds?: boolean;
    includeFieldSelectors?: boolean;
  },
) {
  return compactObject({
    ...buildPageQuery(input),
    ...(options.includeIds
      ? {
          ids: readOptionalPositiveIntegerArray(input.ids, "ids")?.map((value) => String(value)),
        }
      : {}),
    ...(options.includeFieldSelectors
      ? {
          fieldIds: readOptionalStringArray(input.fieldIds, "fieldIds"),
          fieldTypes: readOptionalStringArray(input.fieldTypes, "fieldTypes"),
        }
      : {}),
  });
}

function buildListEntriesQuery(input: Record<string, unknown>) {
  return compactObject({
    ...buildPageQuery(input),
    fieldIds: readOptionalStringArray(input.fieldIds, "fieldIds"),
    fieldTypes: readOptionalStringArray(input.fieldTypes, "fieldTypes"),
  });
}

function readWhoAmI(payload: unknown) {
  const record = readRequiredObject(payload, "whoami");
  return {
    tenant: readRequiredObject(record.tenant, "tenant"),
    user: readRequiredObject(record.user, "user"),
    grant: readRequiredObject(record.grant, "grant"),
  };
}

function readEntityPage(payload: unknown, key: "persons") {
  const page = readPagedResponse(payload, key);
  return {
    persons: readRequiredArray(page.data, key),
    pagination: readPagination(page.pagination),
  };
}

function readCompanyPage(payload: unknown) {
  const page = readPagedResponse(payload, "companies");
  return {
    companies: readRequiredArray(page.data, "companies"),
    pagination: readPagination(page.pagination),
  };
}

function readOpportunityPage(payload: unknown) {
  const page = readPagedResponse(payload, "opportunities");
  return {
    opportunities: readRequiredArray(page.data, "opportunities"),
    pagination: readPagination(page.pagination),
  };
}

function readListPage(payload: unknown) {
  const page = readPagedResponse(payload, "lists");
  return {
    lists: readRequiredArray(page.data, "lists"),
    pagination: readPagination(page.pagination),
  };
}

function readSavedViewPage(payload: unknown) {
  const page = readPagedResponse(payload, "saved views");
  return {
    savedViews: readRequiredArray(page.data, "saved views"),
    pagination: readPagination(page.pagination),
  };
}

function readFieldMetadataPage(payload: unknown) {
  const page = readPagedResponse(payload, "fields");
  return {
    fields: readRequiredArray(page.data, "fields"),
    pagination: readPagination(page.pagination),
  };
}

function readSavedViewListEntryPage(payload: unknown) {
  const page = readPagedResponse(payload, "list entries");
  return {
    listEntries: readOptionalArray(page.data) ?? [],
    pagination: readPagination(page.pagination),
  };
}

function readEntityListEntryPage(payload: unknown) {
  const page = readPagedResponse(payload, "entity list entries");
  return {
    listEntries: readRequiredArray(page.data, "entity list entries"),
    pagination: readPagination(page.pagination),
  };
}

function readPagedResponse(payload: unknown, fieldName: string): AffinityPagedResponse {
  const record = readRequiredObject(payload, fieldName);
  return {
    data: record.data,
    pagination: record.pagination,
  };
}

function readPagination(value: unknown) {
  const record = readRequiredObject(value, "pagination");
  return {
    nextUrl: nullableString(record.nextUrl),
    prevUrl: nullableString(record.prevUrl),
  };
}

function readObjectPayload(payload: unknown, fieldName: string) {
  return readRequiredObject(payload, fieldName);
}

function readRequiredObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Affinity ${fieldName} response must be an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Affinity ${fieldName} response must be an array`);
  }
  return value as Array<Record<string, unknown>>;
}

function readOptionalArray(value: unknown) {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Affinity list entries response must be an array or null");
  }
  return value as Array<Record<string, unknown>>;
}

function readPositiveInteger(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value == null || value === "") {
    return undefined;
  }
  return readPositiveInteger(value, fieldName);
}

function readOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Affinity ${fieldName} response must be an array`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `Affinity ${fieldName}[${index}] response must be a string`);
    }
    return item;
  });
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must be a string`);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must not be empty`);
    }
    return trimmed;
  });
}

function readOptionalPositiveIntegerArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item, index) => readPositiveInteger(item, `${fieldName}[${index}]`));
}

function isAbortLikeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
