import type { ProviderActionHandlers } from "../provider-runtime.ts";
const crossrefApiBaseUrl = "https://api.crossref.org/v1";
const crossrefMaxResponseBytes = 4 * 1024 * 1024;
const crossrefCursorPrefix = "crossref_cursor_v1.";

const resourcePathByType = {
  journal: "journals",
  member: "members",
  funder: "funders",
  prefix: "prefixes",
  type: "types",
} as const;

const changeFilterBySource = {
  created: { from: "from-created-date", until: "until-created-date" },
  updated: { from: "from-update-date", until: "until-update-date" },
  indexed: { from: "from-index-date", until: "until-index-date" },
} as const;

const citationMediaTypeByFormat = {
  bibtex: "application/x-bibtex",
  ris: "application/x-research-info-systems",
  csl_json: "application/vnd.citationstyles.csl+json",
  formatted: "text/x-bibliography",
  rdf_xml: "application/rdf+xml",
  turtle: "text/turtle",
  unixref_xml: "application/vnd.crossref.unixref+xml",
  unixsd_xml: "application/vnd.crossref.unixsd+xml",
} as const;

type CrossrefResourceType = keyof typeof resourcePathByType;
type CrossrefActionHandler = (
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey?: string,
) => Promise<unknown>;

export const crossrefActionHandlers: ProviderActionHandlers<"crossref", CrossrefActionHandler> = {
  async get_work(input, fetcher, apiKey) {
    const doi = normalizeDoi(readRequiredString(input.doi, "doi"));
    const { payload } = await requestCrossrefJson({
      path: `/works/${encodeURIComponent(doi)}`,
      params: buildIdentityParams(input),
      fetcher,
      apiKey,
    });
    const raw = readMessageObject(payload, "Crossref returned an invalid work payload");
    return { work: normalizeWork(raw) };
  },
  async get_work_agency(input, fetcher, apiKey) {
    const doi = normalizeDoi(readRequiredString(input.doi, "doi"));
    const { payload } = await requestCrossrefJson({
      path: `/works/${encodeURIComponent(doi)}/agency`,
      params: buildIdentityParams(input),
      fetcher,
      apiKey,
    });
    const message = readMessageObject(payload, "Crossref returned an invalid agency payload");
    const raw = optionalRecord(message.agency);
    if (!raw) {
      throw new ProviderRequestError(502, "Crossref returned an invalid agency payload");
    }
    return {
      doi,
      agency: {
        id: optionalString(raw.id) ?? null,
        label: optionalString(raw.label) ?? null,
        raw,
      },
    };
  },
  async list_works(input, fetcher, apiKey) {
    const request = prepareCursorRequest("/works", buildWorksParams(input));
    const { payload } = await requestCrossrefJson({
      path: request.path,
      params: request.params,
      fetcher,
      apiKey,
    });
    return normalizeWorksList(payload, request.context);
  },
  async match_reference(input, fetcher, apiKey) {
    const { payload } = await requestCrossrefJson({
      path: "/works",
      params: compactObject({
        "query.bibliographic": readRequiredString(input.reference, "reference"),
        sort: "score",
        order: "desc",
        rows: readOptionalIntegerParam(input.rows),
        mailto: readOptionalString(input.mailto),
      }),
      fetcher,
      apiKey,
    });
    return normalizeWorksList(payload);
  },
  async list_changed_works(input, fetcher, apiKey) {
    const changeSource = readChangeSource(input.changeSource);
    const changeFilter = changeFilterBySource[changeSource];
    const fromDate = readCrossrefTimestamp(input.fromDate, "fromDate");
    const untilDate = readCrossrefTimestamp(input.untilDate, "untilDate");
    if (compareTimestampParts(untilDate.upper, fromDate.lower) < 0) {
      throw new ProviderRequestError(400, "untilDate must not be earlier than fromDate");
    }
    const filters = [`${changeFilter.from}:${fromDate.value}`, `${changeFilter.until}:${untilDate.value}`];
    const workType = readOptionalFilterValue(input.workType, "workType");
    if (workType) {
      filters.push(`type:${workType}`);
    }

    const request = prepareCursorRequest(
      "/works",
      compactObject({
        filter: filters.join(","),
        rows: readOptionalIntegerParam(input.rows),
        cursor: readOptionalString(input.cursor),
        mailto: readOptionalString(input.mailto),
      }),
    );
    const { payload } = await requestCrossrefJson({
      path: request.path,
      params: request.params,
      fetcher,
      apiKey,
    });
    return normalizeWorksList(payload, request.context);
  },
  async list_scoped_works(input, fetcher, apiKey) {
    const scope = readResourceType(input.scope, "scope");
    const id = readRequiredString(input.id, "id");
    const request = prepareCursorRequest(
      `/${resourcePathByType[scope]}/${encodeURIComponent(id)}/works`,
      buildWorksParams(input),
    );
    const { payload } = await requestCrossrefJson({
      path: request.path,
      params: request.params,
      fetcher,
      apiKey,
    });
    return normalizeWorksList(payload, request.context);
  },
  async get_resource(input, fetcher, apiKey) {
    const resourceType = readResourceType(input.resourceType, "resourceType");
    const id = readRequiredString(input.id, "id");
    const { payload } = await requestCrossrefJson({
      path: `/${resourcePathByType[resourceType]}/${encodeURIComponent(id)}`,
      params: buildIdentityParams(input),
      fetcher,
      apiKey,
    });
    const raw = readMessageObject(payload, "Crossref returned an invalid resource payload");
    return { resource: normalizeResource(raw, resourceType) };
  },
  async list_resources(input, fetcher, apiKey) {
    const collection = readResourceCollection(input.collection);
    const request = prepareCursorRequest(
      `/${collection}`,
      compactObject({
        query: readOptionalString(input.query),
        filter: readOptionalString(input.filter),
        rows: readOptionalIntegerParam(input.rows),
        offset: readOptionalIntegerParam(input.offset),
        cursor: readOptionalString(input.cursor),
        mailto: readOptionalString(input.mailto),
      }),
    );
    const { payload } = await requestCrossrefJson({
      path: request.path,
      params: request.params,
      fetcher,
      apiKey,
    });
    return normalizeResourceList(payload, collection, request.context);
  },
  async export_work_citation(input, fetcher, apiKey) {
    const doi = normalizeDoi(readRequiredString(input.doi, "doi"));
    const format = readCitationFormat(input.format);
    if (format !== "formatted" && (input.style !== undefined || input.locale !== undefined)) {
      throw new ProviderRequestError(400, "style and locale are only supported when format is formatted");
    }
    let accept = citationMediaTypeByFormat[format];
    if (format === "formatted") {
      const style = readOptionalHeaderParameter(input.style, "style");
      const locale = readOptionalHeaderParameter(input.locale, "locale");
      if (style) {
        accept += `; style=${style}`;
      }
      if (locale) {
        accept += `; locale=${locale}`;
      }
    }

    const { body, response } = await requestCrossref({
      path: `/works/${encodeURIComponent(doi)}/transform`,
      params: buildIdentityParams(input),
      accept,
      fetcher,
      apiKey,
    });
    return {
      doi,
      format,
      contentType: response.headers.get("content-type") ?? citationMediaTypeByFormat[format],
      content: body,
    };
  },
  async list_citation_styles(input, fetcher, apiKey) {
    const { payload } = await requestCrossrefJson({
      path: "/styles",
      params: buildIdentityParams(input),
      fetcher,
      apiKey,
    });
    return normalizeCitationOptionList(payload);
  },
  async list_citation_locales(input, fetcher, apiKey) {
    const { payload } = await requestCrossrefJson({
      path: "/locales",
      params: buildIdentityParams(input),
      fetcher,
      apiKey,
    });
    return normalizeCitationOptionList(payload);
  },
};

export async function validateCrossrefCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  const apiKey = requiredString(input.apiKey, "apiKey", providerInputError);
  const { response } = await requestCrossrefJson({
    path: "/works",
    params: { rows: "0" },
    fetcher,
    apiKey,
    phase: "validate",
  });
  const apiPool = response.headers.get("x-api-pool");
  if (apiPool !== "plus" && !apiPool?.startsWith("plus-")) {
    throw new ProviderRequestError(400, "Crossref did not accept the Metadata Plus API key");
  }

  return {
    profile: { displayName: "Crossref Metadata Plus" },
    grantedScopes: [],
    metadata: compactObject({
      apiPool: apiPool ?? undefined,
      rateLimit: response.headers.get("x-rate-limit-limit") ?? undefined,
      rateLimitInterval: response.headers.get("x-rate-limit-interval") ?? undefined,
    }),
  };
}

async function requestCrossrefJson(input: {
  path: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  apiKey?: string;
  phase?: "execute" | "validate";
}) {
  const { body, response } = await requestCrossref({
    ...input,
    accept: "application/vnd.crossref-api-message+json, application/json",
  });
  const payload = parseCrossrefPayload(body);
  const envelope = optionalRecord(payload);
  if (!envelope || envelope.status !== "ok") {
    throw new ProviderRequestError(502, "Crossref returned an invalid response envelope");
  }
  return { payload: envelope, response };
}

async function requestCrossref(input: {
  path: string;
  params: Record<string, string | undefined>;
  accept: string;
  fetcher: typeof fetch;
  apiKey?: string;
  phase?: "execute" | "validate";
}) {
  return runProviderRequest({ label: "Crossref" }, async (signal) => {
    const headers = new Headers({
      accept: input.accept,
      "user-agent": providerUserAgent,
    });
    if (input.apiKey) {
      headers.set("Crossref-Plus-API-Token", `Bearer ${input.apiKey}`);
    }

    const response = await input.fetcher(buildCrossrefUrl(input.path, input.params), {
      method: "GET",
      headers,
      signal,
    });
    const body = await readCrossrefResponseText(response);

    if (!response.ok) {
      throw createCrossrefError(response.status, parseCrossrefPayload(body), input.phase ?? "execute", !!input.apiKey);
    }
    return { body, response };
  });
}

function buildCrossrefUrl(path: string, params: Record<string, string | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${crossrefApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function prepareCursorRequest(path: string, params: Record<string, string | undefined>) {
  const cursor = params.cursor;
  if (!cursor) {
    return { path, params, context: undefined };
  }
  const context = createCursorContext(path, params);
  if (cursor === "*") {
    return { path, params, context };
  }
  return {
    path,
    params: { ...params, cursor: decodeCursor(cursor, context) },
    context,
  };
}

function createCursorContext(path: string, params: Record<string, string | undefined>) {
  const query = Object.entries(params)
    .filter(([key, value]) => value !== undefined && key !== "cursor" && key !== "mailto")
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify({ path, query })).digest("base64url");
}

function encodeCursor(cursor: string, context: string) {
  const payload = Buffer.from(JSON.stringify({ cursor, context }), "utf8").toString("base64url");
  return `${crossrefCursorPrefix}${payload}.${signCursorPayload(payload)}`;
}

function decodeCursor(value: string, expectedContext: string) {
  if (!value.startsWith(crossrefCursorPrefix)) {
    throw new ProviderRequestError(400, "cursor must be * or a nextCursor returned by the same Crossref action");
  }
  try {
    const token = value.slice(crossrefCursorPrefix.length);
    const separatorIndex = token.indexOf(".");
    if (separatorIndex <= 0 || separatorIndex !== token.lastIndexOf(".")) {
      throw new Error("invalid cursor envelope");
    }
    const payload = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    if (!isValidCursorSignature(signature, signCursorPayload(payload))) {
      throw new Error("invalid cursor signature");
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    const record = optionalRecord(decoded);
    if (typeof record?.cursor !== "string" || record.cursor.length === 0 || record.context !== expectedContext) {
      throw new Error("cursor context mismatch");
    }
    return record.cursor;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "cursor does not belong to this Crossref action and exact query");
  }
}

function signCursorPayload(payload: string) {
  const secret = process.env.OOMOL_CONNECT_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new ProviderRequestError(500, "Crossref cursor signing is not configured");
  }
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function isValidCursorSignature(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function buildIdentityParams(input: Record<string, unknown>) {
  return compactObject({ mailto: readOptionalString(input.mailto) });
}

function buildWorksParams(input: Record<string, unknown>) {
  return compactObject({
    query: readOptionalString(input.query),
    "query.bibliographic": readOptionalString(input.queryBibliographic),
    "query.title": readOptionalString(input.queryTitle),
    "query.author": readOptionalString(input.queryAuthor),
    "query.container-title": readOptionalString(input.queryContainerTitle),
    filter: readOptionalString(input.filter),
    sort: readOptionalString(input.sort),
    order: readOptionalString(input.order),
    facet: readOptionalString(input.facet),
    rows: readOptionalIntegerParam(input.rows),
    offset: readOptionalIntegerParam(input.offset),
    cursor: readOptionalString(input.cursor),
    sample: readOptionalIntegerParam(input.sample),
    mailto: readOptionalString(input.mailto),
  });
}

function parseCrossrefPayload(text: string) {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function readCrossrefResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > crossrefMaxResponseBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderRequestError(502, `Crossref response exceeds ${crossrefMaxResponseBytes} bytes`);
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > crossrefMaxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderRequestError(502, `Crossref response exceeds ${crossrefMaxResponseBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function createCrossrefError(status: number, payload: unknown, phase: "execute" | "validate", hasApiKey: boolean) {
  const message = extractCrossrefErrorMessage(payload) ?? `Crossref request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(403, message, status);
  }
  if (status === 403) {
    return new ProviderRequestError(
      403,
      `${message}. Crossref has blocked this request pool; contact Crossref support if the block persists.`,
    );
  }
  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 && hasApiKey) {
    return new ProviderRequestError(401, message);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractCrossrefErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (Array.isArray(record.message)) {
    for (const issue of record.message) {
      const issueRecord = optionalRecord(issue);
      if (typeof issueRecord?.message === "string") {
        return issueRecord.message;
      }
    }
  }
  return undefined;
}

function normalizeWorksList(payload: Record<string, unknown>, cursorContext?: string) {
  const message = readMessageObject(payload, "Crossref returned an invalid works list payload");
  const rawItems = readObjectArray(message.items);
  return {
    meta: normalizeListMeta(message, rawItems.length, cursorContext),
    works: rawItems.map(normalizeWork),
    facets: optionalRecord(message.facets) ?? {},
  };
}

function normalizeResourceList(payload: Record<string, unknown>, collection: string, cursorContext?: string) {
  const message = readMessageObject(payload, "Crossref returned an invalid resource list payload");
  const rawItems = readObjectArray(message.items);
  const resourceType = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return {
    meta: normalizeListMeta(message, rawItems.length, cursorContext),
    resources: rawItems.map((item) => normalizeResource(item, resourceType)),
  };
}

function normalizeCitationOptionList(payload: Record<string, unknown>) {
  const message = readMessageObject(payload, "Crossref returned an invalid citation option list payload");
  const items = Array.isArray(message.items)
    ? message.items.filter((item): item is string => typeof item === "string")
    : [];
  return {
    totalResults: optionalInteger(message["total-results"]) ?? items.length,
    items,
  };
}

function normalizeListMeta(message: Record<string, unknown>, itemCount: number, cursorContext?: string) {
  const upstreamCursor = optionalString(message["next-cursor"]);
  return {
    totalResults: optionalInteger(message["total-results"]) ?? null,
    returnedCount: itemCount,
    nextCursor: upstreamCursor && cursorContext ? encodeCursor(upstreamCursor, cursorContext) : null,
  };
}

function normalizeWork(raw: Record<string, unknown>) {
  return {
    doi: optionalString(raw.DOI) ?? null,
    title: readFirstString(raw.title),
    subtitle: readFirstString(raw.subtitle),
    type: optionalString(raw.type) ?? null,
    publisher: optionalString(raw.publisher) ?? null,
    containerTitle: readFirstString(raw["container-title"]),
    publishedAt: normalizeDate(raw.published) ?? normalizeDate(raw.issued),
    url: optionalString(raw.URL) ?? null,
    abstract: optionalString(raw.abstract) ?? null,
    authors: readObjectArray(raw.author).map(normalizeAuthor),
    referenceCount: optionalInteger(raw["references-count"]) ?? optionalInteger(raw["reference-count"]) ?? null,
    citedByCount: optionalInteger(raw["is-referenced-by-count"]) ?? null,
    score: optionalNumber(raw.score) ?? null,
    raw,
  };
}

function normalizeAuthor(raw: Record<string, unknown>) {
  return {
    given: optionalString(raw.given) ?? null,
    family: optionalString(raw.family) ?? null,
    name: optionalString(raw.name) ?? null,
    orcid: optionalString(raw.ORCID) ?? null,
    sequence: optionalString(raw.sequence) ?? null,
  };
}

function normalizeResource(raw: Record<string, unknown>, resourceType: string) {
  const counts = optionalRecord(raw.counts);
  const resourceId =
    optionalString(raw.id) ??
    numberToString(raw.id) ??
    normalizePrefixId(raw.prefix) ??
    readFirstString(raw.ISSN) ??
    optionalString(raw.URL);
  const displayName =
    optionalString(raw.title) ??
    optionalString(raw.name) ??
    optionalString(raw["primary-name"]) ??
    optionalString(raw.label) ??
    (resourceType === "license" ? optionalString(raw.URL) : undefined);

  return {
    id: resourceId ?? null,
    displayName: displayName ?? null,
    location: optionalString(raw.location) ?? null,
    uri:
      optionalString(raw.uri) ??
      (resourceType === "prefix" ? optionalString(raw.prefix) : undefined) ??
      optionalString(raw.URL) ??
      null,
    workCount:
      optionalInteger(raw["work-count"]) ??
      optionalInteger(raw["descendant-work-count"]) ??
      optionalInteger(counts?.["total-dois"]) ??
      null,
    raw,
  };
}

function normalizeDate(value: unknown) {
  const date = optionalRecord(value);
  if (!Array.isArray(date?.["date-parts"])) {
    return null;
  }
  const firstPart = date["date-parts"][0];
  if (!Array.isArray(firstPart) || typeof firstPart[0] !== "number") {
    return null;
  }
  const normalizedParts: string[] = [];
  for (const [index, part] of firstPart.slice(0).entries()) {
    if (typeof part !== "number" || !Number.isInteger(part)) {
      break;
    }
    normalizedParts.push(index === 0 ? String(part) : String(part).padStart(2, "0"));
  }
  return normalizedParts.length > 0 ? normalizedParts.join("-") : null;
}

function normalizePrefixId(value: unknown) {
  const prefix = optionalString(value);
  if (!prefix) {
    return undefined;
  }
  const marker = "/prefix/";
  const markerIndex = prefix.lastIndexOf(marker);
  return markerIndex === -1 ? prefix : prefix.slice(markerIndex + marker.length);
}

function normalizeDoi(value: string) {
  let doi = value.trim();
  let isDoiUrl = false;
  for (const prefix of ["https://doi.org/", "http://doi.org/"]) {
    if (doi.toLowerCase().startsWith(prefix)) {
      doi = doi.slice(prefix.length);
      isDoiUrl = true;
      break;
    }
  }
  if (!isDoiUrl && doi.toLowerCase().startsWith("doi:")) {
    doi = doi.slice("doi:".length);
  }
  if (isDoiUrl) {
    try {
      doi = decodeURIComponent(doi);
    } catch {
      throw new ProviderRequestError(400, "doi URL contains invalid percent encoding");
    }
  }
  doi = doi.trim();
  if (doi.length === 0) {
    throw new ProviderRequestError(400, "doi is required");
  }
  return doi;
}

function readMessageObject(payload: Record<string, unknown>, message: string) {
  const record = optionalRecord(payload.message);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readFirstString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  return value.find((item): item is string => typeof item === "string") ?? null;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  const string = optionalString(value)?.trim();
  return string ? string : undefined;
}

function readOptionalIntegerParam(value: unknown) {
  const number = optionalInteger(value);
  return number === undefined ? undefined : String(number);
}

type TimestampParts = [number, number, number, number, number, number];

function readCrossrefTimestamp(value: unknown, fieldName: string) {
  const timestamp = readRequiredString(value, fieldName);
  const normalized = timestamp.endsWith("Z") ? timestamp.slice(0, -1) : timestamp;
  const timeSeparatorIndex = normalized.indexOf("T");
  const datePart = timeSeparatorIndex === -1 ? normalized : normalized.slice(0, timeSeparatorIndex);
  const timePart = timeSeparatorIndex === -1 ? undefined : normalized.slice(timeSeparatorIndex + 1);
  const dateSegments = datePart.split("-");
  const timeSegments = timePart?.split(":") ?? [];
  if (
    dateSegments.length < 1 ||
    dateSegments.length > 3 ||
    timeSegments.length > 3 ||
    (timePart !== undefined && (dateSegments.length !== 3 || timeSegments.length === 0))
  ) {
    throw invalidTimestampError(fieldName);
  }

  const year = readTimestampPart(dateSegments[0], 4, fieldName);
  const month = readTimestampPart(dateSegments[1], 2, fieldName);
  const day = readTimestampPart(dateSegments[2], 2, fieldName);
  const hour = readTimestampPart(timeSegments[0], 2, fieldName);
  const minute = readTimestampPart(timeSegments[1], 2, fieldName);
  const second = readTimestampPart(timeSegments[2], 2, fieldName);
  if (
    year === undefined ||
    (month !== undefined && (month < 1 || month > 12)) ||
    (day !== undefined && (day < 1 || day > daysInMonth(year, month ?? 1))) ||
    (hour !== undefined && (hour < 0 || hour > 23)) ||
    (minute !== undefined && (minute < 0 || minute > 59)) ||
    (second !== undefined && (second < 0 || second > 59))
  ) {
    throw invalidTimestampError(fieldName);
  }

  const lowerMonth = month ?? 1;
  const upperMonth = month ?? 12;
  const lower: TimestampParts = [year, lowerMonth, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0];
  const upper: TimestampParts = [
    year,
    upperMonth,
    day ?? daysInMonth(year, upperMonth),
    hour ?? 23,
    minute ?? 59,
    second ?? 59,
  ];
  return { value: timestamp, lower, upper };
}

function readTimestampPart(value: string | undefined, length: number, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (value.length !== length) {
    throw invalidTimestampError(fieldName);
  }
  for (const character of value) {
    if (character < "0" || character > "9") {
      throw invalidTimestampError(fieldName);
    }
  }
  return Number(value);
}

function invalidTimestampError(fieldName: string) {
  return new ProviderRequestError(400, `${fieldName} must use a valid Crossref ISO timestamp`);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function compareTimestampParts(left: TimestampParts, right: TimestampParts) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function readOptionalFilterValue(value: unknown, fieldName: string) {
  const filterValue = readOptionalString(value);
  if (!filterValue) {
    return undefined;
  }
  for (const character of filterValue) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127 || character === "," || character === ":") {
      throw new ProviderRequestError(400, `${fieldName} contains unsupported filter characters`);
    }
  }
  return filterValue;
}

function readResourceType(value: unknown, fieldName: string): CrossrefResourceType {
  const type = readRequiredString(value, fieldName);
  if (type in resourcePathByType) {
    return type as CrossrefResourceType;
  }
  throw new ProviderRequestError(400, `unsupported Crossref resource type: ${type}`);
}

function readResourceCollection(value: unknown) {
  const collection = readRequiredString(value, "collection");
  if (["journals", "members", "funders", "types", "licenses"].includes(collection)) {
    return collection;
  }
  throw new ProviderRequestError(400, `unsupported Crossref collection: ${collection}`);
}

function readChangeSource(value: unknown): keyof typeof changeFilterBySource {
  const source = readRequiredString(value, "changeSource");
  if (source in changeFilterBySource) {
    return source as keyof typeof changeFilterBySource;
  }
  throw new ProviderRequestError(400, `unsupported Crossref change source: ${source}`);
}

function readCitationFormat(value: unknown): keyof typeof citationMediaTypeByFormat {
  const format = readRequiredString(value, "format");
  if (format in citationMediaTypeByFormat) {
    return format as keyof typeof citationMediaTypeByFormat;
  }
  throw new ProviderRequestError(400, `unsupported Crossref citation format: ${format}`);
}

function readOptionalHeaderParameter(value: unknown, fieldName: string) {
  const parameter = readOptionalString(value);
  if (!parameter) {
    return undefined;
  }
  for (const character of parameter) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127 || character === ";" || character === ",") {
      throw new ProviderRequestError(400, `${fieldName} contains unsupported header characters`);
    }
  }
  return parameter;
}

function numberToString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";
