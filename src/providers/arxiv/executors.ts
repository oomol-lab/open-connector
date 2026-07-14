import type { ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, providerFetch, ProviderRequestError } from "../provider-runtime.ts";

const service = "arxiv";
const arxivApiBaseUrl = "https://export.arxiv.org/api";
const arxivApiUrl = `${arxivApiBaseUrl}/query`;
const defaultMaxResults = 10;
const minimumRequestIntervalMs = 3000;

let nextDefaultFetchAt = 0;
let defaultFetchQueue: Promise<void> = Promise.resolve();

type ArxivSortBy = "lastUpdatedDate" | "relevance" | "submittedDate";
type ArxivSortOrder = "ascending" | "descending";

interface QueryOptions {
  searchQuery?: string;
  idList?: string[];
  start?: number;
  maxResults?: number;
  sortBy?: ArxivSortBy;
  sortOrder?: ArxivSortOrder;
}

interface ArxivPaper {
  id: string;
  baseId: string;
  version: number | null;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt: string;
  authors: string[];
  categories: string[];
  primaryCategory: string | null;
  abstractUrl: string;
  pdfUrl: string | null;
  doi: string | null;
  journalRef: string | null;
  comment: string | null;
}

interface ArxivQueryResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  papers: ArxivPaper[];
}

interface ArxivActionContext {
  fetcher: typeof fetch;
}

type ArxivActionHandler = (input: Record<string, unknown>, context: ArxivActionContext) => Promise<unknown>;

export const arxivActionHandlers: Record<string, ArxivActionHandler> = {
  search_papers(input, context) {
    return searchPapers(input, context);
  },
  search_by_author(input, context) {
    return searchByAuthor(input, context);
  },
  search_by_title(input, context) {
    return searchByTitle(input, context);
  },
  search_by_abstract(input, context) {
    return searchByAbstract(input, context);
  },
  search_by_all_fields(input, context) {
    return searchByAllFields(input, context);
  },
  get_paper(input, context) {
    return getPaper(input, context);
  },
  get_papers(input, context) {
    return getPapers(input, context);
  },
  list_recent_papers(input, context) {
    return listRecentPapers(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ArxivActionContext>({
  service,
  handlers: arxivActionHandlers,
  createContext(_context: ExecutionContext, fetcher: typeof fetch): ArxivActionContext {
    return { fetcher };
  },
});

function searchPapers(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  return requestArxiv(
    {
      searchQuery: readString(input.query, "query"),
      start: readOptionalNumber(input.start) ?? 0,
      maxResults: readOptionalNumber(input.maxResults) ?? defaultMaxResults,
      sortBy: readOptionalSortBy(input.sortBy),
      sortOrder: readOptionalSortOrder(input.sortOrder),
    },
    context.fetcher,
  );
}

function searchByAuthor(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  return searchByField("au", readString(input.author, "author"), input, context.fetcher);
}

function searchByTitle(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  return searchByField("ti", readString(input.title, "title"), input, context.fetcher);
}

function searchByAbstract(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  return searchByField("abs", readString(input.abstractQuery, "abstractQuery"), input, context.fetcher);
}

function searchByAllFields(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  const parts = [
    buildQueryPart("all", readOptionalString(input.query)),
    buildQueryPart("au", readOptionalString(input.author)),
    buildQueryPart("ti", readOptionalString(input.title)),
    buildQueryPart("abs", readOptionalString(input.abstractQuery)),
    buildQueryPart("cat", readOptionalString(input.category)),
  ].filter((part): part is string => typeof part === "string");

  if (parts.length === 0) {
    throw new ProviderRequestError(400, "At least one search field is required.");
  }

  return requestArxiv(
    {
      searchQuery: parts.join(" AND "),
      start: readOptionalNumber(input.start) ?? 0,
      maxResults: readOptionalNumber(input.maxResults) ?? defaultMaxResults,
      sortBy: readOptionalSortBy(input.sortBy),
      sortOrder: readOptionalSortOrder(input.sortOrder),
    },
    context.fetcher,
  );
}

async function getPaper(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  const result = await requestArxiv(
    {
      idList: [readString(input.id, "id")],
      maxResults: 1,
    },
    context.fetcher,
  );

  return {
    found: result.papers.length > 0,
    paper: result.papers[0] ?? null,
  };
}

function getPapers(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  const ids = readStringArray(input.ids, "ids");
  return requestArxiv(
    {
      idList: ids,
      maxResults: readOptionalNumber(input.maxResults) ?? ids.length,
    },
    context.fetcher,
  );
}

function listRecentPapers(input: Record<string, unknown>, context: ArxivActionContext): Promise<unknown> {
  return requestArxiv(
    {
      searchQuery: `cat:${readString(input.category, "category")}`,
      start: readOptionalNumber(input.start) ?? 0,
      maxResults: readOptionalNumber(input.maxResults) ?? defaultMaxResults,
      sortBy: "submittedDate",
      sortOrder: readOptionalSortOrder(input.sortOrder) ?? "descending",
    },
    context.fetcher,
  );
}

function searchByField(
  prefix: "abs" | "au" | "ti",
  value: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<ArxivQueryResult> {
  return requestArxiv(
    {
      searchQuery: `${prefix}:${formatStructuredFieldValue(value)}`,
      start: readOptionalNumber(input.start) ?? 0,
      maxResults: readOptionalNumber(input.maxResults) ?? defaultMaxResults,
      sortBy: readOptionalSortBy(input.sortBy),
      sortOrder: readOptionalSortOrder(input.sortOrder),
    },
    fetcher,
  );
}

function buildQueryPart(prefix: "abs" | "all" | "au" | "cat" | "ti", value: string | undefined): string | undefined {
  return value ? `${prefix}:${formatStructuredFieldValue(value)}` : undefined;
}

function formatStructuredFieldValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || !containsWhitespace(trimmed)) {
    return trimmed;
  }

  return `"${trimmed.replaceAll('"', '\\"')}"`;
}

function containsWhitespace(value: string): boolean {
  for (const character of value) {
    if (character.trim().length === 0) {
      return true;
    }
  }

  return false;
}

async function requestArxiv(options: QueryOptions, fetcher: typeof fetch): Promise<ArxivQueryResult> {
  const url = new URL(arxivApiUrl);
  url.searchParams.set("start", String(options.start ?? 0));
  url.searchParams.set("max_results", String(options.maxResults ?? defaultMaxResults));

  if (options.searchQuery) {
    url.searchParams.set("search_query", options.searchQuery);
  }
  if (options.idList && options.idList.length > 0) {
    url.searchParams.set("id_list", options.idList.join(","));
  }
  if (options.sortBy) {
    url.searchParams.set("sortBy", options.sortBy);
  }
  if (options.sortOrder) {
    url.searchParams.set("sortOrder", options.sortOrder);
  }

  let response: Response;
  try {
    await throttleDefaultFetch(fetcher);
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/atom+xml, application/xml, text/xml",
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `failed to reach arxiv: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `failed to read arxiv response: ${error instanceof Error ? error.message : "stream error"}`,
    );
  }

  if (!response.ok) {
    throw mapArxivError(response, body);
  }

  return parseArxivFeed(body);
}

function throttleDefaultFetch(fetcher: typeof fetch): Promise<void> {
  if (fetcher !== providerFetch) {
    return Promise.resolve();
  }

  const queued = defaultFetchQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextDefaultFetchAt - now);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextDefaultFetchAt = Date.now() + minimumRequestIntervalMs;
  });
  defaultFetchQueue = queued.catch(() => undefined);
  return queued;
}

function parseArxivFeed(xml: string): ArxivQueryResult {
  if (!xml.includes("<feed")) {
    throw new ProviderRequestError(502, "arxiv returned malformed atom feed");
  }

  const totalResults = readNumberTag(xml, "opensearch:totalResults");
  const startIndex = readNumberTag(xml, "opensearch:startIndex");
  const itemsPerPage = readNumberTag(xml, "opensearch:itemsPerPage");
  if (totalResults === undefined || startIndex === undefined || itemsPerPage === undefined) {
    throw new ProviderRequestError(502, "arxiv returned malformed atom feed");
  }

  const papers = collectElements(xml, "entry").map(parsePaperEntry);
  for (const paper of papers) {
    if (paper.id.length === 0 || paper.title.length === 0 || paper.abstractUrl.length === 0) {
      throw new ProviderRequestError(502, "arxiv returned malformed paper entry");
    }
  }

  return {
    totalResults,
    startIndex,
    itemsPerPage,
    papers,
  };
}

function parsePaperEntry(entryXml: string): ArxivPaper {
  const entryId = readTextTag(entryXml, "id");
  const alternateUrl = readLink(entryXml, "alternate");
  const abstractUrl = alternateUrl ?? (entryId.includes("/abs/") ? entryId : "");
  const paperId = extractArxivId(entryId || abstractUrl);
  const categories = collectSelfClosingAttribute(entryXml, "category", "term");
  const primaryCategory = readSelfClosingAttribute(entryXml, "arxiv:primary_category", "term");

  return {
    id: paperId.id,
    baseId: paperId.baseId,
    version: paperId.version,
    title: normalizeWhitespace(readTextTag(entryXml, "title")),
    summary: normalizeWhitespace(readTextTag(entryXml, "summary")),
    publishedAt: readTextTag(entryXml, "published"),
    updatedAt: readTextTag(entryXml, "updated"),
    authors: collectElements(entryXml, "author")
      .map((authorXml) => normalizeWhitespace(readTextTag(authorXml, "name")))
      .filter((author) => author.length > 0),
    categories,
    primaryCategory,
    abstractUrl,
    pdfUrl: readLink(entryXml, "related", "application/pdf"),
    doi: emptyToNull(readTextTag(entryXml, "arxiv:doi")),
    journalRef: emptyToNull(readTextTag(entryXml, "arxiv:journal_ref")),
    comment: emptyToNull(readTextTag(entryXml, "arxiv:comment")),
  };
}

function collectElements(xml: string, tagName: string): string[] {
  const elements: string[] = [];
  const openingTag = `<${tagName}`;
  const closingTag = `</${tagName}>`;
  let searchFrom = 0;

  while (searchFrom < xml.length) {
    const openingStart = xml.indexOf(openingTag, searchFrom);
    if (openingStart < 0) {
      break;
    }

    const openingEnd = xml.indexOf(">", openingStart);
    if (openingEnd < 0) {
      break;
    }

    const closingEnd = xml.indexOf(closingTag, openingEnd + 1);
    if (closingEnd < 0) {
      break;
    }

    elements.push(xml.slice(openingStart, closingEnd + closingTag.length));
    searchFrom = closingEnd + closingTag.length;
  }

  return elements;
}

function readTextTag(xml: string, tagName: string): string {
  const openingTag = `<${tagName}`;
  const closingTag = `</${tagName}>`;
  const openingStart = xml.indexOf(openingTag);
  if (openingStart < 0) {
    return "";
  }

  const openingEnd = xml.indexOf(">", openingStart);
  if (openingEnd < 0) {
    return "";
  }

  const closingStart = xml.indexOf(closingTag, openingEnd + 1);
  if (closingStart < 0) {
    return "";
  }

  return decodeXml(xml.slice(openingEnd + 1, closingStart).trim());
}

function readNumberTag(xml: string, tagName: string): number | undefined {
  const value = Number(readTextTag(xml, tagName));
  return Number.isFinite(value) ? value : undefined;
}

function readLink(xml: string, rel: string, type?: string): string | null {
  for (const attributes of collectSelfClosingAttributes(xml, "link")) {
    if (attributes.rel !== rel) {
      continue;
    }
    if (type && attributes.type !== type) {
      continue;
    }
    return attributes.href ?? null;
  }

  return null;
}

function collectSelfClosingAttribute(xml: string, tagName: string, attribute: string): string[] {
  return collectSelfClosingAttributes(xml, tagName)
    .map((attributes) => attributes[attribute])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function readSelfClosingAttribute(xml: string, tagName: string, attribute: string): string | null {
  return collectSelfClosingAttribute(xml, tagName, attribute)[0] ?? null;
}

function collectSelfClosingAttributes(xml: string, tagName: string): Array<Record<string, string>> {
  const attributes: Array<Record<string, string>> = [];
  const openingTag = `<${tagName}`;
  let searchFrom = 0;

  while (searchFrom < xml.length) {
    const openingStart = xml.indexOf(openingTag, searchFrom);
    if (openingStart < 0) {
      break;
    }

    const tagEnd = xml.indexOf(">", openingStart);
    if (tagEnd < 0) {
      break;
    }

    const tag = xml.slice(openingStart + openingTag.length, tagEnd);
    attributes.push(readAttributes(tag));
    searchFrom = tagEnd + 1;
  }

  return attributes;
}

function readAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;

  while (index < source.length) {
    while (source[index] === " " || source[index] === "/" || source[index] === "\n") {
      index += 1;
    }

    const equalsIndex = source.indexOf("=", index);
    if (equalsIndex < 0) {
      break;
    }

    const key = source.slice(index, equalsIndex).trim();
    const quote = source[equalsIndex + 1];
    if (quote !== '"' && quote !== "'") {
      break;
    }

    const valueStart = equalsIndex + 2;
    const valueEnd = source.indexOf(quote, valueStart);
    if (valueEnd < 0) {
      break;
    }

    attributes[key] = decodeXml(source.slice(valueStart, valueEnd));
    index = valueEnd + 1;
  }

  return attributes;
}

function extractArxivId(source: string): {
  id: string;
  baseId: string;
  version: number | null;
} {
  const pathOnly = stripQueryAndFragment(source.trim());
  const absMarker = "/abs/";
  const absIndex = pathOnly.indexOf(absMarker);
  const oaiMarker = "arXiv.org:";
  const oaiIndex = pathOnly.indexOf(oaiMarker);
  const rawId =
    absIndex >= 0
      ? pathOnly.slice(absIndex + absMarker.length)
      : oaiIndex >= 0
        ? pathOnly.slice(oaiIndex + oaiMarker.length)
        : lastPathSegment(pathOnly);
  const versionMarkerIndex = rawId.lastIndexOf("v");
  const versionText = versionMarkerIndex > 0 ? rawId.slice(versionMarkerIndex + 1) : "";
  const version = versionText.length > 0 ? Number(versionText) : Number.NaN;

  if (Number.isInteger(version)) {
    return {
      id: rawId,
      baseId: rawId.slice(0, versionMarkerIndex),
      version,
    };
  }

  return {
    id: rawId,
    baseId: rawId,
    version: null,
  };
}

function stripQueryAndFragment(value: string): string {
  let endIndex = value.length;
  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0 && queryIndex < endIndex) {
    endIndex = queryIndex;
  }

  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0 && hashIndex < endIndex) {
    endIndex = hashIndex;
  }

  return value.slice(0, endIndex);
}

function lastPathSegment(value: string): string {
  let endIndex = value.length;
  while (endIndex > 0 && value[endIndex - 1] === "/") {
    endIndex -= 1;
  }

  const slashIndex = value.lastIndexOf("/", endIndex - 1);
  return slashIndex >= 0 ? value.slice(slashIndex + 1, endIndex) : value.slice(0, endIndex);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  const items = value.map((item) => readString(item, fieldName));
  if (items.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return items;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalSortBy(value: unknown): ArxivSortBy | undefined {
  return value === "relevance" || value === "lastUpdatedDate" || value === "submittedDate" ? value : undefined;
}

function readOptionalSortOrder(value: unknown): ArxivSortOrder | undefined {
  return value === "ascending" || value === "descending" ? value : undefined;
}

function normalizeWhitespace(value: string): string {
  let normalized = "";
  let previousWasWhitespace = true;

  for (const character of value) {
    if (character.trim().length === 0) {
      if (!previousWasWhitespace) {
        normalized += " ";
        previousWasWhitespace = true;
      }
      continue;
    }

    normalized += character;
    previousWasWhitespace = false;
  }

  return normalized.trim();
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function mapArxivError(response: Response, body: string): ProviderRequestError {
  const message = normalizeWhitespace(body).slice(0, 300) || `arxiv returned HTTP ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}
