import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  setSearchParams,
} from "../provider-runtime.ts";

const webOfScienceExpandedApiBaseUrl = "https://wos-api.clarivate.com/api/wos";
const webOfScienceExpandedRequestTimeoutMs = 30_000;

type WebOfScienceExpandedPhase = "validate" | "execute";
type WebOfScienceExpandedContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WebOfScienceExpandedActionHandler = (
  input: Record<string, unknown>,
  context: WebOfScienceExpandedContext,
) => Promise<unknown>;

export const webOfScienceExpandedActionHandlers: Record<string, WebOfScienceExpandedActionHandler> = {
  async search_documents(input, context) {
    validateSearchOptions(input);
    const limit = optionalInteger(input.limit) ?? 10;
    const firstRecord = optionalInteger(input.firstRecord) ?? 1;
    const payload = await requestWebOfScienceExpandedJson(
      {
        path: "/",
        query: buildSearchParams(input, { limit, firstRecord }),
        phase: "execute",
      },
      context,
    );

    return normalizeDocumentSearch(payload, firstRecord, limit);
  },

  async get_documents(input, context) {
    validateSearchOptions(input);
    const uids = readRequiredStringArray(input.uids, "uids");
    const database = optionalString(input.database) ?? "WOS";
    const payload = await requestWebOfScienceExpandedJson(
      {
        path: `/id/${uids.map((uid) => encodeURIComponent(uid)).join(",")}`,
        query: compactObject({
          databaseId: database,
          lang: normalizeLanguage(input.language),
          ...buildRecordViewParams(input, database),
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeDocumentSearch(payload, 1, uids.length);
  },

  async list_citing_documents(input, context) {
    return executeRelatedDocumentRequest("/citing", input, context);
  },

  async list_cited_references(input, context) {
    validateSearchOptions(input);
    const limit = optionalInteger(input.limit) ?? 10;
    const firstRecord = optionalInteger(input.firstRecord) ?? 1;
    const payload = await requestWebOfScienceExpandedJson(
      {
        path: "/references",
        query: compactObject({
          databaseId: optionalString(input.database) ?? "WOS",
          lang: normalizeLanguage(input.language),
          uniqueId: requiredString(input.uid, "uid", (message) => new ProviderRequestError(400, message)),
          count: String(limit),
          firstRecord: String(firstRecord),
          sortField: optionalString(input.sortField),
          optionOther: input.highlight === true ? "HL+On" : undefined,
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeReferenceSearch(payload, firstRecord, limit);
  },

  async list_related_documents(input, context) {
    return executeRelatedDocumentRequest("/related", input, context);
  },

  async get_citation_report(input, context) {
    validateSearchOptions(input);
    validateCitationYears(input);
    const searchPayload = await requestWebOfScienceExpandedJson(
      {
        path: "/",
        query: buildSearchParams(input, { limit: 0, firstRecord: 1, forceShort: true }),
        phase: "execute",
      },
      context,
    );
    const queryResult = requireQueryResult(searchPayload);
    const queryId = readRequiredResponseString(
      queryResult.QueryID,
      "Web of Science citation report query did not return QueryID",
    );
    const reportLevels = readOptionalStringArray(input.reportLevels) ?? ["WOS"];
    const reportPayload = await requestWebOfScienceExpandedJson(
      {
        path: `/citation-report/${encodeURIComponent(queryId)}`,
        query: compactObject({
          reportLevel: reportLevels.join(","),
          startYear: readOptionalIntegerString(input.startYear),
          endYear: readOptionalIntegerString(input.endYear),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      queryMetadata: {
        queryId,
        recordsSearched: optionalInteger(queryResult.RecordsSearched) ?? null,
        recordsFound: optionalInteger(queryResult.RecordsFound) ?? null,
      },
      reports: requireRecordArray(reportPayload, "Web of Science returned an invalid citation report").map(
        normalizeCitationReport,
      ),
      raw: {
        search: requireRecord(searchPayload, "Web of Science returned an invalid search response"),
        report: reportPayload,
      },
    };
  },
};

export async function validateWebOfScienceExpandedCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestWebOfScienceExpandedJson(
    {
      path: "/",
      query: {
        databaseId: "WOS",
        usrQuery: "TS=(bibliometrics)",
        count: "0",
        firstRecord: "1",
        optionView: "SR",
      },
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const queryResult = requireQueryResult(payload);

  return {
    profile: {
      accountId: "web_of_science_expanded:api_key",
      displayName: "Web of Science Expanded API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiProduct: "Web of Science API Expanded",
      validationEndpoint: "/",
      validationDatabase: "WOS",
      recordsSearched: optionalInteger(queryResult.RecordsSearched),
    }),
  };
}

async function executeRelatedDocumentRequest(
  path: "/citing" | "/related",
  input: Record<string, unknown>,
  context: WebOfScienceExpandedContext,
) {
  validateSearchOptions(input);
  const limit = optionalInteger(input.limit) ?? 10;
  const firstRecord = optionalInteger(input.firstRecord) ?? 1;
  const database = optionalString(input.database) ?? "WOS";
  const payload = await requestWebOfScienceExpandedJson(
    {
      path,
      query: compactObject({
        databaseId: database,
        lang: normalizeLanguage(input.language),
        uniqueId: requiredString(input.uid, "uid", (message) => new ProviderRequestError(400, message)),
        edition: optionalString(input.edition),
        publishTimeSpan: optionalString(input.publishTimeSpan),
        modifiedTimeSpan: optionalString(input.modifiedTimeSpan),
        tcModifiedTimeSpan: optionalString(input.timesCitedModifiedTimeSpan),
        count: String(limit),
        firstRecord: String(firstRecord),
        sortField: optionalString(input.sortField),
        ...buildRecordViewParams(input, database),
      }),
      phase: "execute",
    },
    context,
  );

  return normalizeDocumentSearch(payload, firstRecord, limit);
}

interface WebOfScienceExpandedSearchOptions {
  limit: number;
  firstRecord: number;
  forceShort?: boolean;
}

function buildSearchParams(
  input: Record<string, unknown>,
  options: WebOfScienceExpandedSearchOptions,
): Record<string, string | undefined> {
  const database = optionalString(input.database) ?? "WOS";
  const viewParams = options.forceShort ? { optionView: "SR" } : buildRecordViewParams(input, database);
  return compactObject({
    databaseId: database,
    lang: normalizeLanguage(input.language),
    usrQuery: requiredString(input.query, "query", (message) => new ProviderRequestError(400, message)),
    edition: optionalString(input.edition),
    publishTimeSpan: optionalString(input.publishTimeSpan),
    loadTimeSpan: optionalString(input.loadTimeSpan),
    createdTimeSpan: optionalString(input.createdTimeSpan),
    modifiedTimeSpan: optionalString(input.modifiedTimeSpan),
    tcModifiedTimeSpan: optionalString(input.timesCitedModifiedTimeSpan),
    count: String(options.limit),
    firstRecord: String(options.firstRecord),
    sortField: optionalString(input.sortField),
    ...viewParams,
  });
}

function buildRecordViewParams(input: Record<string, unknown>, database: string) {
  const fields = readOptionalStringArray(input.fields);
  return compactObject({
    optionView: fields ? "FS" : input.recordDetail === "full" ? "FR" : "SR",
    viewField: fields ? `${database}+${fields.join("+")}` : undefined,
    optionOther: input.highlight === true ? "HL+On" : undefined,
    links: typeof input.includeLinks === "boolean" ? String(input.includeLinks) : undefined,
  });
}

interface WebOfScienceExpandedRequest {
  path: string;
  query: Record<string, string | undefined>;
  phase: WebOfScienceExpandedPhase;
}

async function requestWebOfScienceExpandedJson(
  input: WebOfScienceExpandedRequest,
  context: WebOfScienceExpandedContext,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, webOfScienceExpandedRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildWebOfScienceExpandedUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-ApiKey": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Web of Science Expanded returned invalid JSON",
    });

    if (!response.ok) {
      throw createWebOfScienceExpandedError(response.status, payload, input.phase);
    }

    if (payload === null || typeof payload !== "object") {
      throw new ProviderRequestError(502, "Web of Science Expanded returned an invalid payload");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Web of Science Expanded request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Web of Science Expanded request failed: ${error.message}`
        : "Web of Science Expanded request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWebOfScienceExpandedUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${webOfScienceExpandedApiBaseUrl}/`);
  setSearchParams(url, query);
  return url;
}

function createWebOfScienceExpandedError(
  status: number,
  payload: unknown,
  phase: WebOfScienceExpandedPhase,
): ProviderRequestError {
  const message =
    extractWebOfScienceExpandedErrorMessage(payload) ?? `Web of Science Expanded request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(502, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractWebOfScienceExpandedErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.details) ??
    optionalString(error?.message) ??
    optionalString(error?.title) ??
    optionalString(record?.error_description) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function normalizeDocumentSearch(payload: unknown, firstRecord: number, limit: number) {
  const response = requireRecord(payload, "Web of Science Expanded returned an invalid document response");
  const data = optionalRecord(response.Data);
  const recordsContainer = optionalRecord(data?.Records);
  const records = optionalRecord(recordsContainer?.records);
  const documents = readRecordArray(records?.REC).map(normalizeExpandedDocument);

  return {
    metadata: normalizeQueryMetadata(response.QueryResult, firstRecord, limit, documents.length),
    documents,
    raw: response,
  };
}

function normalizeReferenceSearch(payload: unknown, firstRecord: number, limit: number) {
  const response = requireRecord(payload, "Web of Science Expanded returned an invalid cited-references response");
  const references = readRecordArray(response.Data).map(normalizeReference);

  return {
    metadata: normalizeQueryMetadata(response.QueryResult, firstRecord, limit, references.length),
    references,
    raw: response,
  };
}

function normalizeQueryMetadata(value: unknown, firstRecord: number, limit: number, returnedCount: number) {
  const queryResult = optionalRecord(value);
  const recordsFound = optionalInteger(queryResult?.RecordsFound) ?? null;
  const nextFirstRecord =
    returnedCount > 0 && (recordsFound === null || firstRecord + returnedCount <= recordsFound)
      ? firstRecord + returnedCount
      : null;

  return {
    queryId: optionalStringOrNull(queryResult?.QueryID),
    recordsSearched: optionalInteger(queryResult?.RecordsSearched) ?? null,
    recordsFound,
    firstRecord,
    limit,
    nextFirstRecord,
  };
}

function normalizeExpandedDocument(value: unknown) {
  const document = requireRecord(value, "Web of Science Expanded returned an invalid document record");
  const uid = readRequiredResponseString(document.UID, "Web of Science Expanded document response is missing UID");
  const staticData = optionalRecord(document.static_data);
  const summary = optionalRecord(staticData?.summary);
  const titles = readRecordArray(optionalRecord(summary?.titles)?.title);
  const authors = readRecordArray(optionalRecord(summary?.names)?.name)
    .filter((contributor) => {
      const role = optionalString(contributor.role)?.toLowerCase();
      return role === undefined || role.includes("author");
    })
    .map((author) => ({
      displayName: optionalStringOrNull(author.display_name ?? author.full_name),
      firstName: optionalStringOrNull(author.first_name),
      lastName: optionalStringOrNull(author.last_name),
      researcherId: optionalStringOrNull(author.r_id),
      orcidId: optionalStringOrNull(author.orcid_id),
    }));
  const dynamicData = optionalRecord(document.dynamic_data);
  const clusterRelated = optionalRecord(dynamicData?.cluster_related);
  const identifiersContainer = optionalRecord(clusterRelated?.identifiers);
  const identifiers = readRecordArray(identifiersContainer?.identifier).map((identifier) => ({
    type: optionalStringOrNull(identifier.type),
    value: optionalStringOrNull(identifier.value),
  }));
  const citationRelated = optionalRecord(dynamicData?.citation_related);
  const timesCitedList = optionalRecord(citationRelated?.tc_list);
  const timesCited = readRecordArray(timesCitedList?.silo_tc).find(
    (entry) => optionalString(entry.coll_id)?.toUpperCase() === "WOS",
  );

  return {
    uid,
    title: readTitle(titles, "item"),
    sourceTitle: readTitle(titles, "source"),
    publicationYear: optionalInteger(optionalRecord(summary?.pub_info)?.pubyear) ?? null,
    documentTypes: readStringOrArray(optionalRecord(summary?.doctypes)?.doctype),
    authors,
    identifiers,
    timesCited: optionalInteger(timesCited?.local_count) ?? null,
    raw: document,
  };
}

function normalizeReference(value: unknown) {
  const reference = requireRecord(value, "Web of Science Expanded returned an invalid cited reference");
  return {
    uid: optionalStringOrNull(reference.UID),
    citedAuthor: optionalStringOrNull(reference.citedAuthor),
    citedTitle: optionalStringOrNull(reference.citedTitle),
    citedWork: optionalStringOrNull(reference.citedWork),
    year: optionalInteger(reference.year) ?? null,
    page: optionalInteger(reference.page) ?? null,
    doi: optionalStringOrNull(reference.doi),
    timesCited: optionalInteger(reference.timesCited) ?? null,
    raw: reference,
  };
}

function normalizeCitationReport(value: unknown) {
  const report = requireRecord(value, "Web of Science Expanded returned an invalid citation report entry");
  return {
    reportLevel: optionalStringOrNull(report.ReportLevel),
    timesCited: readNullableNumber(report.TimesCited),
    timesCitedSansSelf: readNullableNumber(report.TimesCitedSansSelf),
    citingItemsSansSelf: readNullableNumber(report.CitingItemsSansSelf),
    dedupedTimesCited: readNullableNumber(report.DedupedTimesCited),
    averagePerItem: readNullableNumber(report.AveragePerItem),
    averagePerYear: readNullableNumber(report.AveragePerYear),
    hIndex: readNullableNumber(report.HValue),
    citingYears: optionalRecord(report.CitingYears) ?? null,
    raw: report,
  };
}

function requireQueryResult(payload: unknown) {
  const response = requireRecord(payload, "Web of Science Expanded returned an invalid query response");
  return requireRecord(response.QueryResult, "Web of Science Expanded response is missing QueryResult");
}

function readTitle(titles: Record<string, unknown>[], type: string) {
  const title = titles.find((entry) => optionalString(entry.type)?.toLowerCase() === type);
  return optionalStringOrNull(title?.content);
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function requireRecordArray(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => requireRecord(item, message));
}

function readStringOrArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  const values = readOptionalStringArray(value);
  if (!values || values.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return values;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.flatMap((item) => {
    const normalized = optionalString(item);
    return normalized ? [normalized] : [];
  });
  return values.length > 0 ? values : undefined;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRequiredResponseString(value: unknown, message: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, message);
  }
  return normalized;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLanguage(value: unknown): string | undefined {
  return optionalString(value)?.toLowerCase();
}

function validateSearchOptions(input: Record<string, unknown>): void {
  const timeFields = [
    "publishTimeSpan",
    "loadTimeSpan",
    "createdTimeSpan",
    "modifiedTimeSpan",
    "timesCitedModifiedTimeSpan",
  ];
  const selectedTimeFields = timeFields.filter((field) => optionalString(input[field]) !== undefined);
  if (selectedTimeFields.length > 1) {
    throw new ProviderRequestError(
      400,
      "Only one publication, load, creation, modification, or times-cited time span may be used",
    );
  }

  const database = optionalString(input.database) ?? "WOS";
  if (
    database === "WOK" &&
    (optionalString(input.modifiedTimeSpan) !== undefined ||
      optionalString(input.timesCitedModifiedTimeSpan) !== undefined)
  ) {
    throw new ProviderRequestError(400, "database WOK cannot be combined with modification time spans");
  }

  const language = normalizeLanguage(input.language);
  if (language !== undefined && database === "WOS" && language !== "en") {
    throw new ProviderRequestError(400, "database WOS only supports language en");
  }

  if (readOptionalStringArray(input.fields) !== undefined && optionalString(input.recordDetail) !== undefined) {
    throw new ProviderRequestError(
      400,
      "recordDetail cannot be combined with fields because fields enable custom selection",
    );
  }
}

function validateCitationYears(input: Record<string, unknown>): void {
  const startYear = optionalInteger(input.startYear);
  const endYear = optionalInteger(input.endYear);
  if (startYear !== undefined && endYear !== undefined && startYear > endYear) {
    throw new ProviderRequestError(400, "endYear must be greater than or equal to startYear");
  }
}
