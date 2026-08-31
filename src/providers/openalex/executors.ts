import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";
import { openalexApiBaseUrl, openalexEntityValues } from "./constants.ts";

const service = "openalex";
const openalexEntities = new Set(openalexEntityValues);

type OpenAlexPhase = "validate" | "execute";
type OpenAlexActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const openalexActionHandlers: ProviderActionHandlers<"openalex", OpenAlexActionHandler> = {
  async list_entities(input, context) {
    const entity = readEntity(input.entity);
    const payload = await requestOpenAlexJson({
      path: `/${entity}`,
      apiKey: context.apiKey,
      params: buildListParams(input),
      context,
      phase: "execute",
    });

    return normalizeListResponse(payload, "entity");
  },
  async list_works(input, context) {
    const payload = await requestOpenAlexJson({
      path: "/works",
      apiKey: context.apiKey,
      params: buildListParams(input),
      context,
      phase: "execute",
    });

    const response = normalizeListResponse(payload, "work");
    return {
      meta: response.meta,
      works: response.results,
      groups: response.groups,
      rawResults: response.rawResults,
    };
  },
  async get_entity(input, context) {
    const entity = readEntity(input.entity);
    const id = readRequiredString(input.id, "id");
    const payload = await requestOpenAlexJson({
      path: `/${entity}/${encodeURIComponent(normalizeOpenAlexId(id))}`,
      apiKey: context.apiKey,
      params: {},
      context,
      phase: "execute",
    });
    const raw = requireRecord(payload, "OpenAlex returned an invalid entity payload");

    return {
      entity: normalizeEntitySummary(raw),
      raw,
    };
  },
  async get_work(input, context) {
    const id = readRequiredString(input.id, "id");
    const payload = await requestOpenAlexJson({
      path: `/works/${encodeURIComponent(normalizeOpenAlexId(id))}`,
      apiKey: context.apiKey,
      params: {},
      context,
      phase: "execute",
    });
    const raw = requireRecord(payload, "OpenAlex returned an invalid work payload");

    return {
      work: normalizeWorkSummary(raw),
      raw,
    };
  },
  async autocomplete(input, context) {
    const search = readRequiredString(input.search, "search");
    const entity = input.entity == null ? undefined : readEntity(input.entity);
    const payload = await requestOpenAlexJson({
      path: "/autocomplete",
      apiKey: context.apiKey,
      params: compactObject({
        search,
        filter: entity ? `entity_type:${entity}` : undefined,
        "per-page": readOptionalIntegerString(input.perPage),
      }),
      context,
      phase: "execute",
    });

    const response = requireRecord(payload, "OpenAlex returned an invalid autocomplete payload");
    const rawResults = readRecordArray(response.results);

    return {
      meta: normalizeMeta(response.meta),
      results: rawResults.map(normalizeAutocompleteItem),
      rawResults,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openalexActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestOpenAlexJson({
      path: "/works",
      apiKey: input.apiKey,
      params: { "per-page": "1" },
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const response = requireRecord(payload, "OpenAlex returned an invalid validation payload");
    const meta = normalizeMeta(response.meta);

    return {
      profile: {
        accountId: "openalex",
        displayName: "OpenAlex API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/works",
        apiBaseUrl: openalexApiBaseUrl,
        totalWorks: meta.count ?? undefined,
        dbResponseTimeMs: meta.dbResponseTimeMs ?? undefined,
      }),
    };
  },
};

async function requestOpenAlexJson(input: {
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: OpenAlexPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.context.signal, label: "OpenAlex" }, async (signal) => {
    const response = await input.context.fetcher(buildOpenAlexUrl(input.path, input.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readOpenAlexPayload(response);

    if (!response.ok) {
      throw createOpenAlexError(response.status, payload, input.phase);
    }

    return requireRecord(payload, "OpenAlex returned an invalid payload");
  });
}

function buildOpenAlexUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${openalexApiBaseUrl}/`);
  url.searchParams.set("api_key", apiKey);
  setSearchParams(url, params);
  return url;
}

function buildListParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    search: optionalString(input.search),
    filter: optionalString(input.filter),
    sort: optionalString(input.sort),
    cursor: optionalString(input.cursor),
    page: readOptionalIntegerString(input.page),
    "per-page": readOptionalIntegerString(input.perPage),
    select: readStringArrayParam(input.select),
    group_by: optionalString(input.groupBy),
    sample: readOptionalIntegerString(input.sample),
    seed: readOptionalIntegerString(input.seed),
  });
}

async function readOpenAlexPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OpenAlex returned invalid JSON");
  }
}

function createOpenAlexError(status: number, payload: unknown, phase: OpenAlexPhase): ProviderRequestError {
  const message = extractOpenAlexErrorMessage(payload) ?? `OpenAlex request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }

  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractOpenAlexErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_message);
}

function normalizeListResponse(
  payload: unknown,
  mode: "entity" | "work",
): {
  meta: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
  groups: Array<Record<string, unknown>>;
  rawResults: Array<Record<string, unknown>>;
} {
  const response = requireRecord(payload, "OpenAlex returned an invalid list payload");
  const rawResults = readRecordArray(response.results);
  const rawGroups = readRecordArray(response.group_by);

  return {
    meta: normalizeMeta(response.meta),
    results: mode === "work" ? rawResults.map(normalizeWorkSummary) : rawResults.map(normalizeEntitySummary),
    groups: rawGroups.map(normalizeGroup),
    rawResults,
  };
}

function normalizeMeta(value: unknown): Record<string, unknown> {
  const meta = optionalRecord(value) ?? {};
  return {
    count: readNullableInteger(meta.count),
    dbResponseTimeMs: readNullableInteger(meta.db_response_time_ms),
    page: readNullableInteger(meta.page),
    perPage: readNullableInteger(meta.per_page),
    nextCursor: readNullableString(meta.next_cursor),
    groupsCount: readNullableInteger(meta.groups_count),
    raw: meta,
  };
}

function normalizeEntitySummary(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(raw.id),
    openalexId: extractOpenAlexShortId(raw.id),
    displayName: readNullableString(raw.display_name) ?? readNullableString(raw.title),
    worksCount: readNullableInteger(raw.works_count),
    citedByCount: readNullableInteger(raw.cited_by_count),
    homepageUrl: readNullableString(raw.homepage_url),
    raw,
  };
}

function normalizeWorkSummary(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(raw.id),
    openalexId: extractOpenAlexShortId(raw.id),
    doi: readNullableString(raw.doi),
    title: readNullableString(raw.title) ?? readNullableString(raw.display_name),
    publicationYear: readNullableInteger(raw.publication_year),
    publicationDate: readNullableString(raw.publication_date),
    type: readNullableString(raw.type),
    citedByCount: readNullableInteger(raw.cited_by_count),
    openAccessUrl: readNestedNullableString(raw.open_access, "oa_url"),
    primaryLocationUrl: readNestedNullableString(raw.primary_location, "landing_page_url"),
    raw,
  };
}

function normalizeGroup(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    key: readNullableString(raw.key),
    keyDisplayName: readNullableString(raw.key_display_name),
    count: readNullableInteger(raw.count),
    raw,
  };
}

function normalizeAutocompleteItem(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableString(raw.id),
    openalexId: extractOpenAlexShortId(raw.id),
    displayName: readNullableString(raw.display_name),
    hint: readNullableString(raw.hint),
    entityType: readNullableString(raw.entity_type),
    citedByCount: readNullableInteger(raw.cited_by_count),
    worksCount: readNullableInteger(raw.works_count),
    externalId: readNullableString(raw.external_id),
    raw,
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readEntity(value: unknown): string {
  const entity = readRequiredString(value, "entity");
  if (!openalexEntities.has(entity)) {
    throw new ProviderRequestError(400, `unsupported OpenAlex entity: ${entity}`);
  }
  return entity;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readNullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function readStringArrayParam(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const items = value.flatMap((item) => {
    const parsed = optionalString(item);
    return parsed ? [parsed] : [];
  });

  return items.length > 0 ? items.join(",") : undefined;
}

function readNestedNullableString(value: unknown, key: string): string | null {
  const record = optionalRecord(value);
  return record ? readNullableString(record[key]) : null;
}

function normalizeOpenAlexId(value: string): string {
  const trimmed = trimUrlSuffix(value.trim());
  const slashIndex = trimmed.lastIndexOf("/");
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

function trimUrlSuffix(value: string): string {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const suffixIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  const suffixIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : -1;
  let trimmed = suffixIndex >= 0 ? value.slice(0, suffixIndex) : value;

  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

function extractOpenAlexShortId(value: unknown): string | null {
  const id = readNullableString(value);
  if (!id) {
    return null;
  }

  return normalizeOpenAlexId(id);
}
