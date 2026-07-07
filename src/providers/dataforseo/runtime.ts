import { Buffer } from "node:buffer";
import { compactObject, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type DataForSeoPhase = "validate" | "execute";
type DataForSeoCredential = {
  login: string;
  password: string;
};
type DataForSeoActionContext = DataForSeoCredential & {
  fetcher: typeof fetch;
};
type DataForSeoActionHandler = (input: Record<string, unknown>, context: DataForSeoActionContext) => Promise<unknown>;
type DataForSeoTask = Record<string, unknown> & {
  status_code?: unknown;
  status_message?: unknown;
  result?: unknown;
};
type DataForSeoEnvelope = Record<string, unknown> & {
  status_code?: unknown;
  status_message?: unknown;
  tasks?: unknown;
};
type DataForSeoRequestInput = {
  path: string;
  credential: DataForSeoCredential;
  fetcher: typeof fetch;
  phase: DataForSeoPhase;
  body?: Record<string, unknown>[];
};

export const dataForSeoApiBaseUrl: string = "https://api.dataforseo.com/v3";
const dataForSeoApiBase = new URL(`${dataForSeoApiBaseUrl}/`);

export const dataForSeoActionHandlers: Record<string, DataForSeoActionHandler> = {
  async get_user_data(_input, context) {
    return requestDataForSeoUserData(context, "execute");
  },
  async google_organic_live_advanced(input, context) {
    return requestDataForSeoTaskResults({
      path: "/serp/google/organic/live/advanced",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        compactObject({
          keyword: readRequiredString(input.keyword, "keyword"),
          location_name: readOptionalString(input.locationName),
          location_code: readOptionalInteger(input.locationCode, "locationCode"),
          language_name: readOptionalString(input.languageName),
          language_code: readOptionalString(input.languageCode),
          device: readOptionalString(input.device),
          os: readOptionalString(input.os),
          depth: readOptionalInteger(input.depth, "depth"),
          tag: readOptionalString(input.tag),
        }),
      ],
    });
  },
  async google_ads_search_volume_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/keywords_data/google_ads/search_volume/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        compactObject({
          keywords: readRequiredStringArray(input.keywords, "keywords"),
          location_name: readOptionalString(input.locationName),
          location_code: readOptionalInteger(input.locationCode, "locationCode"),
          language_name: readOptionalString(input.languageName),
          language_code: readOptionalString(input.languageCode),
          tag: readOptionalString(input.tag),
        }),
      ],
    });
  },
  async google_keyword_suggestions_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/keyword_suggestions/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        compactObject({
          keyword: readRequiredString(input.keyword, "keyword"),
          location_name: readOptionalString(input.locationName),
          location_code: readOptionalInteger(input.locationCode, "locationCode"),
          language_name: readOptionalString(input.languageName),
          language_code: readOptionalString(input.languageCode),
          limit: readOptionalInteger(input.limit, "limit"),
          include_seed_keyword: readOptionalBoolean(input.includeSeedKeyword),
          tag: readOptionalString(input.tag),
        }),
      ],
    });
  },
  async google_keyword_overview_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/keyword_overview/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStringArrays: [["keywords", "keywords"]],
          location: true,
          booleanFields: [
            ["includeSerpInfo", "include_serp_info"],
            ["includeClickstreamData", "include_clickstream_data"],
          ],
          stringFields: [["tag", "tag"]],
        }),
      ],
    });
  },
  async google_keyword_ideas_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/keyword_ideas/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStringArrays: [["keywords", "keywords"]],
          location: true,
          booleanFields: [
            ["closelyVariants", "closely_variants"],
            ["ignoreSynonyms", "ignore_synonyms"],
            ["includeSerpInfo", "include_serp_info"],
            ["includeClickstreamData", "include_clickstream_data"],
          ],
          stringFields: [["offsetToken", "offset_token"]],
          list: true,
        }),
      ],
    });
  },
  async google_keywords_for_site_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/keywords_for_site/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStrings: [["target", "target"]],
          location: true,
          booleanFields: [
            ["includeSerpInfo", "include_serp_info"],
            ["includeSubdomains", "include_subdomains"],
            ["includeClickstreamData", "include_clickstream_data"],
          ],
          stringFields: [["offsetToken", "offset_token"]],
          list: true,
        }),
      ],
    });
  },
  async google_serp_competitors_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/serp_competitors/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStringArrays: [["keywords", "keywords"]],
          locationFields: true,
          booleanFields: [["includeSubdomains", "include_subdomains"]],
          stringArrayFields: [["itemTypes", "item_types"]],
          list: true,
        }),
      ],
    });
  },
  async google_domain_rank_overview_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/domain_rank_overview/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStrings: [["target", "target"]],
          location: true,
          booleanFields: [["ignoreSynonyms", "ignore_synonyms"]],
          integerFields: [
            ["limit", "limit"],
            ["offset", "offset"],
          ],
          stringFields: [["tag", "tag"]],
        }),
      ],
    });
  },
  async google_relevant_pages_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/dataforseo_labs/google/relevant_pages/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildDataForSeoBody(input, {
          requiredStrings: [["target", "target"]],
          booleanFields: [
            ["ignoreSynonyms", "ignore_synonyms"],
            ["includeClickstreamData", "include_clickstream_data"],
          ],
          stringFields: [["historicalSerpMode", "historical_serp_mode"]],
          stringArrayFields: [["itemTypes", "item_types"]],
          list: true,
        }),
      ],
    });
  },
  async backlinks_summary_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/backlinks/summary/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [buildBacklinksSummaryBody(input)],
    });
  },
  async backlinks_list_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/backlinks/backlinks/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [
        buildBacklinksBody(input, {
          stringFields: [
            ["mode", "mode"],
            ["searchAfterToken", "search_after_token"],
          ],
          objectFields: [["customMode", "custom_mode"]],
          list: true,
        }),
      ],
    });
  },
  async backlinks_referring_domains_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/backlinks/referring_domains/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [buildBacklinksAggregateBody(input)],
    });
  },
  async backlinks_anchors_live(input, context) {
    return requestDataForSeoTaskResults({
      path: "/backlinks/anchors/live",
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      body: [buildBacklinksAggregateBody(input)],
    });
  },
};

export async function requestDataForSeoUserData(
  context: DataForSeoActionContext,
  phase: DataForSeoPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestDataForSeoJson({
    path: "/appendix/user_data",
    credential: context,
    fetcher: context.fetcher,
    phase,
  });
  const firstResult = getFirstDataForSeoResult(payload);
  return firstResult ?? {};
}

async function requestDataForSeoTaskResults(input: DataForSeoRequestInput) {
  const payload = await requestDataForSeoJson(input);
  const task = getFirstDataForSeoTask(payload);
  return compactObject({
    task: task ? normalizeDataForSeoTask(task) : undefined,
    results: task ? readResultArray(task.result) : [],
  });
}

async function requestDataForSeoJson(input: DataForSeoRequestInput) {
  const response = await fetchDataForSeo(input);
  const payload = await readJsonPayload(response);
  const envelope = asDataForSeoEnvelope(payload);
  if (!response.ok || !isSuccessfulStatus(envelope.status_code)) {
    throw createDataForSeoError(response.status, envelope, input.phase);
  }

  const task = getFirstDataForSeoTask(envelope);
  if (task && !isSuccessfulStatus(task.status_code)) {
    throw createDataForSeoTaskError(task, input.phase);
  }

  return envelope;
}

async function fetchDataForSeo(input: DataForSeoRequestInput) {
  try {
    return await input.fetcher(new URL(normalizeDataForSeoPath(input.path), dataForSeoApiBase), {
      method: input.body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${createBasicAuthToken(input.credential)}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error ? 502 : 502,
      error instanceof Error ? `DataForSEO request failed: ${error.message}` : "DataForSEO request failed",
    );
  }
}

function normalizeDataForSeoPath(path: string) {
  return path.startsWith("/") ? path.slice(1) : path;
}

function createBasicAuthToken(credential: DataForSeoCredential) {
  return Buffer.from(`${credential.login}:${credential.password}`).toString("base64");
}

async function readJsonPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "DataForSEO returned invalid JSON");
  }
}

function asDataForSeoEnvelope(payload: unknown): DataForSeoEnvelope {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "DataForSEO returned an invalid response");
  }
  return payload as DataForSeoEnvelope;
}

function getFirstDataForSeoTask(payload: DataForSeoEnvelope) {
  if (!Array.isArray(payload.tasks)) {
    return undefined;
  }
  const [task] = payload.tasks;
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return undefined;
  }
  return task as DataForSeoTask;
}

function getFirstDataForSeoResult(payload: DataForSeoEnvelope) {
  const task = getFirstDataForSeoTask(payload);
  if (!task) {
    return undefined;
  }
  const [result] = readResultArray(task.result);
  return result;
}

function readResultArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
}

function normalizeDataForSeoTask(task: DataForSeoTask) {
  return compactObject({
    id: optionalString(task.id),
    status_code: readOptionalNumber(task.status_code),
    status_message: optionalString(task.status_message),
    time: optionalString(task.time),
    cost: readOptionalNumber(task.cost),
    result_count: readOptionalNumber(task.result_count),
  });
}

function createDataForSeoError(httpStatus: number, envelope: DataForSeoEnvelope, phase: DataForSeoPhase) {
  const statusMessage = optionalString(envelope.status_message) ?? "DataForSEO request failed";
  const envelopeStatusCode = readOptionalNumber(envelope.status_code);
  const isAuthError = httpStatus === 401 || httpStatus === 403 || envelopeStatusCode === 40100;
  return new ProviderRequestError(phase === "validate" || isAuthError ? 400 : 502, statusMessage);
}

function createDataForSeoTaskError(task: DataForSeoTask, phase: DataForSeoPhase) {
  const statusMessage = optionalString(task.status_message) ?? "DataForSEO task failed";
  const statusCode = readOptionalNumber(task.status_code);
  const isAuthError = statusCode === 40100;
  return new ProviderRequestError(phase === "validate" || isAuthError ? 400 : 502, statusMessage);
}

function isSuccessfulStatus(statusCode: unknown) {
  const parsed = readOptionalNumber(statusCode);
  return parsed === undefined || (parsed >= 20000 && parsed < 30000);
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readRequiredStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must contain at least one keyword`);
  }
  return value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}

type FieldPair = readonly [inputKey: string, outputKey: string];

function buildDataForSeoBody(
  input: Record<string, unknown>,
  options: {
    requiredStrings?: readonly FieldPair[];
    requiredStringArrays?: readonly FieldPair[];
    stringFields?: readonly FieldPair[];
    stringArrayFields?: readonly FieldPair[];
    integerFields?: readonly FieldPair[];
    booleanFields?: readonly FieldPair[];
    objectFields?: readonly FieldPair[];
    jsonArrayFields?: readonly FieldPair[];
    location?: boolean;
    locationFields?: boolean;
    list?: boolean;
  },
) {
  const body: Record<string, unknown> = {};

  for (const [inputKey, outputKey] of options.requiredStrings ?? []) {
    body[outputKey] = readRequiredString(input[inputKey], inputKey);
  }
  for (const [inputKey, outputKey] of options.requiredStringArrays ?? []) {
    body[outputKey] = readRequiredStringArray(input[inputKey], inputKey);
  }
  for (const [inputKey, outputKey] of options.stringFields ?? []) {
    body[outputKey] = readOptionalString(input[inputKey]);
  }
  for (const [inputKey, outputKey] of options.stringArrayFields ?? []) {
    body[outputKey] = readOptionalStringArray(input[inputKey], inputKey);
  }
  for (const [inputKey, outputKey] of options.integerFields ?? []) {
    body[outputKey] = readOptionalInteger(input[inputKey], inputKey);
  }
  for (const [inputKey, outputKey] of options.booleanFields ?? []) {
    body[outputKey] = readOptionalBoolean(input[inputKey]);
  }
  for (const [inputKey, outputKey] of options.objectFields ?? []) {
    body[outputKey] = readOptionalObject(input[inputKey]);
  }
  for (const [inputKey, outputKey] of options.jsonArrayFields ?? []) {
    body[outputKey] = readOptionalJsonArray(input[inputKey], inputKey);
  }

  if (options.location) {
    Object.assign(body, buildLocationBody(input));
  }
  if (options.locationFields) {
    Object.assign(body, buildLocationFieldBody(input));
  }
  if (options.list) {
    Object.assign(body, buildListBody(input));
  }

  return compactObject(body);
}

function buildBacklinksBody(
  input: Record<string, unknown>,
  options: {
    stringFields?: readonly FieldPair[];
    objectFields?: readonly FieldPair[];
    aggregate?: boolean;
    list?: boolean;
  } = {},
) {
  return buildDataForSeoBody(input, {
    requiredStrings: [["target", "target"]],
    stringFields: [
      ["backlinksStatusType", "backlinks_status_type"],
      ["rankScale", "rank_scale"],
      ["tag", "tag"],
      ...(options.stringFields ?? []),
    ],
    booleanFields: [
      ["includeSubdomains", "include_subdomains"],
      ["includeIndirectLinks", "include_indirect_links"],
      ["excludeInternalBacklinks", "exclude_internal_backlinks"],
    ],
    objectFields: options.objectFields,
    list: options.list,
    ...(options.aggregate
      ? {
          integerFields: [["internalListLimit", "internal_list_limit"]],
          jsonArrayFields: [["backlinksFilters", "backlinks_filters"]],
        }
      : {}),
  });
}

function buildBacklinksSummaryBody(input: Record<string, unknown>) {
  return buildBacklinksBody(input, {
    aggregate: true,
  });
}

function buildBacklinksAggregateBody(input: Record<string, unknown>) {
  return buildBacklinksBody(input, {
    aggregate: true,
    list: true,
  });
}

function buildLocationBody(input: Record<string, unknown>) {
  return compactObject({
    location_name: readOptionalString(input.locationName),
    location_code: readOptionalInteger(input.locationCode, "locationCode"),
    language_name: readOptionalString(input.languageName),
    language_code: readOptionalString(input.languageCode),
  });
}

function buildLocationFieldBody(input: Record<string, unknown>) {
  return compactObject({
    location_name: readOptionalString(input.locationName),
    location_code: readOptionalInteger(input.locationCode, "locationCode"),
  });
}

function buildListBody(input: Record<string, unknown>) {
  return compactObject({
    limit: readOptionalInteger(input.limit, "limit"),
    offset: readOptionalInteger(input.offset, "offset"),
    filters: readOptionalJsonArray(input.filters, "filters"),
    backlinks_filters: readOptionalJsonArray(input.backlinksFilters, "backlinksFilters"),
    order_by: readOptionalStringArray(input.orderBy, "orderBy"),
    tag: readOptionalString(input.tag),
  });
}

function readOptionalInteger(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  const parsed = readOptionalNumber(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a string array`);
  }
  return value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}

function readOptionalJsonArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value;
}

function readOptionalObject(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(400, "object input is required");
  }
  return value as Record<string, unknown>;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
